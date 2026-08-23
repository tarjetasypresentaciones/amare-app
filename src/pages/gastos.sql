-- ============================================================
-- AMARÉ · Módulo de Gastos y egresos
-- ============================================================
-- Ejecutar completo en: Supabase Dashboard > SQL Editor > New query
-- Este archivo NO se sube a GitHub. Solo se corre aquí en Supabase.

-- ------------------------------------------------------------
-- 1. CATEGORÍAS DE GASTO (catálogo editable a futuro)
-- ------------------------------------------------------------
create table if not exists categorias_gasto (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  activo boolean not null default true,
  orden int not null default 0,
  created_at timestamptz not null default now()
);

insert into categorias_gasto (nombre, orden) values
  ('Insumos', 1),
  ('Servicios públicos', 2),
  ('Arriendo', 3),
  ('Nómina', 4),
  ('Mantenimiento', 5),
  ('Papelería y aseo administrativo', 6),
  ('Marketing y publicidad', 7),
  ('Transporte', 8),
  ('Otros', 9)
on conflict (nombre) do nothing;

-- ------------------------------------------------------------
-- 2. GASTOS (cada egreso registrado)
-- ------------------------------------------------------------
create table if not exists gastos (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default current_date,
  categoria_id uuid not null references categorias_gasto(id),
  concepto text not null,
  valor numeric(10,2) not null check (valor > 0),
  foto_url text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_gastos_fecha on gastos(fecha);
create index if not exists idx_gastos_categoria on gastos(categoria_id);

-- ------------------------------------------------------------
-- 3. Recalcular el cierre del día también cuando cambian los gastos
--    (se actualiza la función generar_cierre_dia para restar los
--    gastos del día del Neto spa, y se agrega un trigger sobre gastos)
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
  v_gastos numeric(10,2);
  v_cantidad int;
  v_requiere boolean;
  v_estado text;
  v_result cierres_caja;
begin
  select coalesce(sum(costo),0), coalesce(sum(pagado_manicurista),0), count(*)
    into v_ingresos, v_pagado, v_cantidad
    from registros_servicios where fecha = p_fecha;

  select coalesce(sum(valor),0) into v_gastos
    from gastos where fecha = p_fecha;

  select requiere_confirmacion_cierre into v_requiere from configuracion where id = 1;

  v_estado := case when v_requiere then 'pendiente' else 'auto_confirmado' end;

  insert into cierres_caja (fecha, total_ingresos, total_pagado_manicuristas, total_gastos, total_neto_spa, cantidad_servicios, estado)
  values (p_fecha, v_ingresos, v_pagado, v_gastos, v_ingresos - v_pagado - v_gastos, v_cantidad, v_estado)
  on conflict (fecha) do update set
    total_ingresos = excluded.total_ingresos,
    total_pagado_manicuristas = excluded.total_pagado_manicuristas,
    total_gastos = excluded.total_gastos,
    total_neto_spa = excluded.total_neto_spa,
    cantidad_servicios = excluded.cantidad_servicios,
    estado = case when cierres_caja.estado = 'confirmado' then cierres_caja.estado else excluded.estado end
  returning * into v_result;

  return v_result;
end;
$$;

-- Nueva columna en cierres_caja para guardar el total de gastos del día
alter table cierres_caja add column if not exists total_gastos numeric(10,2) not null default 0;

-- Trigger: recalcular el cierre del día cuando se crea, edita o borra un gasto
create or replace function trg_recalcular_cierre_por_gasto()
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

drop trigger if exists recalcular_cierre_on_gasto on gastos;
create trigger recalcular_cierre_on_gasto
after insert or update or delete on gastos
for each row execute function trg_recalcular_cierre_por_gasto();

-- ------------------------------------------------------------
-- 4. ROW LEVEL SECURITY — solo administradores ven y usan Gastos
-- ------------------------------------------------------------
alter table categorias_gasto enable row level security;
alter table gastos enable row level security;

-- categorias_gasto: solo admin lee y escribe
create policy "categorias_gasto_admin_todo" on categorias_gasto for all
  using (mi_rol() = 'admin') with check (mi_rol() = 'admin');

-- gastos: solo admin lee y escribe
create policy "gastos_admin_todo" on gastos for all
  using (mi_rol() = 'admin') with check (mi_rol() = 'admin');

-- ------------------------------------------------------------
-- 5. STORAGE — bucket para las fotos de recibos y facturas de gastos
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('fotos-gastos', 'fotos-gastos', true)
on conflict (id) do nothing;

create policy "fotos_gastos_lectura_publica" on storage.objects for select
  using (bucket_id = 'fotos-gastos');

create policy "fotos_gastos_admin_sube" on storage.objects for insert
  with check (bucket_id = 'fotos-gastos' and mi_rol() = 'admin');

create policy "fotos_gastos_admin_actualiza" on storage.objects for update
  using (bucket_id = 'fotos-gastos' and mi_rol() = 'admin');

create policy "fotos_gastos_admin_borra" on storage.objects for delete
  using (bucket_id = 'fotos-gastos' and mi_rol() = 'admin');
