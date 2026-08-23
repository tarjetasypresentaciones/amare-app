import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { currency, longDate, shortDate, todayISO, addDaysISO, dateTimeShort, startOfWeekISO } from '../utils/format'
import { useAuth } from '../lib/AuthContext'

const BUCKET_FOTOS_CIERRE = 'fotos-cierres'

export default function CierreCaja() {
  const { profile } = useAuth()
  const [fecha, setFecha] = useState(todayISO())
  const [cierre, setCierre] = useState(null)
  const [cierreAnterior, setCierreAnterior] = useState(null)
  const [historial, setHistorial] = useState([])
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  // --- Efectivo en caja apertura ---
  const [aperturaInput, setAperturaInput] = useState('')
  const [guardandoApertura, setGuardandoApertura] = useState(false)

  // --- Depósito bancario ---
  const [depositoMonto, setDepositoMonto] = useState('')
  const [depositoArchivo, setDepositoArchivo] = useState(null)
  const [guardandoDeposito, setGuardandoDeposito] = useState(false)
  const inputFotoDeposito = useRef(null)

  const [status, setStatus] = useState('')

  const cargar = async () => {
    setLoading(true)
    const fechaAnterior = addDaysISO(fecha, -1)

    // Rango del historial "Cierres de la semana": solo días ya completos.
    // Si hoy es lunes (todavía no hay ningún día completo de esta semana),
    // se muestra la semana pasada completa (lunes a domingo).
    const hoy = todayISO()
    const inicioSemanaActual = startOfWeekISO(hoy)
    let inicioHistorial, finHistorial
    if (inicioSemanaActual === hoy) {
      inicioHistorial = addDaysISO(inicioSemanaActual, -7)
      finHistorial = addDaysISO(inicioSemanaActual, -1)
    } else {
      inicioHistorial = inicioSemanaActual
      finHistorial = addDaysISO(hoy, -1)
    }

    const [{ data: c }, { data: cAnt }, { data: h }, { data: cfg }] = await Promise.all([
      supabase.from('cierres_caja').select('*').eq('fecha', fecha).maybeSingle(),
      supabase.from('cierres_caja').select('efectivo_caja_siguiente').eq('fecha', fechaAnterior).maybeSingle(),
      supabase.from('cierres_caja').select('*').gte('fecha', inicioHistorial).lte('fecha', finHistorial).order('fecha', { ascending: false }),
      supabase.from('configuracion').select('*').eq('id', 1).single(),
    ])
    setCierre(c)
    setCierreAnterior(cAnt)
    setHistorial(h ?? [])
    setConfig(cfg)
    setLoading(false)

    // Prellenar el campo de apertura con el valor sugerido (el cierre del
    // día anterior), solo si todavía no se ha guardado la apertura de hoy.
    if (!c?.efectivo_apertura) {
      setAperturaInput(cAnt?.efectivo_caja_siguiente != null ? String(cAnt.efectivo_caja_siguiente) : '')
    }
    setDepositoMonto('')
    setDepositoArchivo(null)
  }

  useEffect(() => { cargar() }, [fecha]) // eslint-disable-line react-hooks/exhaustive-deps

  const generar = async () => {
    setBusy(true)
    await supabase.rpc('generar_cierre_dia', { p_fecha: fecha })
    await cargar()
    setBusy(false)
  }

  const confirmar = async () => {
    setBusy(true)
    await supabase.rpc('confirmar_cierre', { p_fecha: fecha })
    await cargar()
    setBusy(false)
  }

  const cambiarConfig = async (valor) => {
    await supabase.from('configuracion').update({ requiere_confirmacion_cierre: valor }).eq('id', 1)
    setConfig((c) => ({ ...c, requiere_confirmacion_cierre: valor }))
    // Recalcula el cierre del día que se está viendo para que su estado
    // (pendiente / cerrado automáticamente) refleje el nuevo ajuste al instante,
    // sin necesidad de recargar la página.
    await supabase.rpc('generar_cierre_dia', { p_fecha: fecha })
    await cargar()
  }

  // Asegura que exista una fila en cierres_caja para `fecha` antes de
  // guardar apertura o depósito (puede que aún no haya ningún servicio
  // registrado ese día, y por lo tanto no exista fila todavía).
  const asegurarCierre = async () => {
    if (cierre) return cierre
    const { data } = await supabase.rpc('generar_cierre_dia', { p_fecha: fecha })
    return data
  }

  const guardarApertura = async () => {
    const monto = parseFloat(aperturaInput)
    if (isNaN(monto) || monto < 0) {
      setStatus('Escribe un valor válido para el efectivo de apertura.')
      return
    }
    setGuardandoApertura(true)
    setStatus('')
    await asegurarCierre()
    const { data: userData } = await supabase.auth.getUser()
    const ahora = new Date().toISOString()
    const { error } = await supabase
      .from('cierres_caja')
      .update({
        efectivo_apertura: monto,
        efectivo_apertura_guardado_at: ahora,
        efectivo_apertura_guardado_por: userData?.user?.id,
      })
      .eq('fecha', fecha)
    setGuardandoApertura(false)
    if (error) {
      setStatus('Error guardando el efectivo de apertura: ' + error.message)
      return
    }
    // Si la apertura guardada no coincide con lo esperado (el cierre del
    // día anterior), se avisa por correo a todos los admins. No bloquea
    // el guardado si el correo falla — solo se registra en consola.
    if (sugerenciaApertura != null && Math.round(monto) !== Math.round(sugerenciaApertura)) {
      const diferencia = monto - sugerenciaApertura
      supabase.functions
        .invoke('notificar-diferencia-apertura', {
          body: {
            fecha_hora_texto: dateTimeShort(ahora),
            diferencia,
            nombre_usuario: profile?.nombre_completo ?? 'Usuario desconocido',
          },
        })
        .catch((e) => console.error('No se pudo enviar el aviso de diferencia:', e))
    }
    await cargar()
  }

  const elegirFotoDeposito = () => inputFotoDeposito.current?.click()

  const guardarDeposito = async () => {
    const monto = parseFloat(depositoMonto)
    if (isNaN(monto) || monto <= 0) {
      setStatus('Escribe el valor del depósito bancario.')
      return
    }
    if (!depositoArchivo) {
      setStatus('Adjunta la foto del comprobante de depósito.')
      return
    }
    setGuardandoDeposito(true)
    setStatus('')
    await asegurarCierre()

    const extension = depositoArchivo.name.split('.').pop()
    const ruta = `${fecha}-${Date.now()}.${extension}`
    const { error: errorSubida } = await supabase
      .storage
      .from(BUCKET_FOTOS_CIERRE)
      .upload(ruta, depositoArchivo, { upsert: true, cacheControl: '3600' })

    if (errorSubida) {
      setStatus('Error subiendo la foto del depósito: ' + errorSubida.message)
      setGuardandoDeposito(false)
      return
    }

    const { data: publicUrlData } = supabase.storage.from(BUCKET_FOTOS_CIERRE).getPublicUrl(ruta)

    const { error: errorGuardado } = await supabase
      .from('cierres_caja')
      .update({
        deposito_bancario: monto,
        deposito_bancario_foto_url: publicUrlData.publicUrl,
        deposito_bancario_guardado_at: new Date().toISOString(),
      })
      .eq('fecha', fecha)

    setGuardandoDeposito(false)
    if (errorGuardado) {
      setStatus('Error guardando el depósito bancario: ' + errorGuardado.message)
      return
    }
    await cargar()
  }

  const marcarSinDeposito = async () => {
    if (!window.confirm('¿Confirmas que no hubo depósito bancario este día? Se guardará como $0.')) return
    setGuardandoDeposito(true)
    setStatus('')
    await asegurarCierre()
    const { error } = await supabase
      .from('cierres_caja')
      .update({
        deposito_bancario: 0,
        deposito_bancario_foto_url: null,
        deposito_bancario_guardado_at: new Date().toISOString(),
      })
      .eq('fecha', fecha)
    setGuardandoDeposito(false)
    if (error) {
      setStatus('Error guardando: ' + error.message)
      return
    }
    await cargar()
  }

  const estadoLabel = {
    pendiente: { text: 'Pendiente de confirmar', bg: 'var(--color-danger-soft)', fg: 'var(--color-danger)' },
    auto_confirmado: { text: 'Cerrado automáticamente', bg: 'var(--color-success-soft)', fg: 'var(--color-success)' },
    confirmado: { text: 'Confirmado', bg: 'var(--color-success-soft)', fg: 'var(--color-success)' },
  }

  const aperturaGuardada = cierre?.efectivo_apertura != null
  const depositoGuardado = cierre?.deposito_bancario != null
  const sugerenciaApertura = cierreAnterior?.efectivo_caja_siguiente
  const aperturaNoCoincide =
    !aperturaGuardada &&
    sugerenciaApertura != null &&
    aperturaInput !== '' &&
    Math.round(parseFloat(aperturaInput || '0')) !== Math.round(sugerenciaApertura)

  const ingresosDetallado = [
    { label: 'Efectivo', valor: cierre?.ingreso_efectivo ?? 0 },
    { label: 'Tarjeta', valor: cierre?.ingreso_tarjeta ?? 0 },
    { label: 'Transferencia', valor: cierre?.ingreso_transferencia ?? 0 },
    { label: 'Llave Bre-B', valor: cierre?.ingreso_llave_bre_b ?? 0 },
    { label: 'Nequi', valor: cierre?.ingreso_nequi ?? 0 },
    { label: 'Otro', valor: cierre?.ingreso_otro ?? 0 },
  ]

  const ingresosSimplificado = [
    { label: 'Efectivo', valor: cierre?.ingreso_efectivo ?? 0 },
    { label: 'Bold (Tarjeta y Llave)', valor: (cierre?.ingreso_tarjeta ?? 0) + (cierre?.ingreso_llave_bre_b ?? 0) },
    { label: 'Transferencia', valor: cierre?.ingreso_transferencia ?? 0 },
    { label: 'Nequi', valor: cierre?.ingreso_nequi ?? 0 },
    { label: 'Otro', valor: cierre?.ingreso_otro ?? 0 },
  ]

  return (
    <div className="max-w-2xl">
      <h2 className="font-display text-2xl mb-1">Cierre de caja</h2>
      <p className="text-sm mb-6" style={{ color: 'var(--color-text-muted)' }}>
        El cierre se recalcula solo con cada servicio registrado. Puedes exigir confirmación manual si lo prefieres.
      </p>

      <div className="card p-4 mb-6 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Requerir confirmación manual del cierre</p>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Si está activo, el cierre del día queda "pendiente" hasta que un admin lo confirme.
          </p>
        </div>
        <button
          role="switch"
          aria-checked={config?.requiere_confirmacion_cierre}
          onClick={() => cambiarConfig(!config?.requiere_confirmacion_cierre)}
          className="w-12 h-7 rounded-full relative shrink-0 transition-colors cursor-pointer border"
          style={{
            background: config?.requiere_confirmacion_cierre ? 'var(--color-primary)' : '#D9D2D4',
            borderColor: config?.requiere_confirmacion_cierre ? 'var(--color-primary-dark)' : '#C3BABC',
          }}
        >
          <span
            className="absolute top-1 left-1 w-5 h-5 rounded-full bg-white transition-transform"
            style={{
              transform: config?.requiere_confirmacion_cierre ? 'translateX(20px)' : 'translateX(0)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.35)',
            }}
          />
        </button>
      </div>

      {/* --- Caja del día --- */}
      <div className="card p-5 mb-6">
        <p className="font-display text-lg mb-4">Caja del día — <span className="capitalize">{longDate(fecha)}</span></p>

        {status && (
          <p className="text-sm mb-4 rounded-lg px-3 py-2" style={{ background: 'var(--color-danger-soft)', color: 'var(--color-danger)' }}>
            {status}
          </p>
        )}

        {/* Efectivo en caja apertura */}
        <div className="mb-5 pb-5 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <p className="text-sm font-medium mb-2">Efectivo en caja apertura</p>
          {aperturaGuardada ? (
            <div className="flex items-center justify-between">
              <p className="font-mono-num text-lg font-semibold">{currency(cierre.efectivo_apertura)}</p>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                Guardado {dateTimeShort(cierre.efectivo_apertura_guardado_at)}
              </p>
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
                  disabled={guardandoApertura}
                  className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 shrink-0"
                  style={{ background: 'var(--color-primary)' }}
                >
                  {guardandoApertura ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
              {sugerenciaApertura != null ? (
                <p className="text-xs mt-1.5" style={{ color: 'var(--color-text-muted)' }}>
                  Debe coincidir con la caja del día anterior: {currency(sugerenciaApertura)}
                </p>
              ) : (
                <p className="text-xs mt-1.5" style={{ color: 'var(--color-text-muted)' }}>
                  No hay un cierre del día anterior con el que comparar.
                </p>
              )}
              {aperturaNoCoincide && (
                <p className="text-xs mt-1 font-medium" style={{ color: 'var(--color-danger)' }}>
                  ⚠ Este valor no coincide con el cierre del día anterior ({currency(sugerenciaApertura)}).
                </p>
              )}
            </>
          )}
        </div>

        {/* Ingresos detallado */}
        <div className="mb-5 pb-5 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <p className="text-sm font-medium mb-2">Ingresos</p>
          <div className="grid grid-cols-5 gap-2 text-center">
            {ingresosDetallado.map((i) => (
              <div key={i.label} className="rounded-lg py-2 px-1" style={{ background: 'var(--color-bg)' }}>
                <p className="text-[11px] leading-tight mb-1" style={{ color: 'var(--color-text-muted)' }}>{i.label}</p>
                <p className="font-mono-num text-xs font-semibold">{currency(i.valor)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Ingresos simplificado */}
        <div className="mb-5 pb-5 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <p className="text-sm font-medium mb-2">Ingresos simplificado</p>
          <div className="grid grid-cols-4 gap-2 text-center">
            {ingresosSimplificado.map((i) => (
              <div key={i.label} className="rounded-lg py-2 px-1" style={{ background: 'var(--color-bg)' }}>
                <p className="text-[11px] leading-tight mb-1" style={{ color: 'var(--color-text-muted)' }}>{i.label}</p>
                <p className="font-mono-num text-xs font-semibold">{currency(i.valor)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Ingresos totales del día */}
        <div className="mb-5 pb-5 border-b flex items-center justify-between" style={{ borderColor: 'var(--color-border)' }}>
          <p className="text-sm font-medium">Ingresos totales del día</p>
          <p className="font-mono-num text-lg font-semibold">{currency(cierre?.total_ingresos ?? 0)}</p>
        </div>

        {/* Depósito bancario */}
        <div className="mb-5 pb-5 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <p className="text-sm font-medium mb-2">Depósito bancario</p>
          {depositoGuardado ? (
            <div className="flex items-center justify-between gap-3">
              <div>
                {cierre.deposito_bancario > 0 ? (
                  <p className="font-mono-num text-lg font-semibold">{currency(cierre.deposito_bancario)}</p>
                ) : (
                  <p className="text-sm font-medium" style={{ color: 'var(--color-text-muted)' }}>Sin depósito este día</p>
                )}
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  Guardado {dateTimeShort(cierre.deposito_bancario_guardado_at)}
                </p>
              </div>
              {cierre.deposito_bancario_foto_url && (
                <a href={cierre.deposito_bancario_foto_url} target="_blank" rel="noreferrer" className="shrink-0">
                  <img
                    src={cierre.deposito_bancario_foto_url}
                    alt="Comprobante de depósito"
                    className="w-14 h-14 object-cover rounded-lg border"
                    style={{ borderColor: 'var(--color-border)' }}
                  />
                </a>
              )}
            </div>
          ) : (
            <>
              <div className="flex gap-2 mb-2">
                <input
                  type="number"
                  inputMode="decimal"
                  value={depositoMonto}
                  onChange={(e) => setDepositoMonto(e.target.value)}
                  placeholder="0"
                  className="flex-1 rounded-lg border px-3 py-2 text-sm font-mono-num"
                  style={{ borderColor: 'var(--color-border)' }}
                />
                <button
                  onClick={guardarDeposito}
                  disabled={guardandoDeposito}
                  className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 shrink-0"
                  style={{ background: 'var(--color-primary)' }}
                >
                  {guardandoDeposito ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
              <input
                ref={inputFotoDeposito}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => setDepositoArchivo(e.target.files?.[0] ?? null)}
              />
              <button
                onClick={elegirFotoDeposito}
                className="text-xs font-medium rounded-lg border px-3 py-1.5"
                style={{ borderColor: 'var(--color-border)' }}
              >
                {depositoArchivo ? `📷 ${depositoArchivo.name}` : '📷 Subir foto del comprobante'}
              </button>
              <button
                onClick={marcarSinDeposito}
                disabled={guardandoDeposito}
                className="text-xs font-medium underline block mt-2 disabled:opacity-60"
                style={{ color: 'var(--color-text-muted)' }}
              >
                No hubo depósito bancario este día
              </button>
            </>
          )}
        </div>

        {/* Efectivo en caja para el día siguiente */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Efectivo en caja para el día siguiente</p>
            {cierre?.efectivo_caja_siguiente == null && (
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                Se calcula cuando se guarde la apertura y el depósito bancario.
              </p>
            )}
            {cierre?.efectivo_caja_siguiente != null && (cierre?.total_gastos_efectivo ?? 0) > 0 && (
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                Ya descuenta {currency(cierre.total_gastos_efectivo)} en gastos pagados en efectivo.
              </p>
            )}
          </div>
          <p className="font-mono-num text-lg font-semibold">
            {cierre?.efectivo_caja_siguiente != null ? currency(cierre.efectivo_caja_siguiente) : '—'}
          </p>
        </div>
      </div>

      <div className="card p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="rounded-lg border px-3 py-1.5 text-sm"
            style={{ borderColor: 'var(--color-border)' }}
          />
          {cierre && (
            <span
              className="text-xs font-medium rounded-full px-3 py-1"
              style={{ background: estadoLabel[cierre.estado].bg, color: estadoLabel[cierre.estado].fg }}
            >
              {estadoLabel[cierre.estado].text}
            </span>
          )}
        </div>

        <p className="font-display text-lg mb-4 capitalize">{longDate(fecha)}</p>

        {!cierre ? (
          <div className="text-center py-6">
            <p className="text-sm mb-4" style={{ color: 'var(--color-text-muted)' }}>
              Aún no hay cierre generado para este día.
            </p>
            <button
              onClick={generar}
              disabled={busy}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              style={{ background: 'var(--color-primary)' }}
            >
              {busy ? 'Generando…' : 'Generar cierre de este día'}
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Ingresos</p>
                <p className="font-mono-num text-lg font-semibold">{currency(cierre.total_ingresos)}</p>
              </div>
              <div>
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Pagado a manicuristas</p>
                <p className="font-mono-num text-lg font-semibold">{currency(cierre.total_pagado_manicuristas)}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Gastos del día</p>
                <p className="font-mono-num text-lg font-semibold" style={{ color: 'var(--color-danger)' }}>
                  {currency(cierre.total_gastos ?? 0)}
                </p>
              </div>
              <div>
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Neto spa</p>
                <p className="font-mono-num text-lg font-semibold" style={{ color: 'var(--color-success)' }}>
                  {currency(cierre.total_neto_spa)}
                </p>
              </div>
            </div>
            <p className="text-xs mb-4" style={{ color: 'var(--color-text-muted)' }}>
              {cierre.cantidad_servicios} servicios registrados ese día.
            </p>
            <div className="flex gap-2">
              <button
                onClick={generar}
                disabled={busy}
                className="rounded-lg px-4 py-2 text-sm font-medium border disabled:opacity-60"
                style={{ borderColor: 'var(--color-border)' }}
              >
                Recalcular
              </button>
              {cierre.estado === 'pendiente' && (
                <button
                  onClick={confirmar}
                  disabled={busy}
                  className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  style={{ background: 'var(--color-primary)' }}
                >
                  Confirmar cierre
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <div className="card divide-y" style={{ borderColor: 'var(--color-border)' }}>
        <p className="px-4 py-3 text-sm font-semibold">Cierres de la semana</p>
        {historial.length === 0 && (
          <p className="px-4 py-4 text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Aún no hay cierres completos esta semana.
          </p>
        )}
        {historial.map((h) => (
          <button
            key={h.id}
            onClick={() => setFecha(h.fecha)}
            className="w-full text-left px-4 py-3 hover:bg-black/5"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">
                {shortDate(h.fecha)}
                {h.deposito_bancario_foto_url && <span className="ml-1">📷</span>}
              </span>
              <span
                className="text-xs font-medium rounded-full px-2 py-0.5"
                style={{ background: estadoLabel[h.estado].bg, color: estadoLabel[h.estado].fg }}
              >
                {estadoLabel[h.estado].text}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2 text-center">
              <div>
                <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Ingresos</p>
                <p className="font-mono-num text-xs font-semibold">{currency(h.total_ingresos)}</p>
              </div>
              <div>
                <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Pagado</p>
                <p className="font-mono-num text-xs font-semibold">{currency(h.total_pagado_manicuristas)}</p>
              </div>
              <div>
                <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Gastos</p>
                <p className="font-mono-num text-xs font-semibold" style={{ color: 'var(--color-danger)' }}>
                  {currency(h.total_gastos ?? 0)}
                </p>
              </div>
              <div>
                <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Neto spa</p>
                <p className="font-mono-num text-xs font-semibold" style={{ color: 'var(--color-success)' }}>
                  {currency(h.total_neto_spa)}
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
