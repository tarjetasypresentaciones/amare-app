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
  if (adminOnly && profile?.role !== 'admin') return <Navigate to="/registrar" replace />

  return <Layout>{children}</Layout>
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/registrar" element={<Protected><RegistrarServicio /></Protected>} />
      <Route path="/historial" element={<Protected adminOnly><Historial /></Protected>} />
      <Route path="/panel" element={<Protected adminOnly><PanelAdmin /></Protected>} />
      <Route path="/equipo" element={<Protected adminOnly><Equipo /></Protected>} />
      <Route path="/cierre" element={<Protected adminOnly><CierreCaja /></Protected>} />
      <Route path="/mis-ingresos" element={<Protected><MisIngresos /></Protected>} />
      <Route path="*" element={<Navigate to="/registrar" replace />} />
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
