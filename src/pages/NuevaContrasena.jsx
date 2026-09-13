import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import logoAmare from '../assets/logo-amare.png'
import './Login.css'

// Pantalla a la que llega el usuario luego de abrir el link de "recuperar
// contraseña" del correo. Supabase ya crea una sesión temporal de
// recuperación (evento PASSWORD_RECOVERY, ver AuthContext) — aquí solo se
// le pide la contraseña nueva y se guarda con auth.updateUser().
export default function NuevaContrasena() {
  const { updatePassword, signOut } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [listo, setListo] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.')
      return
    }
    if (password !== confirmar) {
      setError('Las dos contraseñas no coinciden.')
      return
    }

    setLoading(true)
    const { error: err } = await updatePassword(password)
    setLoading(false)

    if (err) {
      setError('No se pudo actualizar la contraseña: ' + err.message)
      return
    }
    setListo(true)
  }

  const irAlLogin = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="login-stage">
      <div className="login-scrim" />
      <div className="login-content">
        <div className="login-logo-badge">
          <img src={logoAmare} alt="Amaré Atelier" />
        </div>

        <div className="login-panel">
          {listo ? (
            <>
              <h1>Contraseña actualizada</h1>
              <p className="login-sub">Ya puedes ingresar con tu contraseña nueva.</p>
              <button type="button" onClick={irAlLogin} className="login-btn">
                Ir a iniciar sesión
              </button>
            </>
          ) : (
            <form onSubmit={handleSubmit}>
              <h1>Crea tu contraseña nueva</h1>
              <p className="login-sub">Escríbela dos veces para confirmar.</p>

              <div className="login-field">
                <label htmlFor="password">Contraseña nueva</label>
                <input
                  id="password"
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
              <div className="login-field">
                <label htmlFor="confirmar">Confirmar contraseña</label>
                <input
                  id="confirmar"
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={confirmar}
                  onChange={(e) => setConfirmar(e.target.value)}
                  placeholder="••••••••"
                />
              </div>

              {error && (
                <p role="alert" className="login-error">
                  {error}
                </p>
              )}

              <button type="submit" disabled={loading} className="login-btn">
                {loading ? 'Guardando…' : 'Guardar contraseña'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
