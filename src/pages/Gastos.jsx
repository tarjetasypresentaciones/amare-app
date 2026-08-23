import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { currency, longDate, dateTimeShort, todayISO } from '../utils/format'

const BUCKET_FOTOS_GASTOS = 'fotos-gastos'

const FORM_VACIO = {
  fecha: todayISO(),
  categoria_id: '',
  concepto: '',
  valor: '',
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

  const cargar = async () => {
    setLoading(true)
    const [{ data: cats }, { data: gs }] = await Promise.all([
      supabase.from('categorias_gasto').select('id, nombre').eq('activo', true).order('orden'),
      supabase
        .from('gastos')
        .select('id, fecha, concepto, valor, foto_url, created_at, categorias_gasto(nombre)')
        .order('fecha', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(100),
    ])
    setCategorias(cats ?? [])
    setGastos(gs ?? [])
    setLoading(false)
  }

  useEffect(() => { cargar() }, [])

  const elegirFoto = () => inputFoto.current?.click()

  const limpiarFormulario = () => {
    setForm({ ...FORM_VACIO })
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
    await cargar()
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
              onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: 'var(--color-border)' }}
            />
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
        <div className="px-4 py-3 flex items-center justify-between">
          <p className="text-sm font-semibold">Últimos gastos</p>
          {!loading && gastos.length > 0 && (
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Total: <span className="font-mono-num font-semibold">{currency(totalListado)}</span>
            </p>
          )}
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
                {g.categorias_gasto?.nombre ?? '—'} · <span className="capitalize">{longDate(g.fecha)}</span>
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
