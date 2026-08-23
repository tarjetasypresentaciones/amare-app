import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import RegistrarServicio from './pages/RegistrarServicio'
import Historial from './pages/Historial'
import PanelAdmin from './pages/PanelAdmin'
import MisIngresos from './pages/MisIngresos'
import Equipo from './pages/Equipo'
import CierreCaja from './pages/CierreCaja'
import CierreEfectivo from './pages/CierreEfectivo'
import Clientes from './pages/Clientes'
import ServiciosManicurista from './pages/ServiciosManicurista'
import TiposServicio from './pages/TiposServicio'
import CalendarioAdmin from './pages/CalendarioAdmin'
import MiCalendario from './pages/MiCalendario'
import Gastos from './pages/Gastos'

const homePathForRole = (role) => {
  if (role === 'admin' || role === 'empleado_admin') return '/registrar'
  return '/mis-ingresos'
}

// allowedRoles: lista de roles que pueden entrar. Sin la prop, cualquier
// usuario autenticado puede entrar (rutas compartidas por todos los roles).
function Protected({ children, allowedRoles }) {
  const { session, profile, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ color: 'var(--color-text-muted)' }}>
        Cargando…
      </div>
    )
  }
  if (!session) return <Navigate to="/login" state={{ from: location.pathname }} replace />
  const homePath = homePathForRole(profile?.role)
  if (allowedRoles && !allowedRoles.includes(profile?.role)) return <Navigate to={homePath} replace />

  return <Layout>{children}</Layout>
}

function AppRoutes() {
  const { profile } = useAuth()
  const homePath = homePathForRole(profile?.role)

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/registrar" element={<Protected allowedRoles={['admin', 'empleado_admin']}><RegistrarServicio /></Protected>} />
      <Route path="/calendario" element={<Protected allowedRoles={['admin', 'empleado_admin']}><CalendarioAdmin /></Protected>} />
      <Route path="/mi-calendario" element={<Protected><MiCalendario /></Protected>} />
      <Route path="/historial" element={<Protected allowedRoles={['admin']}><Historial /></Protected>} />
      <Route path="/panel" element={<Protected allowedRoles={['admin']}><PanelAdmin /></Protected>} />
      <Route path="/equipo" element={<Protected allowedRoles={['admin']}><Equipo /></Protected>} />
      <Route path="/clientes" element={<Protected allowedRoles={['admin', 'empleado_admin']}><Clientes /></Protected>} />
      <Route path="/servicios-manicurista" element={<Protected allowedRoles={['admin']}><ServiciosManicurista /></Protected>} />
      <Route path="/tipos-servicio" element={<Protected allowedRoles={['admin']}><TiposServicio /></Protected>} />
      <Route path="/cierre" element={<Protected allowedRoles={['admin']}><CierreCaja /></Protected>} />
      <Route path="/cierre-efectivo" element={<Protected allowedRoles={['admin', 'empleado_admin']}><CierreEfectivo /></Protected>} />
      <Route path="/gastos" element={<Protected allowedRoles={['admin', 'empleado_admin']}><Gastos /></Protected>} />
      <Route path="/mis-ingresos" element={<Protected allowedRoles={['manicurista']}><MisIngresos /></Protected>} />
      <Route path="*" element={<Navigate to={homePath} replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
