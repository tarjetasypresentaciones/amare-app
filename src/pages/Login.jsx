import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import logoAmare from '../assets/logo-amare.png'
import './Login.css'

// Fotos del local para el carrusel de fondo (public/login-bg/bg-01.jpg … bg-09.jpg)
const BG_IMAGES = Array.from({ length: 9 }, (_, i) => `/login-bg/bg-${String(i + 1).padStart(2, '0')}.jpg`)
const DISPLAY_MS = 1800

export default function Login() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [current, setCurrent] = useState(0)
  const timerRef = useRef(null)

  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReduced) return undefined
    timerRef.current = setInterval(() => {
      setCurrent((c) => (c + 1) % BG_IMAGES.length)
    }, DISPLAY_MS)
    return () => clearInterval(timerRef.current)
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await signIn(email.trim(), password)
    setLoading(false)
    if (error) {
      setError('Correo o contraseña incorrectos. Verifica e intenta de nuevo.')
      return
    }
    const dest = location.state?.from || '/registrar'
    navigate(dest, { replace: true })
  }

  return (
    <div className="login-stage">
      {BG_IMAGES.map((src, i) => (
        <div
          key={src}
          className={`login-bg-layer${i === current ? ' active' : ''}`}
          style={{ backgroundImage: `url(${src})` }}
        />
      ))}
      <div className="login-scrim" />

      <div className="login-content">
        <div className="login-logo-badge">
          <img src={logoAmare} alt="Amaré Atelier" />
        </div>

        <form onSubmit={handleSubmit} className="login-panel">
          <h1>Bienvenida de vuelta</h1>
          <p className="login-sub">Ingresa para registrar y consultar servicios</p>

          <div className="login-field">
            <label htmlFor="email">Correo</label>
            <input
              id="email"
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tunombre@amare.com"
            />
          </div>
          <div className="login-field">
            <label htmlFor="password">Contraseña</label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p role="alert" className="login-error">
              {error}
            </p>
          )}

          <button type="submit" disabled={loading} className="login-btn">
            {loading ? 'Ingresando…' : 'Ingresar'}
          </button>

          <p className="login-foot">
            ¿No tienes acceso? Pídele a un administrador que te cree una cuenta.
          </p>
        </form>
      </div>

      <div className="login-dots">
        {BG_IMAGES.map((src, i) => (
          <span key={src} className={i === current ? 'active' : ''} />
        ))}
      </div>
    </div>
  )
}
