import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function ServiciosManicurista() {
  const [tipos, setTipos] = useState([])
  const [manicuristas, setManicuristas] = useState([])
  const [vinculos, setVinculos] = useState([])
  const [loading, setLoading] = useState(true)
  const [nuevo, setNuevo] = useState({ tipo_servicio_id: '', manicurista_id: '', porcentaje: '' })
  const [status, setStatus] = useState('')

  const cargar = async () => {
    const [{ data: t }, { data: m }, { data: v }] = await Promise.all([
      supabase.from('tipos_servicio').select('id, nombre').eq('activo', true).order('nombre'),
      supabase.from('manicuristas').select('id, nombre').eq('activo', true).order('nombre'),
      supabase
        .from('servicios_manicurista')
        .select('id, tipo_servicio_id, manicurista_id, porcentaje, activo, tipos_servicio(nombre), manicuristas(nombre)')
        .eq('activo', true),
    ])
    setTipos(t ?? [])
    setManicuristas(m ?? [])
    setVinculos(v ?? [])
    setLoading(false)
  }

  useEffect(() => { cargar() }, [])

  const agregar = async (e) => {
    e.preventDefault()
    setStatus('')
    if (!nuevo.tipo_servicio_id || !nuevo.manicurista_id || nuevo.porcentaje === '') {
      setStatus('Completa servicio, manicurista y porcentaje.')
      return
    }
    const { error } = await supabase.from('servicios_manicurista').insert({
      tipo_servicio_id: nuevo.tipo_servicio_id,
      manicurista_id: nuevo.manicurista_id,
      porcentaje: Number(nuevo.porcentaje),
    })
    if (error) {
      // El error típico aquí es la restricción "unique" si ya existe esa combinación
      setStatus(
        error.code === '23505'
          ? 'Esa manicurista ya tiene un porcentaje configurado para ese servicio. Edítalo abajo en vez de duplicarlo.'
          : 'Error: ' + error.message
      )
      return
    }
    setNuevo({ tipo_servicio_id: '', manicurista_id: '', porcentaje: '' })
    cargar()
  }

  const cambiarPorcentaje = async (id, valor) => {
    await supabase.from('servicios_manicurista').update({ porcentaje: Number(valor) }).eq('id', id)
    cargar()
  }

  const quitar = async (id) => {
    if (!confirm('¿Quitar este porcentaje configurado?')) return
    await supabase.from('servicios_manicurista').update({ activo: false }).eq('id', id)
    cargar()
  }

  return (
    <div className="max-w-2xl">
      <h2 className="font-display text-2xl mb-1">Servicios por manicurista</h2>
      <p className="text-sm mb-6" style={{ color: 'var(--color-text-muted)' }}>
        Define qué % gana cada manicurista por cada tipo de servicio. Ej: Esmaltado tradicional →
        Naiffe 50%, Paola 55%. Esto se usa para llenar el porcentaje automáticamente al registrar un servicio.
      </p>

      <form onSubmit={agregar} className="card p-4 mb-6 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[160px]">
          <label className="block text-xs font-medium mb-1">Tipo de servicio</label>
          <select
            value={nuevo.tipo_servicio_id}
            onChange={(e) => setNuevo({ ...nuevo, tipo_servicio_id: e.target.value })}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <option value="">Selecciona…</option>
            {tipos.map((t) => (
              <option key={t.id} value={t.id}>{t.nombre}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="block text-xs font-medium mb-1">Manicurista</label>
          <select
            value={nuevo.manicurista_id}
            onChange={(e) => setNuevo({ ...nuevo, manicurista_id: e.target.value })}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <option value="">Selecciona…</option>
            {manicuristas.map((m) => (
              <option key={m.id} value={m.id}>{m.nombre}</option>
            ))}
          </select>
        </div>
        <div className="w-24">
          <label className="block text-xs font-medium mb-1">%</label>
          <input
            type="number" min="0" max="100"
            value={nuevo.porcentaje}
            onChange={(e) => setNuevo({ ...nuevo, porcentaje: e.target.value })}
            className="w-full rounded-lg border px-3 py-2 text-sm font-mono-num"
            style={{ borderColor: 'var(--color-border)' }}
            placeholder="50"
          />
        </div>
        <button
          type="submit"
          className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
          style={{ background: 'var(--color-primary)' }}
        >
          Agregar
        </button>
      </form>
      {status && <p className="text-sm mb-4" style={{ color: 'var(--color-danger)' }}>{status}</p>}

      <div className="card divide-y" style={{ borderColor: 'var(--color-border)' }}>
        {loading ? (
          <p className="p-4 text-sm" style={{ color: 'var(--color-text-muted)' }}>Cargando…</p>
        ) : vinculos.length === 0 ? (
          <p className="p-4 text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Aún no has configurado ningún porcentaje. Mientras tanto, al registrar un servicio se usará
            el % por defecto de cada manicurista (pestaña Equipo).
          </p>
        ) : (
          vinculos.map((v) => (
            <div key={v.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{v.tipos_servicio?.nombre}</p>
                <p className="text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>
                  {v.manicuristas?.nombre}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <label className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  %
                  <input
                    type="number" min="0" max="100"
                    defaultValue={v.porcentaje}
                    onBlur={(e) => cambiarPorcentaje(v.id, e.target.value)}
                    className="w-16 ml-1 rounded border px-2 py-1 text-sm font-mono-num"
                    style={{ borderColor: 'var(--color-border)' }}
                  />
                </label>
                <button
                  onClick={() => quitar(v.id)}
                  className="text-xs font-medium rounded-full px-3 py-1"
                  style={{ background: 'var(--color-danger-soft)', color: 'var(--color-danger)' }}
                >
                  Quitar
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
