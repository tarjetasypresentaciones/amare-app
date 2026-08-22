import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/AuthContext'
import { currency, todayISO } from '../utils/format'

const METODOS = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'otro', label: 'Otro' },
]

const MAX_OBSERVACION = 100
const LINEA_VACIA = { tipo_servicio_id: '', tipo_servicio: '', porcentaje: '', porcentajeAuto: false }

export default function RegistrarServicio() {
  const { profile, isAdmin } = useAuth()
  const [manicuristas, setManicuristas] = useState([])
  const [tipos, setTipos] = useState([])
  const [clientes, setClientes] = useState([])
  const [vinculos, setVinculos] = useState([]) // servicios_manicurista: % específico por servicio+manicurista

  const [form, setForm] = useState({
    fecha: todayISO(),
    manicurista_id: isAdmin ? '' : profile?.manicurista_id ?? '',
    cliente_id: '',
    costoAdicional: '',
    observaciones: '',
    metodo_pago: 'efectivo',
  })
  // Uno o más tipos de servicio realizados en este mismo registro (ej: manicure + pedicure a la misma clienta)
  const [lineas, setLineas] = useState([{ ...LINEA_VACIA }])

  const [status, setStatus] = useState({ type: '', msg: '' })
  const [saving, setSaving] = useState(false)

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
  }, [])

  useEffect(() => {
    if (!isAdmin && profile?.manicurista_id) {
      setForm((f) => ({ ...f, manicurista_id: profile.manicurista_id }))
    }
  }, [isAdmin, profile])

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
    if (requiereObservacion && !form.observaciones.trim()) {
      setStatus({ type: 'error', msg: 'Como hay un costo adicional, escribe una observación explicando de qué se trata.' })
      return
    }

    setSaving(true)
    const { data: userData } = await supabase.auth.getUser()
    const cliente = clientes.find((c) => c.id === form.cliente_id)
    const clienteNombre = cliente ? `${cliente.nombre} ${cliente.apellido}` : null

    const filas = lineasConDatos.map((l, i) => ({
      fecha: form.fecha,
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
      created_by: userData?.user?.id,
    }))

    const { error } = await supabase.from('registros_servicios').insert(filas)
    setSaving(false)

    if (error) {
      setStatus({ type: 'error', msg: 'No se pudo guardar: ' + error.message })
      return
    }

    const plural = filas.length > 1 ? `${filas.length} servicios guardados` : 'Servicio guardado'
    setStatus({ type: 'success', msg: `${plural}. Se le paga ${currency(pagadoPreview)} a la manicurista.` })
    setForm((f) => ({ ...f, cliente_id: '', costoAdicional: '', observaciones: '' }))
    setLineas([{ ...LINEA_VACIA }])
  }

  return (
    <div className="max-w-lg">
      <h2 className="font-display text-2xl mb-1">Registrar servicio</h2>
      <p className="text-sm mb-6" style={{ color: 'var(--color-text-muted)' }}>
        Anota cada servicio apenas se realice para que el cierre del día quede exacto.
      </p>

      <form onSubmit={handleSubmit} className="card p-5 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Fecha</label>
            <input
              type="date"
              value={form.fecha}
              onChange={(e) => setForm({ ...form, fecha: e.target.value })}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: 'var(--color-border)' }}
            />
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

        {isAdmin && (
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
              {manicuristas.map((m) => (
                <option key={m.id} value={m.id}>{m.nombre}</option>
              ))}
            </select>
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
            style={{ border: '1px solid var(--color-border)' }}
          >
            + Agregar otro servicio
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Costo adicional (COP)</label>
            <input
              type="number"
              min="0"
              step="1000"
              value={form.costoAdicional}
              onChange={(e) => setForm({ ...form, costoAdicional: e.target.value })}
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
          className="flex items-center justify-between rounded-lg px-4 py-3"
          style={{ background: 'var(--color-accent-soft)' }}
        >
          <span className="text-sm font-medium">Pagado a la manicurista</span>
          <span className="font-mono-num font-semibold text-lg">{currency(pagadoPreview)}</span>
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

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-lg py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          style={{ background: 'var(--color-primary)' }}
        >
          {saving ? 'Guardando…' : 'Guardar servicio'}
        </button>
      </form>
    </div>
  )
}
