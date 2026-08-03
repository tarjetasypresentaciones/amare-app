-- ============================================================
-- AMARÉ · Esquema de base de datos (Supabase / PostgreSQL)
-- ============================================================
-- Ejecutar completo en: Supabase Dashboard > SQL Editor > New query

-- Extensión para generar UUIDs
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- 1. MANICURISTAS
-- ------------------------------------------------------------
create table if not exists manicuristas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  porcentaje_default numeric(5,2) not null default 50.00, -- % que recibe por defecto
  color text not null default '#8E3B46', -- color identificador en la UI
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 2. PERFILES (vincula un usuario de auth.users a un rol)
-- ------------------------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre_completo text not null,
  role text not null check (role in ('admin','manicurista')),
  manicurista_id uuid references manicuristas(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 3. TIPOS DE SERVICIO (catálogo, opcional pero útil)
-- ------------------------------------------------------------
create table if not exists tipos_servicio (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  precio_sugerido numeric(10,2),
  activo boolean not null default true
);

-- ------------------------------------------------------------
-- 4. REGISTROS DE SERVICIOS (el corazón de la app)
-- ------------------------------------------------------------
create table if not exists registros_servicios (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default current_date,
  manicurista_id uuid not null references manicuristas(id),
  cliente_nombre text,
  tipo_servicio text not null,
  costo numeric(10,2) not null check (costo >= 0),
  porcentaje numeric(5,2) not null check (porcentaje >= 0 and porcentaje <= 100),
  pagado_manicurista numeric(10,2) generated always as (round(costo * porcentaje / 100, 2)) stored,
  metodo_pago text not null default 'efectivo' check (metodo_pago in ('efectivo','tarjeta','transferencia','otro')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_registros_fecha on registros_servicios(fecha);
create index if not exists idx_registros_manicurista on registros_servicios(manicurista_id);

-- ------------------------------------------------------------
-- 5. CONFIGURACIÓN GENERAL (switches de la app)
-- ------------------------------------------------------------
create table if not exists configuracion (
  id int primary key default 1,
  requiere_confirmacion_cierre boolean not null default false,
  constraint solo_una_fila check (id = 1)
);
insert into configuracion (id, requiere_confirmacion_cierre)
  values (1, false) on conflict (id) do nothing;

-- ------------------------------------------------------------
-- 6. CIERRES DE CAJA (uno por día)
-- ------------------------------------------------------------
create table if not exists cierres_caja (
  id uuid primary key default gen_random_uuid(),
  fecha date not null unique,
  total_ingresos numeric(10,2) not null default 0,
  total_pagado_manicuristas numeric(10,2) not null default 0,
  total_neto_spa numeric(10,2) not null default 0,
  cantidad_servicios int not null default 0,
  estado text not null default 'auto_confirmado' check (estado in ('pendiente','auto_confirmado','confirmado')),
  confirmado_por uuid references auth.users(id),
  confirmado_at timestamptz,
  notas text,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 7. FUNCIÓN: generar / recalcular el cierre de un día
-- ------------------------------------------------------------
create or replace function generar_cierre_dia(p_fecha date)
returns cierres_caja
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ingresos numeric(10,2);
  v_pagado numeric(10,2);
  v_cantidad int;
  v_requiere boolean;
  v_estado text;
  v_result cierres_caja;
begin
  select coalesce(sum(costo),0), coalesce(sum(pagado_manicurista),0), count(*)
    into v_ingresos, v_pagado, v_cantidad
    from registros_servicios where fecha = p_fecha;

  select requiere_confirmacion_cierre into v_requiere from configuracion where id = 1;

  v_estado := case when v_requiere then 'pendiente' else 'auto_confirmado' end;

  insert into cierres_caja (fecha, total_ingresos, total_pagado_manicuristas, total_neto_spa, cantidad_servicios, estado)
  values (p_fecha, v_ingresos, v_pagado, v_ingresos - v_pagado, v_cantidad, v_estado)
  on conflict (fecha) do update set
    total_ingresos = excluded.total_ingresos,
    total_pagado_manicuristas = excluded.total_pagado_manicuristas,
    total_neto_spa = excluded.total_neto_spa,
    cantidad_servicios = excluded.cantidad_servicios,
    estado = case when cierres_caja.estado = 'confirmado' then cierres_caja.estado else excluded.estado end
  returning * into v_result;

  return v_result;
end;
$$;

-- Confirmar manualmente un cierre pendiente (solo admin, ver RLS más abajo)
create or replace function confirmar_cierre(p_fecha date)
returns cierres_caja
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result cierres_caja;
begin
  update cierres_caja
    set estado = 'confirmado', confirmado_por = auth.uid(), confirmado_at = now()
    where fecha = p_fecha
  returning * into v_result;
  return v_result;
end;
$$;

-- Recalcular automáticamente el cierre del día cada vez que se guarda un registro
create or replace function trg_recalcular_cierre()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform generar_cierre_dia(coalesce(new.fecha, old.fecha));
  return coalesce(new, old);
end;
$$;

drop trigger if exists recalcular_cierre_on_change on registros_servicios;
create trigger recalcular_cierre_on_change
after insert or update or delete on registros_servicios
for each row execute function trg_recalcular_cierre();

-- ------------------------------------------------------------
-- 8. FUNCIÓN AUXILIAR: rol del usuario autenticado
-- ------------------------------------------------------------
create or replace function mi_rol()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function mi_manicurista_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select manicurista_id from profiles where id = auth.uid();
$$;

-- ------------------------------------------------------------
-- 9. ROW LEVEL SECURITY — nadie entra si no está autenticado,
--    y cada quien ve solo lo que le corresponde.
-- ------------------------------------------------------------
alter table manicuristas enable row level security;
alter table profiles enable row level security;
alter table tipos_servicio enable row level security;
alter table registros_servicios enable row level security;
alter table cierres_caja enable row level security;
alter table configuracion enable row level security;

-- profiles: cada quien lee su propio perfil; admin lee todos
create policy "profiles_select" on profiles for select
  using (id = auth.uid() or mi_rol() = 'admin');
create policy "profiles_admin_todo" on profiles for all
  using (mi_rol() = 'admin') with check (mi_rol() = 'admin');

-- manicuristas: cualquier usuario autenticado puede ver la lista (para selects en formularios);
-- solo admin puede crear/editar/borrar
create policy "manicuristas_select" on manicuristas for select
  using (auth.role() = 'authenticated');
create policy "manicuristas_admin_write" on manicuristas for insert
  with check (mi_rol() = 'admin');
create policy "manicuristas_admin_update" on manicuristas for update
  using (mi_rol() = 'admin') with check (mi_rol() = 'admin');
create policy "manicuristas_admin_delete" on manicuristas for delete
  using (mi_rol() = 'admin');

-- tipos_servicio: todos leen, solo admin escribe
create policy "tipos_select" on tipos_servicio for select
  using (auth.role() = 'authenticated');
create policy "tipos_admin_write" on tipos_servicio for insert
  with check (mi_rol() = 'admin');
create policy "tipos_admin_update" on tipos_servicio for update
  using (mi_rol() = 'admin') with check (mi_rol() = 'admin');
create policy "tipos_admin_delete" on tipos_servicio for delete
  using (mi_rol() = 'admin');

-- registros_servicios: admin ve/edita todo. Manicurista solo ve y crea LOS SUYOS.
create policy "registros_admin_todo" on registros_servicios for all
  using (mi_rol() = 'admin') with check (mi_rol() = 'admin');
create policy "registros_manicurista_select" on registros_servicios for select
  using (mi_rol() = 'manicurista' and manicurista_id = mi_manicurista_id());
create policy "registros_manicurista_insert" on registros_servicios for insert
  with check (mi_rol() = 'manicurista' and manicurista_id = mi_manicurista_id());

-- cierres_caja: admin todo; manicurista puede ver los cierres (montos globales del día), no editarlos
create policy "cierres_admin_todo" on cierres_caja for all
  using (mi_rol() = 'admin') with check (mi_rol() = 'admin');
create policy "cierres_manicurista_select" on cierres_caja for select
  using (mi_rol() = 'manicurista');

-- configuracion: solo admin
create policy "config_admin_todo" on configuracion for all
  using (mi_rol() = 'admin') with check (mi_rol() = 'admin');
create policy "config_select_all" on configuracion for select
  using (auth.role() = 'authenticated');

-- ------------------------------------------------------------
-- 10. (Opcional) Cierre automático diario a las 23:59
-- ------------------------------------------------------------
-- Requiere activar la extensión "pg_cron" en Database > Extensions.
-- Descomenta y ejecuta esto después de activarla:
--
-- select cron.schedule(
--   'cierre-diario-amare',
--   '59 23 * * *',
--   $$ select generar_cierre_dia(current_date); $$
-- );
