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
import Clientes from './pages/Clientes'
import ServiciosManicurista from './pages/ServiciosManicurista'
import CalendarioAdmin from './pages/CalendarioAdmin'
import MiCalendario from './pages/MiCalendario'

function Protected({ children, adminOnly = false }) {
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
  const homePath = profile?.role === 'admin' ? '/registrar' : '/mis-ingresos'
  if (adminOnly && profile?.role !== 'admin') return <Navigate to={homePath} replace />

  return <Layout>{children}</Layout>
}

function AppRoutes() {
  const { profile } = useAuth()
  const homePath = profile?.role === 'admin' ? '/registrar' : '/mis-ingresos'

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/registrar" element={<Protected adminOnly><RegistrarServicio /></Protected>} />
      <Route path="/calendario" element={<Protected adminOnly><CalendarioAdmin /></Protected>} />
      <Route path="/mi-calendario" element={<Protected><MiCalendario /></Protected>} />
      <Route path="/historial" element={<Protected adminOnly><Historial /></Protected>} />
      <Route path="/panel" element={<Protected adminOnly><PanelAdmin /></Protected>} />
      <Route path="/equipo" element={<Protected adminOnly><Equipo /></Protected>} />
      <Route path="/clientes" element={<Protected adminOnly><Clientes /></Protected>} />
      <Route path="/servicios-manicurista" element={<Protected adminOnly><ServiciosManicurista /></Protected>} />
      <Route path="/cierre" element={<Protected adminOnly><CierreCaja /></Protected>} />
      <Route path="/mis-ingresos" element={<Protected><MisIngresos /></Protected>} />
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
