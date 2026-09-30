import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import Avatar from '../components/Avatar'

// Pantalla solo para administradores: permite activar o desactivar el
// acceso a la app de los usuarios Empleado admin y Manicurista. Un
// usuario desactivado no puede iniciar sesión, y si tenía la sesión
// abierta se le cierra. La base de datos también le bloquea el acceso a
// los datos (ver funciones mi_rol / mi_manicurista_id).
const GRUPOS = [
  { role: 'empleado_admin', titulo: 'Empleado admin' },
  { role: 'manicurista', titulo: 'Manicuristas' },
]

export default function PerfilesActivos() {
  const [perfiles, setPerfiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(null) // id del perfil que se está guardando
  const [status, setStatus] = useState({ type: '', msg: '' })

  const cargar = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, nombre_completo, role, activo, manicuristas(foto_url)')
      .in('role', GRUPOS.map((g) => g.role))
      .order('nombre_completo')
    if (error) setStatus({ type: 'error', msg: 'No se pudieron cargar los perfiles: ' + error.message })
    setPerfiles(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    cargar()
  }, [])

  const cambiar = async (perfil) => {
    const nuevo = !perfil.activo
    setGuardando(perfil.id)
    setStatus({ type: '', msg: '' })
    const { error } = await supabase.from('profiles').update({ activo: nuevo }).eq('id', perfil.id)
    setGuardando(null)
    if (error) {
      setStatus({ type: 'error', msg: 'No se pudo guardar el cambio: ' + error.message })
      return
    }
    setPerfiles((ps) => ps.map((p) => (p.id === perfil.id ? { ...p, activo: nuevo } : p)))
    setStatus({
      type: 'success',
      msg: `${perfil.nombre_completo} quedó ${nuevo ? 'activo: ya puede entrar a la app' : 'desactivado: ya no puede entrar a la app'}.`,
    })
  }

  return (
    <div className="max-w-2xl">
      <h2 className="font-display text-2xl mb-1">Perfiles activos</h2>
      <p className="text-sm mb-6" style={{ color: 'var(--color-text-muted)' }}>
        Activa o desactiva quién puede entrar a la app. Un usuario desactivado no puede iniciar sesión, y si la tenía abierta se le cierra.
      </p>

      {status.msg && (
        <div
          className="rounded-lg px-4 py-3 mb-6 text-sm"
          style={{
            background: status.type === 'error' ? 'var(--color-danger-soft)' : 'var(--color-accent-soft)',
            color: status.type === 'error' ? 'var(--color-danger)' : 'var(--color-text)',
          }}
        >
          {status.msg}
        </div>
      )}

      {loading ? (
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Cargando…</p>
      ) : (
        GRUPOS.map((g) => {
          const lista = perfiles.filter((p) => p.role === g.role)
          return (
            <div key={g.role} className="card divide-y mb-6" style={{ borderColor: 'var(--color-border)' }}>
              <p className="px-4 py-3 text-sm font-semibold">{g.titulo}</p>
              {lista.length === 0 && (
                <p className="px-4 py-4 text-sm" style={{ color: 'var(--color-text-muted)' }}>
                  No hay usuarios con este perfil.
                </p>
              )}
              {lista.map((p) => {
                const activo = p.activo !== false
                return (
                  <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar url={p.manicuristas?.foto_url} nombre={p.nombre_completo} size={32} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate" style={{ opacity: activo ? 1 : 0.55 }}>
                          {p.nombre_completo}
                        </p>
                        <p className="text-xs" style={{ color: activo ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
                          {activo ? 'Activo' : 'Desactivado'}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={activo}
                      aria-label={`${activo ? 'Desactivar' : 'Activar'} a ${p.nombre_completo}`}
                      disabled={guardando === p.id}
                      onClick={() => cambiar({ ...p, activo })}
                      className="w-11 h-6 rounded-full relative shrink-0 transition-colors cursor-pointer border disabled:opacity-60"
                      style={{
                        background: activo ? 'var(--color-primary)' : '#D9D2D4',
                        borderColor: activo ? 'var(--color-primary)' : '#D9D2D4',
                      }}
                    >
                      <span
                        className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all"
                        style={{ left: activo ? '1.5rem' : '0.2rem' }}
                      />
                    </button>
                  </div>
                )
              })}
            </div>
          )
        })
      )}
    </div>
  )
}
