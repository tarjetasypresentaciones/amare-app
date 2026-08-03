# Amaré · App de servicios y pagos a manicuristas

App web responsive (funciona igual de bien en celular) para registrar los
servicios que realiza cada manicurista, calcular automáticamente cuánto se
le paga, y ver dashboards de ingresos por semana, mes y manicurista, con
cierre de caja diario.

**Costo de operación: $0/mes**, usando las capas gratuitas de Supabase
(base de datos + autenticación) y Vercel (hosting). Alcanza de sobra para
4 manicuristas y 3 administradores, y escala sin cambiar de plan hasta un
volumen mucho mayor.

## 1. Cómo está construida

- **Frontend:** React + Vite, responsive (móvil y escritorio), sin costo.
- **Base de datos + autenticación:** [Supabase](https://supabase.com)
  (Postgres real, gratis hasta 500 MB de base de datos y 50,000 usuarios
  activos al mes — muy por encima de lo que este spa necesita).
- **Seguridad:** cada tabla tiene *Row Level Security* (RLS) activada.
  Una manicurista **solo puede ver y crear sus propios registros**; solo
  las administradoras pueden ver todo, gestionar el equipo y confirmar
  cierres de caja. Nadie sin sesión puede leer nada.
- **Hosting:** [Vercel](https://vercel.com), capa gratuita (más que
  suficiente para este tráfico). Si prefieres no usar Vercel, el build es
  un sitio estático (`npm run build`) que también corre en Netlify o
  Cloudflare Pages gratis.

## 2. Crear el proyecto en Supabase (una sola vez)

1. Crea una cuenta gratis en [supabase.com](https://supabase.com) y un
   nuevo proyecto (elige una contraseña de base de datos y guárdala).
2. Ve a **SQL Editor → New query**, pega todo el contenido de
   `supabase/schema.sql` y ejecútalo. Esto crea las
   tablas, la seguridad (RLS) y las funciones de cierre de caja.
3. Ve a **Project Settings → API** y copia:
   - `Project URL` → lo usarás como `VITE_SUPABASE_URL`
   - `anon public key` → lo usarás como `VITE_SUPABASE_ANON_KEY`
   (Esta llave "anon" es segura de exponer en el frontend: la seguridad
   real la hace RLS en la base de datos, no la llave.)

### Crear las administradoras y manicuristas (usuarios reales con clave)

1. Ve a **Authentication → Users → Add user** y crea una cuenta por cada
   administradora (correo + contraseña). Repite para cada manicurista.
2. Ve a **Table Editor → manicuristas** y agrega una fila por cada
   manicurista (nombre, % por defecto) — esto también se puede hacer
   luego desde la app en la pestaña **Equipo**.
3. Ve a **Table Editor → profiles** y por cada usuario que creaste en el
   paso 1, agrega una fila:
   - `id`: copia el UUID del usuario (lo ves en Authentication → Users)
   - `nombre_completo`: su nombre
   - `role`: `admin` o `manicurista`
   - `manicurista_id`: si es manicurista, el UUID de su fila en la tabla
     `manicuristas`; si es admin, déjalo vacío.

   Esto vincula el login con su rol y con "de quién son los datos". A
   partir de ahí, cada quien inicia sesión con su correo y contraseña.

> Cuando el spa crezca, repite estos 3 pasos para cada manicurista nueva
> (crear su usuario en Authentication, y su fila en `profiles`) — la tabla
> `manicuristas` ya se puede administrar directo desde la app.

## 3. Ejecutar en tu computador (opcional, para probar antes de publicar)

```bash
npm install
cp .env.example .env   # y pega ahí tu URL y anon key de Supabase
npm run dev
```

Abre `http://localhost:5173`.

## 4. Publicar en la nube (gratis) con Vercel

1. Sube esta carpeta a un repositorio de GitHub (puedes arrastrar los
   archivos directamente en github.com si no usas git desde la terminal).
2. Entra a [vercel.com](https://vercel.com), inicia sesión con GitHub y
   elige **Add New → Project**, seleccionando ese repositorio.
3. Vercel detecta automáticamente que es un proyecto Vite. Antes de darle
   a **Deploy**, agrega las variables de entorno (sección
   *Environment Variables*):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Dale **Deploy**. En un par de minutos tendrás una URL pública tipo
   `https://amare-app.vercel.app` — esa es la que compartes con tu equipo.
5. (Opcional) En **Project Settings → Domains** puedes conectar un
   dominio propio, por ejemplo `app.amare.com`, sin costo adicional de
   Vercel (solo lo que cueste el dominio, si aún no tienes uno).

Cada vez que quieras actualizar la app, subes los cambios al repositorio
y Vercel vuelve a publicar automáticamente.

## 5. Cómo funciona el cierre de caja

- Cada vez que se guarda un servicio, la base de datos **recalcula sola**
  el cierre del día correspondiente (ingresos, pagado a manicuristas, neto
  del spa).
- En la pestaña **Cierre** (solo admin) hay un interruptor: "Requerir
  confirmación manual del cierre".
  - **Apagado** (por defecto): el cierre queda automáticamente
    cerrado al calcularse.
  - **Encendido**: el cierre queda en estado "pendiente" hasta que una
    admin entra y pulsa "Confirmar cierre" — útil si quieres que alguien
    revise las cifras antes de darlas por definitivas.
- Si quieres que el cierre del día se genere solo, sin que nadie entre a
  la app, al final de `supabase/schema.sql` hay instrucciones para activar
  la extensión `pg_cron` (gratis en Supabase) y programarlo a las 11:59 pm.

## 6. Seguridad — qué protege esta app

- Nadie entra sin correo y contraseña válidos (autenticación de Supabase,
  con hash seguro de contraseñas, ya incluido).
- Row Level Security en **todas** las tablas: una manicurista nunca puede
  leer ni modificar los registros de otra, ni ver el panel financiero
  general, aunque intente llamar directamente a la base de datos.
- La llave usada en el frontend (`anon key`) no da acceso de administrador
  a la base de datos — todos los permisos reales están en las políticas
  RLS del servidor.
- Los montos "pagado a la manicurista" los calcula la base de datos
  (columna generada), no el navegador — así nadie puede manipular el
  número antes de guardarlo.

## 7. Estructura del proyecto

```
supabase/schema.sql       → todo el esquema de base de datos y seguridad
src/lib/                  → conexión a Supabase y manejo de sesión/rol
src/pages/
  Login.jsx                → inicio de sesión
  RegistrarServicio.jsx    → formulario para anotar un servicio
  Historial.jsx            → historial filtrable (solo admin)
  PanelAdmin.jsx           → dashboard de ingresos (solo admin)
  MisIngresos.jsx          → vista de ingresos propios (manicurista)
  Equipo.jsx               → alta/edición de manicuristas (solo admin)
  CierreCaja.jsx           → cierre de caja diario (solo admin)
```
