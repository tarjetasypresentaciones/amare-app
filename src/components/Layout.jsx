import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import Avatar from './Avatar'

const ICONS = {
  registrar: '💅',
  historial: '📋',
  panel: '📊',
  equipo: '👥',
  clientes: '📇',
  servicios: '🏷️',
  cierre: '🗓️',
  calendario: '📅',
}

export default function Layout({ children }) {
  const { profile, isAdmin, signOut } = useAuth()
  const navigate = useNavigate()

  const links = isAdmin
    ? [
        { to: '/registrar', label: 'Registrar', icon: ICONS.registrar },
        { to: '/calendario', label: 'Calendario', icon: ICONS.calendario },
        { to: '/panel', label: 'Panel', icon: ICONS.panel },
        { to: '/historial', label: 'Historial', icon: ICONS.historial },
        { to: '/clientes', label: 'Clientes', icon: ICONS.clientes },
        { to: '/servicios-manicurista', label: 'Servicios', icon: ICONS.servicios },
        { to: '/equipo', label: 'Equipo', icon: ICONS.equipo },
        { to: '/cierre', label: 'Cierre', icon: ICONS.cierre },
      ]
    : [
        { to: '/mis-ingresos', label: 'Mis ingresos', icon: ICONS.panel },
        { to: '/mi-calendario', label: 'Mi calendario', icon: ICONS.calendario },
      ]

  const handleSignOut = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row" style={{ background: 'var(--color-bg)' }}>
      {/* Barra lateral — escritorio */}
      <aside
        className="hidden md:flex md:flex-col md:w-64 md:shrink-0 border-r"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
      >
        <div className="px-6 pt-8 pb-6">
          <h1 className="font-display italic text-3xl" style={{ color: 'var(--color-primary)' }}>
            Amaré
          </h1>
          <p className="text-xs mt-1 tracking-wide uppercase" style={{ color: 'var(--color-text-muted)' }}>
            Panel de servicios
          </p>
        </div>
        <nav className="flex-1 px-3 space-y-1">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  isActive ? 'text-white' : 'hover:bg-black/5'
                }`
              }
              style={({ isActive }) => ({
                background: isActive ? 'var(--color-primary)' : 'transparent',
                color: isActive ? '#fff' : 'var(--color-text)',
              })}
            >
              <span aria-hidden="true">{l.icon}</span>
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-4 py-5 border-t flex items-center gap-3" style={{ borderColor: 'var(--color-border)' }}>
          {!isAdmin && <Avatar url={profile?.manicuristas?.foto_url} nombre={profile?.nombre_completo} size={36} />}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{profile?.nombre_completo}</p>
            <p className="text-xs mb-2" style={{ color: 'var(--color-text-muted)' }}>
              {isAdmin ? 'Administradora/or' : 'Manicurista'}
            </p>
            <button
              onClick={handleSignOut}
              className="text-sm font-medium"
              style={{ color: 'var(--color-danger)' }}
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      </aside>

      {/* Encabezado móvil */}
      <header
        className="md:hidden flex items-center justify-between px-4 py-3 border-b sticky top-0 z-10"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
      >
        <h1 className="font-display italic text-2xl" style={{ color: 'var(--color-primary)' }}>
          Amaré
        </h1>
        <div className="flex items-center gap-3">
          {!isAdmin && <Avatar url={profile?.manicuristas?.foto_url} nombre={profile?.nombre_completo} size={32} />}
          <button onClick={handleSignOut} className="text-sm font-medium" style={{ color: 'var(--color-danger)' }}>
            Salir
          </button>
        </div>
      </header>

      <main className="flex-1 pb-24 md:pb-8 px-4 md:px-8 pt-5 md:pt-8 max-w-6xl w-full mx-auto">
        {children}
      </main>

      {/* Barra inferior — móvil */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 border-t flex justify-around py-2 z-10"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
      >
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            className="flex flex-col items-center text-[11px] gap-0.5 px-2 py-1"
          >
            {({ isActive }) => (
              <>
                <span style={{ fontSize: '1.2rem' }}>{l.icon}</span>
                <span style={{ color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)', fontWeight: isActive ? 600 : 500 }}>
                  {l.label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
