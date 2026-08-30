import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { currency, longDate, dateTimeShort, todayISO } from '../utils/format'

const BUCKET_FOTOS_GASTOS = 'fotos-gastos'

const METODOS = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'llave_bre_b', label: 'Llave Bre-B' },
  { value: 'nequi', label: 'Nequi' },
  { value: 'otro', label: 'Otro' },
]

const FORM_VACIO = {
  fecha: todayISO(),
  categoria_id: '',
  concepto: '',
  valor: '',
  metodo_pago: 'efectivo',
}

export default function Gastos() {
  const [categorias, setCategorias] = useState([])
  const [gastos, setGastos] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ ...FORM_VACIO })
  const [archivo, setArchivo] = useState(null)
  const inputFoto = useRef(null)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState({ type: '', msg: '' })
  const [cargaHistorica, setCargaHistorica] = useState(false)
  const [fechaConsulta, setFechaConsulta] = useState(todayISO())

  const cargarCategorias = async () => {
    const { data: cats } = await supabase
      .from('categorias_gasto')
      .select('id, nombre')
      .eq('activo', true)
      .order('orden')
    setCategorias(cats ?? [])
  }

  const cargarGastos = async (fecha) => {
    setLoading(true)
    const { data: gs } = await supabase
      .from('gastos')
      .select('id, fecha, concepto, valor, metodo_pago, foto_url, created_at, categorias_gasto(nombre)')
      .eq('fecha', fecha)
      .order('created_at', { ascending: false })
    setGastos(gs ?? [])
    setLoading(false)
  }

  useEffect(() => { cargarCategorias() }, [])
  useEffect(() => { cargarGastos(fechaConsulta) }, [fechaConsulta])

  const elegirFoto = () => inputFoto.current?.click()

  const limpiarFormulario = () => {
    setForm((f) => ({ ...FORM_VACIO, fecha: cargaHistorica ? f.fecha : todayISO() }))
    setArchivo(null)
    if (inputFoto.current) inputFoto.current.value = ''
  }

  const guardar = async () => {
    setStatus({ type: '', msg: '' })

    if (!form.categoria_id) {
      setStatus({ type: 'error', msg: 'Elige una categoría para el gasto.' })
      return
    }
    if (!form.concepto.trim()) {
      setStatus({ type: 'error', msg: 'Escribe de qué se trata el gasto.' })
      return
    }
    const monto = parseFloat(form.valor)
    if (isNaN(monto) || monto <= 0) {
      setStatus({ type: 'error', msg: 'Escribe un valor válido para el gasto.' })
      return
    }
    if (!archivo) {
      setStatus({ type: 'error', msg: 'Adjunta la foto del recibo o factura — es obligatoria.' })
      return
    }

    setSaving(true)

    const extension = archivo.name.split('.').pop()
    const ruta = `${form.fecha}-${Date.now()}.${extension}`
    const { error: errorSubida } = await supabase
      .storage
      .from(BUCKET_FOTOS_GASTOS)
      .upload(ruta, archivo, { upsert: true, cacheControl: '3600' })

    if (errorSubida) {
      setSaving(false)
      setStatus({ type: 'error', msg: 'Error subiendo la foto: ' + errorSubida.message })
      return
    }

    const { data: publicUrlData } = supabase.storage.from(BUCKET_FOTOS_GASTOS).getPublicUrl(ruta)
    const { data: userData } = await supabase.auth.getUser()

    const { error: errorGuardado } = await supabase.from('gastos').insert({
      fecha: form.fecha,
      categoria_id: form.categoria_id,
      concepto: form.concepto.trim(),
      valor: monto,
      metodo_pago: form.metodo_pago,
      foto_url: publicUrlData.publicUrl,
      created_by: userData?.user?.id,
    })

    setSaving(false)

    if (errorGuardado) {
      setStatus({ type: 'error', msg: 'Error guardando el gasto: ' + errorGuardado.message })
      return
    }

    setStatus({ type: 'success', msg: 'Gasto registrado correctamente.' })
    limpiarFormulario()
    if (fechaConsulta === todayISO()) {
      await cargarGastos(fechaConsulta)
    } else {
      setFechaConsulta(todayISO())
    }
  }

  const formValido =
    form.categoria_id && form.concepto.trim() && parseFloat(form.valor) > 0 && archivo && !saving

  const totalListado = gastos.reduce((acc, g) => acc + Number(g.valor), 0)

  return (
    <div className="max-w-2xl">
      <h2 className="font-display text-2xl mb-1">Gastos y egresos</h2>
      <p className="text-sm mb-6" style={{ color: 'var(--color-text-muted)' }}>
        Cada gasto se resta automáticamente del Neto spa del cierre de caja del día correspondiente.
      </p>

      <div className="card p-5 mb-6">
        <p className="font-display text-lg mb-4">Registrar gasto</p>

        <div className="flex items-center justify-between rounded-lg px-3 py-2 mb-4" style={{ background: 'var(--color-accent-soft)' }}>
          <div>
            <p className="text-xs font-semibold" style={{ color: '#8A7A4E' }}>Modo carga histórica</p>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Actívalo para registrar gastos de días anteriores.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={cargaHistorica}
            onClick={() => {
              setCargaHistorica((v) => !v)
              setForm((f) => ({ ...f, fecha: todayISO() }))
            }}
            className="w-11 h-6 rounded-full relative shrink-0 transition-colors cursor-pointer border"
            style={{
              background: cargaHistorica ? 'var(--color-primary)' : '#D9D2D4',
              borderColor: cargaHistorica ? 'var(--color-primary-dark)' : '#C3BABC',
            }}
          >
            <span
              className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform"
              style={{ transform: cargaHistorica ? 'translateX(18px)' : 'translateX(0)', boxShadow: '0 1px 3px rgba(0,0,0,0.35)' }}
            />
          </button>
        </div>

        {status.msg && (
          <p
            className="text-sm mb-4 rounded-lg px-3 py-2"
            style={{
              background: status.type === 'error' ? 'var(--color-danger-soft)' : 'var(--color-success-soft)',
              color: status.type === 'error' ? 'var(--color-danger)' : 'var(--color-success)',
            }}
          >
            {status.msg}
          </p>
        )}

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Fecha</label>
            <input
              type="date"
              value={form.fecha}
              disabled={!cargaHistorica}
              readOnly={!cargaHistorica}
              max={todayISO()}
              onChange={(e) => setForm({ ...form, fecha: e.target.value })}
              className={`w-full rounded-lg border px-3 py-2 text-sm ${!cargaHistorica ? 'cursor-not-allowed opacity-70' : ''}`}
              style={{ borderColor: 'var(--color-border)', background: cargaHistorica ? 'var(--color-surface)' : 'var(--color-bg)' }}
            />
            <p className="text-xs mt-1.5" style={{ color: 'var(--color-text-muted)' }}>
              {cargaHistorica
                ? 'Modo carga histórica activo: puedes elegir cualquier fecha pasada.'
                : 'Los gastos solo se registran con la fecha de hoy.'}
            </p>
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">Categoría</label>
            <select
              value={form.categoria_id}
              onChange={(e) => setForm((f) => ({ ...f, categoria_id: e.target.value }))}
              className="w-full rounded-lg border px-3 py-2 text-sm bg-white"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <option value="">Selecciona una categoría…</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">Concepto</label>
            <input
              type="text"
              value={form.concepto}
              onChange={(e) => setForm((f) => ({ ...f, concepto: e.target.value }))}
              placeholder="Ej: Compra de esmaltes y acrílicos"
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: 'var(--color-border)' }}
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">Valor (COP)</label>
            <input
              type="number"
              inputMode="decimal"
              value={form.valor}
              onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))}
              placeholder="0"
              className="w-full rounded-lg border px-3 py-2 text-sm font-mono-num"
              style={{ borderColor: 'var(--color-border)' }}
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">Método de pago</label>
            <select
              value={form.metodo_pago}
              onChange={(e) => setForm((f) => ({ ...f, metodo_pago: e.target.value }))}
              className="w-full rounded-lg border px-3 py-2 text-sm bg-white"
              style={{ borderColor: 'var(--color-border)' }}
            >
              {METODOS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">Foto del recibo o factura</label>
            <input
              ref={inputFoto}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
            />
            <button
              onClick={elegirFoto}
              type="button"
              className="text-sm font-medium rounded-lg border px-3 py-2"
              style={{ borderColor: 'var(--color-border)' }}
            >
              {archivo ? `📷 ${archivo.name}` : '📷 Subir foto del recibo'}
            </button>
            <p className="text-xs mt-1.5" style={{ color: 'var(--color-text-muted)' }}>
              La foto es obligatoria para poder guardar el gasto.
            </p>
          </div>

          <button
            onClick={guardar}
            disabled={!formValido}
            className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
            style={{ background: 'var(--color-primary)' }}
          >
            {saving ? 'Guardando…' : 'Guardar gasto'}
          </button>
        </div>
      </div>

      <div className="card divide-y" style={{ borderColor: 'var(--color-border)' }}>
        <div className="px-4 py-3 space-y-2.5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold">
              {fechaConsulta === todayISO() ? 'Gastos de hoy' : 'Gastos del día consultado'}
            </p>
            {!loading && gastos.length > 0 && (
              <p className="text-xs shrink-0" style={{ color: 'var(--color-text-muted)' }}>
                Total: <span className="font-mono-num font-semibold">{currency(totalListado)}</span>
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs shrink-0" style={{ color: 'var(--color-text-muted)' }}>
              Consultar día:
            </label>
            <input
              type="date"
              value={fechaConsulta}
              onChange={(e) => setFechaConsulta(e.target.value)}
              className="rounded-lg border px-2.5 py-1.5 text-sm"
              style={{ borderColor: 'var(--color-border)' }}
            />
            {fechaConsulta !== todayISO() && (
              <button
                type="button"
                onClick={() => setFechaConsulta(todayISO())}
                className="text-xs font-medium rounded-lg border px-2.5 py-1.5"
                style={{ borderColor: 'var(--color-border)' }}
              >
                Volver a hoy
              </button>
            )}
          </div>
          <p className="text-xs capitalize" style={{ color: 'var(--color-text-muted)' }}>
            {longDate(fechaConsulta)}
          </p>
        </div>

        {loading && (
          <p className="px-4 py-4 text-sm" style={{ color: 'var(--color-text-muted)' }}>Cargando…</p>
        )}

        {!loading && gastos.length === 0 && (
          <p className="px-4 py-4 text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Aún no hay gastos registrados.
          </p>
        )}

        {gastos.map((g) => (
          <div key={g.id} className="px-4 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-sm font-medium truncate">{g.concepto}</span>
              </div>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {g.categorias_gasto?.nombre ?? '—'} · <span className="capitalize">{longDate(g.fecha)}</span> · {METODOS.find((m) => m.value === g.metodo_pago)?.label ?? g.metodo_pago}
              </p>
              <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                Registrado {dateTimeShort(g.created_at)}
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <p className="font-mono-num text-sm font-semibold">{currency(g.valor)}</p>
              {g.foto_url && (
                <a href={g.foto_url} target="_blank" rel="noreferrer">
                  <img
                    src={g.foto_url}
                    alt="Recibo"
                    className="w-12 h-12 object-cover rounded-lg border"
                    style={{ borderColor: 'var(--color-border)' }}
                  />
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
