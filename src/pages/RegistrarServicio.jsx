import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/AuthContext'
import { currency, todayISO } from '../utils/format'
import logoAmare from '../assets/logo-amare.png'

const METODOS = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'llave_bre_b', label: 'Llave Bre-B' },
  { value: 'nequi', label: 'Nequi' },
  { value: 'otro', label: 'Otro' },
]

const MAX_OBSERVACION = 100
const LINEA_VACIA = { tipo_servicio_id: '', tipo_servicio: '', porcentaje: '', porcentajeAuto: false }

export default function RegistrarServicio() {
  const { profile, puedeOperar } = useAuth()
  const [manicuristas, setManicuristas] = useState([])
  const [idsConDiaLibreHoy, setIdsConDiaLibreHoy] = useState([])
  const [tipos, setTipos] = useState([])
  const [clientes, setClientes] = useState([])
  const [vinculos, setVinculos] = useState([]) // servicios_manicurista: % específico por servicio+manicurista

  const [form, setForm] = useState({
    fecha: todayISO(),
    manicurista_id: puedeOperar ? '' : profile?.manicurista_id ?? '',
    cliente_id: '',
    costoAdicional: '',
    observaciones: '',
    metodo_pago: 'efectivo',
  })
  // Uno o más tipos de servicio realizados en este mismo registro (ej: manicure + pedicure a la misma clienta)
  const [lineas, setLineas] = useState([{ ...LINEA_VACIA }])

  const [status, setStatus] = useState({ type: '', msg: '' })
  const [saving, setSaving] = useState(false)
  const [recibo, setRecibo] = useState(null)
  const [faltaApertura, setFaltaApertura] = useState(false)
  const horaImpresionRef = useRef(null)

  useEffect(() => {
    supabase
      .from('manicuristas')
      .select('id, nombre, porcentaje_default, color, activo')
      .eq('activo', true)
      .order('nombre')
      .then(({ data }) => setManicuristas(data ?? []))

    supabase
      .from('tipos_servicio')
      .select('id, nombre, precio_sugerido')
      .eq('activo', true)
      .order('nombre')
      .then(({ data }) => setTipos(data ?? []))

    supabase
      .from('clientes')
      .select('id, nombre, apellido')
      .eq('activo', true)
      .order('nombre')
      .then(({ data }) => setClientes(data ?? []))

    supabase
      .from('servicios_manicurista')
      .select('tipo_servicio_id, manicurista_id, porcentaje')
      .eq('activo', true)
      .then(({ data }) => setVinculos(data ?? []))

    // Manicuristas con día libre aprobado para hoy: no deben poder
    // recibir servicios registrados a su nombre.
    supabase
      .from('dias_libres_manicurista')
      .select('manicurista_id')
      .eq('fecha', todayISO())
      .eq('estado', 'aprobado')
      .then(({ data }) => setIdsConDiaLibreHoy((data ?? []).map((d) => d.manicurista_id)))

    // Si todavía no se ha registrado el conteo de efectivo de apertura de
    // hoy, la base de datos va a rechazar el guardado — avisamos antes de
    // que la persona llene todo el formulario.
    supabase
      .from('cierres_caja')
      .select('efectivo_apertura')
      .eq('fecha', todayISO())
      .maybeSingle()
      .then(({ data }) => setFaltaApertura(!data?.efectivo_apertura))
  }, [])

  useEffect(() => {
    if (!puedeOperar && profile?.manicurista_id) {
      setForm((f) => ({ ...f, manicurista_id: profile.manicurista_id }))
    }
  }, [puedeOperar, profile])

  // Busca si hay un % específico configurado para esta combinación de servicio + manicurista
  const buscarPorcentajeEspecifico = (tipoServicioId, manicuristaId) =>
    vinculos.find((v) => v.tipo_servicio_id === tipoServicioId && v.manicurista_id === manicuristaId)?.porcentaje

  // Al elegir manicurista, recalcular el % de CADA línea de servicio ya elegida
  const handleManicuristaChange = (id) => {
    const m = manicuristas.find((x) => x.id === id)
    setForm((f) => ({ ...f, manicurista_id: id }))
    setLineas((prev) =>
      prev.map((l) => {
        if (!l.tipo_servicio_id) return l
        const especifico = buscarPorcentajeEspecifico(l.tipo_servicio_id, id)
        return { ...l, porcentaje: especifico ?? m?.porcentaje_default ?? l.porcentaje, porcentajeAuto: especifico !== undefined }
      })
    )
  }

  const handleTipoChange = (index, tipoServicioId) => {
    const t = tipos.find((x) => x.id === tipoServicioId)
    const m = manicuristas.find((x) => x.id === form.manicurista_id)
    const especifico = buscarPorcentajeEspecifico(tipoServicioId, form.manicurista_id)
    setLineas((prev) =>
      prev.map((l, i) =>
        i === index
          ? {
              tipo_servicio_id: tipoServicioId,
              tipo_servicio: t?.nombre ?? '',
              porcentaje: especifico ?? m?.porcentaje_default ?? l.porcentaje,
              porcentajeAuto: especifico !== undefined,
            }
          : l
      )
    )
  }

  const agregarLinea = () => setLineas((prev) => [...prev, { ...LINEA_VACIA }])
  const quitarLinea = (index) => setLineas((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev))

  // El precio base de cada línea viene siempre del tipo de servicio elegido — no se puede escribir a mano
  const lineasConDatos = lineas.map((l) => {
    const t = tipos.find((x) => x.id === l.tipo_servicio_id)
    return { ...l, precio: t?.precio_sugerido ? Number(t.precio_sugerido) : 0 }
  })
  const costoBaseNum = lineasConDatos.reduce((sum, l) => sum + l.precio, 0)
  const costoAdicionalNum = parseFloat(form.costoAdicional) || 0
  const costoTotalNum = costoBaseNum + costoAdicionalNum
  // El costo adicional (y su comisión) se suma dentro de la primera línea de servicio
  const pagadoPreview = lineasConDatos.reduce((sum, l, i) => {
    const costoLinea = l.precio + (i === 0 ? costoAdicionalNum : 0)
    const pct = parseFloat(l.porcentaje) || 0
    return sum + Math.round((costoLinea * pct) / 100)
  }, 0)
  const requiereObservacion = costoAdicionalNum > 0

  const puedeGuardar =
    !faltaApertura &&
    !!form.manicurista_id &&
    !!form.metodo_pago &&
    lineas.every((l) => !!l.tipo_servicio_id) &&
    !(requiereObservacion && !form.observaciones.trim()) &&
    costoAdicionalNum >= 0 &&
    costoTotalNum > 0

  const handleSubmit = async (e) => {
    e.preventDefault()
    setStatus({ type: '', msg: '' })

    if (!form.manicurista_id) {
      setStatus({ type: 'error', msg: 'Elige la manicurista.' })
      return
    }
    if (lineas.some((l) => !l.tipo_servicio_id || l.porcentaje === '')) {
      setStatus({ type: 'error', msg: 'Completa el tipo de servicio en cada línea.' })
      return
    }
    const lineaSinPrecio = lineasConDatos.find((l) => l.precio <= 0)
    if (lineaSinPrecio) {
      setStatus({
        type: 'error',
        msg: `"${lineaSinPrecio.tipo_servicio}" no tiene un precio configurado. Ve a "Tipos de servicio" y agrégale un precio.`,
      })
      return
    }
    if (costoAdicionalNum < 0) {
      setStatus({ type: 'error', msg: 'El costo adicional no puede ser negativo.' })
      return
    }
    if (requiereObservacion && !form.observaciones.trim()) {
      setStatus({ type: 'error', msg: 'Como hay un costo adicional, escribe una observación explicando de qué se trata.' })
      return
    }

    setSaving(true)
    const { data: userData } = await supabase.auth.getUser()
    const cliente = clientes.find((c) => c.id === form.cliente_id)
    const clienteNombre = cliente ? `${cliente.nombre} ${cliente.apellido}` : null
    const fechaRegistro = form.fecha || todayISO()

    // Un número de recibo por visita (no por línea) — manicure + pedicure
    // guardados juntos comparten el mismo número.
    const { data: numeroData, error: errorNumero } = await supabase.rpc('siguiente_numero_recibo')
    if (errorNumero) {
      setSaving(false)
      setStatus({ type: 'error', msg: 'No se pudo generar el número de recibo: ' + errorNumero.message })
      return
    }
    const numeroRecibo = numeroData

    const filas = lineasConDatos.map((l, i) => ({
      fecha: fechaRegistro,
      manicurista_id: form.manicurista_id,
      cliente_id: form.cliente_id || null,
      cliente_nombre: clienteNombre,
      tipo_servicio_id: l.tipo_servicio_id,
      tipo_servicio: l.tipo_servicio,
      costo: l.precio + (i === 0 ? costoAdicionalNum : 0),
      costo_adicional: i === 0 ? costoAdicionalNum : 0,
      observaciones: i === 0 ? form.observaciones.trim() || null : null,
      porcentaje: parseFloat(l.porcentaje) || 0,
      metodo_pago: form.metodo_pago,
      numero_recibo: numeroRecibo,
      created_by: userData?.user?.id,
    }))

    const { error } = await supabase.from('registros_servicios').insert(filas)
    setSaving(false)

    if (error) {
      setStatus({ type: 'error', msg: 'No se pudo guardar: ' + error.message })
      return
    }

    const plural = filas.length > 1 ? `${filas.length} servicios guardados` : 'Servicio guardado'
    setStatus({
      type: 'success',
      msg: `${plural} — Recibo de Caja N.º ${numeroRecibo}. Se le paga ${currency(pagadoPreview)} a la manicurista.`,
    })

    const manicurista = manicuristas.find((m) => m.id === form.manicurista_id)
    setRecibo({
      numero: numeroRecibo,
      fecha: fechaRegistro,
      manicurista: manicurista?.nombre ?? '',
      cliente: clienteNombre,
      metodo_pago: METODOS.find((m) => m.value === form.metodo_pago)?.label ?? form.metodo_pago,
      lineas: filas.map((f) => ({ tipo_servicio: f.tipo_servicio, costo: f.costo })),
      costoAdicional: costoAdicionalNum,
      observaciones: form.observaciones.trim(),
      total: costoTotalNum,
    })

    setForm((f) => ({ ...f, cliente_id: '', costoAdicional: '', observaciones: '' }))
    setLineas([{ ...LINEA_VACIA }])
  }

  const formatoFechaImpresion = (d) => {
    const pad = (n) => String(n).padStart(2, '0')
    const fecha = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    let horas = d.getHours()
    const ampm = horas >= 12 ? 'pm' : 'am'
    horas = horas % 12 || 12
    return `${fecha} ${pad(horas)}:${pad(d.getMinutes())} ${ampm}`
  }

  const imprimirRecibo = () => {
    if (horaImpresionRef.current) {
      horaImpresionRef.current.textContent = formatoFechaImpresion(new Date())
    }
    window.print()
  }

  return (
    <div className="max-w-lg">
      <p className="page-eyebrow">Amaré Atelier</p>
      <h2 className="font-display text-4xl mb-2">Registrar servicio</h2>
      <p className="text-sm mb-9" style={{ color: 'var(--color-text-muted)' }}>
        Anota cada servicio apenas se realice para que el cierre del día quede exacto.
      </p>

      {faltaApertura && (
        <div className="rounded-lg px-4 py-3 mb-6 text-sm" style={{ background: 'var(--color-danger-soft)', color: 'var(--color-danger)' }}>
          Falta el conteo de efectivo de apertura de hoy — regístralo desde <strong>Cierre de caja</strong> antes de continuar.
        </div>
      )}

      <form onSubmit={handleSubmit} className="card p-9 space-y-6">
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium mb-1">Fecha</label>
            <input
              type="date"
              value={form.fecha}
              disabled
              readOnly
              className="w-full rounded-lg border px-3 py-2 text-sm cursor-not-allowed opacity-70"
              style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)' }}
            />
            <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
              Los servicios solo se registran con la fecha de hoy.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Método de pago</label>
            <select
              value={form.metodo_pago}
              onChange={(e) => setForm({ ...form, metodo_pago: e.target.value })}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: 'var(--color-border)' }}
            >
              {METODOS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-divider" />

        {puedeOperar && (
          <div>
            <label className="block text-sm font-medium mb-1">Manicurista</label>
            <select
              required
              value={form.manicurista_id}
              onChange={(e) => handleManicuristaChange(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <option value="">Selecciona…</option>
              {manicuristas
                .filter((m) => !idsConDiaLibreHoy.includes(m.id))
                .map((m) => (
                  <option key={m.id} value={m.id}>{m.nombre}</option>
                ))}
            </select>
            {manicuristas.some((m) => idsConDiaLibreHoy.includes(m.id)) && (
              <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                No aparecen: {manicuristas
                  .filter((m) => idsConDiaLibreHoy.includes(m.id))
                  .map((m) => m.nombre)
                  .join(', ')} — tiene{manicuristas.filter((m) => idsConDiaLibreHoy.includes(m.id)).length > 1 ? 'n' : ''} el día libre hoy.
              </p>
            )}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-1">Cliente (opcional)</label>
          <select
            value={form.cliente_id}
            onChange={(e) => setForm({ ...form, cliente_id: e.target.value })}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <option value="">Selecciona…</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre} {c.apellido}</option>
            ))}
          </select>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm font-medium">Tipo(s) de servicio</label>
            {lineas.length > 1 && (
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{lineas.length} servicios</span>
            )}
          </div>
          <div className="space-y-2">
            {lineas.map((linea, index) => (
              <div key={index} className="flex items-center gap-2">
                <select
                  required
                  value={linea.tipo_servicio_id}
                  onChange={(e) => handleTipoChange(index, e.target.value)}
                  className="flex-1 rounded-lg border px-3 py-2 text-sm"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  <option value="">Selecciona…</option>
                  {tipos.map((t) => (
                    <option key={t.id} value={t.id}>{t.nombre}</option>
                  ))}
                </select>
                <span
                  className="text-xs font-mono-num w-14 shrink-0 text-center rounded-lg py-2"
                  style={{ background: 'var(--color-bg)', color: 'var(--color-text-muted)' }}
                  title={linea.porcentajeAuto ? 'Porcentaje automático' : ''}
                >
                  {linea.porcentaje === '' ? '—' : `${linea.porcentaje}%`}
                </span>
                {lineas.length > 1 && (
                  <button
                    type="button"
                    onClick={() => quitarLinea(index)}
                    className="shrink-0 rounded-lg px-2.5 py-2 text-sm font-medium"
                    style={{ background: 'var(--color-danger-soft)', color: 'var(--color-danger)' }}
                    title="Quitar este servicio"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={agregarLinea}
            className="mt-2 text-xs font-medium rounded-full px-3 py-1.5"
            style={{ border: '1px solid #E2D3AE', color: '#B58A54' }}
          >
            + Agregar otro servicio
          </button>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium mb-1">Costo adicional (COP)</label>
            <input
              type="number"
              min="0"
              step="1000"
              value={form.costoAdicional}
              onChange={(e) => {
                const v = e.target.value
                // No se permiten valores negativos: se quita el signo
                // menos apenas se escribe.
                setForm({ ...form, costoAdicional: v.startsWith('-') ? v.slice(1) : v })
              }}
              className="w-full rounded-lg border px-3 py-2 text-sm font-mono-num"
              style={{ borderColor: 'var(--color-border)' }}
              placeholder="0"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              Observaciones
              {requiereObservacion && <span style={{ color: 'var(--color-danger)' }}> *</span>}
            </label>
            <input
              type="text"
              maxLength={MAX_OBSERVACION}
              required={requiereObservacion}
              value={form.observaciones}
              onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: 'var(--color-border)' }}
              placeholder="Ej: diseño extra en 2 uñas"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Costo (COP)</label>
          <input
            type="text"
            readOnly
            disabled
            value={currency(costoTotalNum)}
            className="w-full rounded-lg border px-3 py-2 text-sm font-mono-num cursor-not-allowed"
            style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text-muted)' }}
          />
          {lineasConDatos.some((l) => l.precio > 0) && (
            <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
              {lineasConDatos
                .filter((l) => l.tipo_servicio)
                .map((l) => `${l.tipo_servicio} (${currency(l.precio)})`)
                .join(' + ')}
              {costoAdicionalNum > 0 && ` + ${currency(costoAdicionalNum)} adicional`}
            </p>
          )}
        </div>

        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ background: 'var(--color-accent-soft)', borderRadius: '6px' }}
        >
          <span className="text-xs font-semibold" style={{ letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8A7A4E' }}>
            Pagado a la manicurista
          </span>
          <span className="font-display font-medium text-xl">{currency(pagadoPreview)}</span>
        </div>

        {status.msg && (
          <p
            role="alert"
            className="text-sm rounded-lg px-3 py-2"
            style={{
              background: status.type === 'error' ? 'var(--color-danger-soft)' : 'var(--color-success-soft)',
              color: status.type === 'error' ? 'var(--color-danger)' : 'var(--color-success)',
            }}
          >
            {status.msg}
          </p>
        )}

        {recibo && status.type === 'success' && (
          <button
            type="button"
            onClick={imprimirRecibo}
            className="w-full rounded-lg py-2.5 text-sm font-semibold border"
            style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}
          >
            🖨️ Imprimir recibo de caja
          </button>
        )}

        <button
          type="submit"
          disabled={saving || !puedeGuardar}
          className="w-full rounded-lg py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed"
          style={{ background: puedeGuardar ? 'var(--color-primary)' : '#B0B0B0' }}
        >
          {saving ? 'Guardando…' : 'Guardar servicio'}
        </button>
      </form>

      {/* Recibo oculto: solo se ve al imprimir (ver .recibo-impresion en index.css) */}
      {recibo && (
        <div className="recibo-impresion">
          <div style={{ textAlign: 'center', width: '100%', marginBottom: 6 }}>
            <img
              src={logoAmare}
              alt="Amaré Atelier"
              style={{ display: 'block', width: '22mm', height: 'auto', margin: '0 auto' }}
            />
          </div>
          <p style={{ textAlign: 'center', marginBottom: 8 }}>Donde te eliges a ti</p>
          <p style={{ textAlign: 'center', fontWeight: 'bold', marginBottom: 8 }}>
            Recibo de Caja N.º {String(recibo.numero).padStart(6, '0')}
          </p>
          <p>Fecha: <span ref={horaImpresionRef}></span></p>
          <p>Manicurista: {recibo.manicurista}</p>
          {recibo.cliente && <p>Cliente: {recibo.cliente}</p>}
          <p>--------------------------------</p>
          {recibo.lineas.map((l, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{l.tipo_servicio}</span>
              <span>{currency(l.costo)}</span>
            </div>
          ))}
          {recibo.observaciones && <p>Obs: {recibo.observaciones}</p>}
          <p>--------------------------------</p>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
            <span>TOTAL</span>
            <span>{currency(recibo.total)}</span>
          </div>
          <p>Método de pago: {recibo.metodo_pago}</p>
          <p style={{ textAlign: 'center', marginTop: 8 }}>Régimen: Persona natural</p>
          <p style={{ textAlign: 'center' }}>No responsable de IVA - No obligado a expedir factura</p>
          <p style={{ textAlign: 'center', marginTop: 8 }}>¡Gracias por tu visita!</p>
        </div>
      )}
    </div>
  )
}
