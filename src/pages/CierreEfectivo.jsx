import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/AuthContext'
import { currency, longDate, dateTimeShort, todayISO, addDaysISO } from '../utils/format'

/**
 * Versión reducida de Cierre de caja, solo con lo relacionado a
 * efectivo, para el rol empleado_admin (que no debe ver el resto de
 * las cuentas: ingresos por otros métodos de pago, depósito bancario,
 * neto del spa, etc.). Usa las funciones obtener_cierre_efectivo,
 * guardar_efectivo_apertura y guardar_reconteo_apertura, que del lado
 * de la base de datos ya limitan qué columnas se exponen y quién
 * puede llamarlas.
 */
export default function CierreEfectivo() {
  const { profile } = useAuth()
  const fecha = todayISO()
  const fechaAnterior = addDaysISO(fecha, -1)

  const [cierre, setCierre] = useState(null)
  const [sugerenciaApertura, setSugerenciaApertura] = useState(null)
  const [loading, setLoading] = useState(true)

  const [aperturaInput, setAperturaInput] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [status, setStatus] = useState('')

  // --- Reconteo de apertura (cuando hay diferencia) ---
  const [mostrarReconteo, setMostrarReconteo] = useState(false)
  const [reconteoInput, setReconteoInput] = useState('')
  const [reconteoObservacion, setReconteoObservacion] = useState('')
  const [guardandoReconteo, setGuardandoReconteo] = useState(false)
  const [statusReconteo, setStatusReconteo] = useState('')

  const cargar = async () => {
    setLoading(true)
    const [{ data: hoy }, { data: ayer }] = await Promise.all([
      supabase.rpc('obtener_cierre_efectivo', { p_fecha: fecha }),
      supabase.rpc('obtener_cierre_efectivo', { p_fecha: fechaAnterior }),
    ])
    const filaHoy = Array.isArray(hoy) ? hoy[0] : hoy
    const filaAyer = Array.isArray(ayer) ? ayer[0] : ayer
    setCierre(filaHoy ?? null)
    setSugerenciaApertura(filaAyer?.efectivo_caja_siguiente ?? null)
    setLoading(false)
  }

  useEffect(() => { cargar() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const aperturaGuardada = cierre?.efectivo_apertura != null

  const diferenciaApertura =
    aperturaGuardada && sugerenciaApertura != null
      ? cierre.efectivo_apertura - sugerenciaApertura
      : 0
  // Siempre positivo cuando hay diferencia (falta o sobra): ambos casos
  // suman al proyectado. Ver la nota equivalente en CierreCaja.jsx.
  const ajustePorApertura = Math.abs(diferenciaApertura)

  const guardarApertura = async () => {
    const monto = parseFloat(aperturaInput)
    if (isNaN(monto) || monto < 0) {
      setStatus('Escribe un valor válido para el efectivo de apertura.')
      return
    }
    setGuardando(true)
    setStatus('')

    const { error } = await supabase.rpc('guardar_efectivo_apertura', {
      p_fecha: fecha,
      p_monto: monto,
    })

    setGuardando(false)
    if (error) {
      setStatus('Error guardando el efectivo de apertura: ' + error.message)
      return
    }

    // Si la apertura guardada no coincide con lo esperado, se avisa por
    // correo a todos los admins (igual que en Cierre de caja).
    if (sugerenciaApertura != null && Math.round(monto) !== Math.round(sugerenciaApertura)) {
      const diferencia = monto - sugerenciaApertura
      supabase.functions
        .invoke('notificar-diferencia-apertura', {
          body: {
            fecha_hora_texto: dateTimeShort(new Date().toISOString()),
            diferencia,
            nombre_usuario: profile?.nombre_completo ?? 'Usuario desconocido',
          },
        })
        .catch((e) => console.error('No se pudo enviar el aviso de diferencia:', e))
    }

    await cargar()
  }

  const guardarReconteo = async () => {
    const monto = parseFloat(reconteoInput)
    if (isNaN(monto) || monto < 0) {
      setStatusReconteo('Escribe un valor válido para el reconteo.')
      return
    }
    if (!reconteoObservacion.trim()) {
      setStatusReconteo('Escribe una observación explicando el reconteo.')
      return
    }
    setGuardandoReconteo(true)
    setStatusReconteo('')
    const { error } = await supabase.rpc('guardar_reconteo_apertura', {
      p_fecha: fecha,
      p_monto: monto,
      p_observacion: reconteoObservacion.trim(),
    })
    setGuardandoReconteo(false)
    if (error) {
      setStatusReconteo('Error guardando el reconteo: ' + error.message)
      return
    }
    setMostrarReconteo(false)
    setReconteoInput('')
    setReconteoObservacion('')
    await cargar()
  }

  if (loading) {
    return <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Cargando…</p>
  }

  return (
    <div className="max-w-lg">
      <h2 className="font-display text-2xl mb-1">Cierre en efectivo</h2>
      <p className="text-sm mb-6" style={{ color: 'var(--color-text-muted)' }}>
        Solo lo relacionado con el efectivo de caja de hoy.
      </p>

      <div className="card p-5">
        <p className="font-display text-lg mb-4">
          Caja del día — <span className="capitalize">{longDate(fecha)}</span>
        </p>

        {status && (
          <p
            className="text-sm mb-4 rounded-lg px-3 py-2"
            style={{ background: 'var(--color-danger-soft)', color: 'var(--color-danger)' }}
          >
            {status}
          </p>
        )}

        {/* Efectivo en caja apertura */}
        <div className="mb-5 pb-5 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <p className="text-sm font-medium mb-2">Efectivo en caja apertura</p>
          {aperturaGuardada ? (
            <div>
              <div className="flex items-center justify-between">
                <p className="font-mono-num text-lg font-semibold">{currency(cierre.efectivo_apertura)}</p>
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  Guardado {dateTimeShort(cierre.efectivo_apertura_guardado_at)}
                </p>
              </div>
              {sugerenciaApertura != null && (
                <div className="flex items-center justify-between mt-2">
                  <p className="text-sm font-medium">Diferencia en caja del día</p>
                  <p className="font-mono-num text-sm font-semibold" style={{ color: 'var(--color-danger)' }}>
                    {currency(-Math.abs(diferenciaApertura))}
                  </p>
                </div>
              )}

              {/* Reconteo: solo aparece si hay diferencia */}
              {diferenciaApertura !== 0 && !cierre.efectivo_apertura_reconteo && !mostrarReconteo && (
                <button
                  type="button"
                  onClick={() => setMostrarReconteo(true)}
                  className="text-sm font-medium mt-3"
                  style={{ color: 'var(--color-primary)' }}
                >
                  🔁 Hacer reconteo
                </button>
              )}

              {diferenciaApertura !== 0 && !cierre.efectivo_apertura_reconteo && mostrarReconteo && (
                <div
                  className="mt-3 rounded-lg p-3 space-y-2"
                  style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}
                >
                  <p className="text-xs font-medium">Reconteo del efectivo de apertura</p>
                  {statusReconteo && (
                    <p className="text-xs" style={{ color: 'var(--color-danger)' }}>{statusReconteo}</p>
                  )}
                  <input
                    type="number"
                    inputMode="decimal"
                    value={reconteoInput}
                    onChange={(e) => setReconteoInput(e.target.value)}
                    placeholder="Nuevo monto contado"
                    className="w-full rounded-lg border px-3 py-2 text-sm font-mono-num"
                    style={{ borderColor: 'var(--color-border)' }}
                  />
                  <textarea
                    value={reconteoObservacion}
                    onChange={(e) => setReconteoObservacion(e.target.value)}
                    placeholder="Observación: ¿qué pasó? (obligatorio)"
                    rows={2}
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    style={{ borderColor: 'var(--color-border)' }}
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={guardarReconteo}
                      disabled={guardandoReconteo}
                      className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                      style={{ background: 'var(--color-primary)' }}
                    >
                      {guardandoReconteo ? 'Guardando…' : 'Guardar reconteo'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMostrarReconteo(false)
                        setStatusReconteo('')
                      }}
                      className="rounded-lg px-4 py-2 text-sm font-medium"
                      style={{ border: '1px solid var(--color-border)' }}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {cierre.efectivo_apertura_reconteo != null && (
                <div className="mt-3 rounded-lg p-3" style={{ background: 'var(--color-success-soft)' }}>
                  <p className="text-xs font-medium" style={{ color: 'var(--color-success)' }}>
                    ✓ Reconteo hecho por {cierre.efectivo_apertura_reconteo_por_nombre} —{' '}
                    {dateTimeShort(cierre.efectivo_apertura_reconteo_at)}
                  </p>
                  <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                    Conteo original: {currency(cierre.efectivo_apertura_original)}
                  </p>
                  <p className="text-xs mt-1">{cierre.efectivo_apertura_reconteo_observacion}</p>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <input
                  type="number"
                  inputMode="decimal"
                  value={aperturaInput}
                  onChange={(e) => setAperturaInput(e.target.value)}
                  placeholder="0"
                  className="flex-1 rounded-lg border px-3 py-2 text-sm font-mono-num"
                  style={{ borderColor: 'var(--color-border)' }}
                />
                <button
                  onClick={guardarApertura}
                  disabled={guardando}
                  className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 shrink-0"
                  style={{ background: 'var(--color-primary)' }}
                >
                  {guardando ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
              <p className="text-xs mt-1.5" style={{ color: 'var(--color-text-muted)' }}>
                Escribe el efectivo que contaste en caja.
              </p>
            </>
          )}
        </div>

        {/* Ajuste por diferencia de caja en apertura del día */}
        <div className="mb-5 pb-5 border-b flex items-center justify-between" style={{ borderColor: 'var(--color-border)' }}>
          <p className="text-sm font-medium">Ajuste por diferencia de caja en apertura del día</p>
          <p
            className="font-mono-num text-lg font-semibold"
            style={{ color: ajustePorApertura > 0 ? 'var(--color-success)' : undefined }}
          >
            {currency(ajustePorApertura)}
          </p>
        </div>

        {/* Gastos en efectivo del día */}
        <div className="mb-5 pb-5 border-b flex items-center justify-between" style={{ borderColor: 'var(--color-border)' }}>
          <p className="text-sm font-medium">Gastos en efectivo hoy</p>
          <p className="font-mono-num text-lg font-semibold">{currency(cierre?.total_gastos_efectivo ?? 0)}</p>
        </div>

        {/* Efectivo en caja para el día siguiente */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Efectivo en caja para el día siguiente</p>
            {cierre?.efectivo_caja_siguiente == null && (
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                Se calcula cuando se guarde la apertura y el depósito bancario del día.
              </p>
            )}
          </div>
          <p className="font-mono-num text-lg font-semibold">
            {cierre?.efectivo_caja_siguiente != null ? currency(cierre.efectivo_caja_siguiente) : '—'}
          </p>
        </div>
      </div>
    </div>
  )
}
