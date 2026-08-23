import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/AuthContext'
import { todayISO } from '../utils/format'

// Hora límite: 10:30 a.m. (hora del computador donde se usa la app).
const HORA_LIMITE = 10
const MINUTO_LIMITE = 30
const REVISAR_CADA_MS = 5 * 60 * 1000 // 5 minutos
const SNOOZE_MINUTOS = 30
const SNOOZE_KEY = 'amare_apertura_snooze_hasta'

const yaPasoLaHoraLimite = () => {
  const ahora = new Date()
  return (
    ahora.getHours() > HORA_LIMITE ||
    (ahora.getHours() === HORA_LIMITE && ahora.getMinutes() >= MINUTO_LIMITE)
  )
}

const snoozeActivo = () => {
  const hasta = Number(localStorage.getItem(SNOOZE_KEY) || 0)
  return Date.now() < hasta
}

/**
 * Alerta global (para admin y empleado_admin) que avisa si, pasadas las
 * 10:30 a.m., aún no se ha guardado el efectivo de apertura del día.
 * Vive dentro de Layout, así que aparece sin importar en qué pantalla
 * esté la persona. Usa la función obtener_cierre_efectivo (en vez de
 * leer la tabla cierres_caja directo) para que también funcione para
 * empleado_admin, que no tiene acceso de lectura a esa tabla completa.
 */
export default function AlertaAperturaCaja() {
  const navigate = useNavigate()
  const location = useLocation()
  const { isEmpleadoAdmin } = useAuth()
  const [mostrar, setMostrar] = useState(false)

  const rutaCierre = isEmpleadoAdmin ? '/cierre-efectivo' : '/cierre'

  const verificar = async () => {
    // Ya está en la pantalla de cierre correspondiente: no interrumpir ahí.
    if (location.pathname === '/cierre' || location.pathname === '/cierre-efectivo') {
      setMostrar(false)
      return
    }
    if (!yaPasoLaHoraLimite() || snoozeActivo()) {
      setMostrar(false)
      return
    }
    const { data } = await supabase.rpc('obtener_cierre_efectivo', { p_fecha: todayISO() })
    const fila = Array.isArray(data) ? data[0] : data
    setMostrar(fila?.efectivo_apertura == null)
  }

  useEffect(() => {
    verificar()
    const interval = setInterval(verificar, REVISAR_CADA_MS)
    return () => clearInterval(interval)
  }, [location.pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  const recordarMasTarde = () => {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MINUTOS * 60 * 1000))
    setMostrar(false)
  }

  const irACierre = () => {
    setMostrar(false)
    navigate(rutaCierre)
  }

  if (!mostrar) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(45,34,48,0.55)' }}
    >
      <div className="card w-full max-w-sm p-5 text-center space-y-3" style={{ background: 'var(--color-surface)' }}>
        <p className="text-3xl">⏰</p>
        <p className="font-display text-lg">Falta contar la caja</p>
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Debes contar y colocar el efectivo que hay en caja en Cierre de caja → Efectivo en caja apertura.
        </p>
        <div className="flex flex-col gap-2 pt-1">
          <button
            type="button"
            onClick={irACierre}
            className="rounded-lg py-2.5 text-sm font-semibold text-white"
            style={{ background: 'var(--color-primary)' }}
          >
            Ir a Cierre de caja
          </button>
          <button
            type="button"
            onClick={recordarMasTarde}
            className="rounded-lg py-2 text-sm font-medium"
            style={{ border: '1px solid var(--color-border)' }}
          >
            Recordarme en 30 minutos
          </button>
        </div>
      </div>
    </div>
  )
}
