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
    tipo_servicio_id: '',
    tipo_servicio: '',
    porcentaje: '',
    porcentajeAuto: false, // true si el % vino de servicios_manicurista (para diferenciarlo del % por defecto)
    costoAdicional: '',
    observaciones: '',
    metodo_pago: 'efectivo',
  })
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

  // Al elegir manicurista, buscar el % específico para el servicio ya elegido; si no hay, usar su % por defecto
  const handleManicuristaChange = (id) => {
    const m = manicuristas.find((x) => x.id === id)
    const especifico = buscarPorcentajeEspecifico(form.tipo_servicio_id, id)
    setForm((f) => ({
      ...f,
      manicurista_id: id,
      porcentaje: especifico ?? m?.porcentaje_default ?? f.porcentaje,
      porcentajeAuto: especifico !== undefined,
    }))
  }

  const handleTipoChange = (tipoServicioId) => {
    const t = tipos.find((x) => x.id === tipoServicioId)
    const especifico = buscarPorcentajeEspecifico(tipoServicioId, form.manicurista_id)
    setForm((f) => ({
      ...f,
      tipo_servicio_id: tipoServicioId,
      tipo_servicio: t?.nombre ?? '',
      porcentaje: especifico ?? f.porcentaje,
      porcentajeAuto: especifico !== undefined,
    }))
  }

  // El precio base viene siempre del tipo de servicio elegido — ya no se puede escribir a mano
  const tipoSeleccionado = tipos.find((t) => t.id === form.tipo_servicio_id)
  const costoBaseNum = tipoSeleccionado?.precio_sugerido ? Number(tipoSeleccionado.precio_sugerido) : 0
  const costoAdicionalNum = parseFloat(form.costoAdicional) || 0
  const costoTotalNum = costoBaseNum + costoAdicionalNum
  const porcentajeNum = parseFloat(form.porcentaje) || 0
  const pagadoPreview = Math.round((costoTotalNum * porcentajeNum) / 100)
  const requiereObservacion = costoAdicionalNum > 0

  const handleSubmit = async (e) => {
    e.preventDefault()
    setStatus({ type: '', msg: '' })

    if (!form.manicurista_id || !form.tipo_servicio_id || form.porcentaje === '') {
      setStatus({ type: 'error', msg: 'Completa manicurista, servicio y porcentaje.' })
      return
    }
    if (costoTotalNum <= 0) {
      setStatus({
        type: 'error',
        msg: 'Este tipo de servicio no tiene un precio configurado. Ve a "Tipos de servicio" y agrégale un precio.',
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
    const { error } = await supabase.from('registros_servicios').insert({
      fecha: form.fecha,
      manicurista_id: form.manicurista_id,
      cliente_id: form.cliente_id || null,
      cliente_nombre: cliente ? `${cliente.nombre} ${cliente.apellido}` : null,
      tipo_servicio_id: form.tipo_servicio_id,
      tipo_servicio: form.tipo_servicio,
      costo: costoTotalNum,
      costo_adicional: costoAdicionalNum,
      observaciones: form.observaciones.trim() || null,
      porcentaje: porcentajeNum,
      metodo_pago: form.metodo_pago,
      created_by: userData?.user?.id,
    })
    setSaving(false)

    if (error) {
      setStatus({ type: 'error', msg: 'No se pudo guardar: ' + error.message })
      return
    }

    setStatus({ type: 'success', msg: `Servicio guardado. Se le paga ${currency(pagadoPreview)} a la manicurista.` })
    setForm((f) => ({
      ...f,
      cliente_id: '',
      tipo_servicio_id: '',
      tipo_servicio: '',
      porcentaje: isAdmin ? '' : f.porcentaje,
      porcentajeAuto: false,
      costoAdicional: '',
      observaciones: '',
    }))
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
          <label className="block text-sm font-medium mb-1">Tipo de servicio</label>
          <select
            required
            value={form.tipo_servicio_id}
            onChange={(e) => handleTipoChange(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <option value="">Selecciona…</option>
            {tipos.map((t) => (
              <option key={t.id} value={t.id}>{t.nombre}</option>
            ))}
          </select>
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

        <div className="grid grid-cols-2 gap-4">
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
            {costoAdicionalNum > 0 && (
              <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                {currency(costoBaseNum)} del servicio + {currency(costoAdicionalNum)} adicional
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              % para manicurista
              {form.porcentajeAuto && (
                <span className="ml-1 text-xs font-normal" style={{ color: 'var(--color-success)' }}>
                  (automático)
                </span>
              )}
            </label>
            <input
              type="text"
              readOnly
              disabled
              value={form.porcentaje === '' ? '' : `${form.porcentaje}%`}
              className="w-full rounded-lg border px-3 py-2 text-sm font-mono-num cursor-not-allowed"
              style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text-muted)' }}
              placeholder="Elige manicurista y servicio"
            />
          </div>
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
