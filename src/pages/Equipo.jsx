import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import PolishDot from '../components/PolishDot'

const COLORES = ['#7A2E3A', '#C9A24B', '#4E8577', '#8E5B9B', '#3C6E8F', '#B3462C']

export default function Equipo() {
  const [manicuristas, setManicuristas] = useState([])
  const [loading, setLoading] = useState(true)
  const [nuevo, setNuevo] = useState({ nombre: '', porcentaje_default: 50, color: COLORES[0] })
  const [status, setStatus] = useState('')

  const cargar = () => {
    supabase
      .from('manicuristas')
      .select('id, nombre, porcentaje_default, color, activo')
      .order('nombre')
      .then(({ data }) => {
        setManicuristas(data ?? [])
        setLoading(false)
      })
  }

  useEffect(cargar, [])

  const agregar = async (e) => {
    e.preventDefault()
    setStatus('')
    if (!nuevo.nombre.trim()) return
    const { error } = await supabase.from('manicuristas').insert({
      nombre: nuevo.nombre.trim(),
      porcentaje_default: Number(nuevo.porcentaje_default),
      color: nuevo.color,
    })
    if (error) {
      setStatus('Error: ' + error.message)
      return
    }
    setNuevo({ nombre: '', porcentaje_default: 50, color: COLORES[(manicuristas.length + 1) % COLORES.length] })
    cargar()
  }

  const toggleActivo = async (m) => {
    await supabase.from('manicuristas').update({ activo: !m.activo }).eq('id', m.id)
    cargar()
  }

  const cambiarPorcentaje = async (m, valor) => {
    await supabase.from('manicuristas').update({ porcentaje_default: Number(valor) }).eq('id', m.id)
    cargar()
  }

  return (
    <div className="max-w-2xl">
      <h2 className="font-display text-2xl mb-1">Equipo</h2>
      <p className="text-sm mb-6" style={{ color: 'var(--color-text-muted)' }}>
        Agrega manicuristas y ajusta su porcentaje por defecto.
      </p>

      <form onSubmit={agregar} className="card p-4 mb-6 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[140px]">
          <label className="block text-xs font-medium mb-1">Nombre</label>
          <input
            type="text"
            value={nuevo.nombre}
            onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: 'var(--color-border)' }}
            placeholder="Nombre de la manicurista"
          />
        </div>
        <div className="w-28">
          <label className="block text-xs font-medium mb-1">% por defecto</label>
          <input
            type="number" min="0" max="100"
            value={nuevo.porcentaje_default}
            onChange={(e) => setNuevo({ ...nuevo, porcentaje_default: e.target.value })}
            className="w-full rounded-lg border px-3 py-2 text-sm font-mono-num"
            style={{ borderColor: 'var(--color-border)' }}
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Color</label>
          <div className="flex gap-1.5 pt-1.5">
            {COLORES.map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => setNuevo({ ...nuevo, color: c })}
                className="w-6 h-6 rounded-full"
                style={{ background: c, outline: nuevo.color === c ? '2px solid var(--color-text)' : 'none', outlineOffset: 2 }}
                aria-label={`Elegir color ${c}`}
              />
            ))}
          </div>
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
        ) : (
          manicuristas.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-3 px-4 py-3" style={{ borderColor: 'var(--color-border)' }}>
              <PolishDot color={m.color} label={m.nombre} />
              <div className="flex items-center gap-3">
                <label className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  %
                  <input
                    type="number" min="0" max="100"
                    defaultValue={m.porcentaje_default}
                    onBlur={(e) => cambiarPorcentaje(m, e.target.value)}
                    className="w-16 ml-1 rounded border px-2 py-1 text-sm font-mono-num"
                    style={{ borderColor: 'var(--color-border)' }}
                  />
                </label>
                <button
                  onClick={() => toggleActivo(m)}
                  className="text-xs font-medium rounded-full px-3 py-1"
                  style={{
                    background: m.activo ? 'var(--color-success-soft)' : 'var(--color-danger-soft)',
                    color: m.activo ? 'var(--color-success)' : 'var(--color-danger)',
                  }}
                >
                  {m.activo ? 'Activa' : 'Inactiva'}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <p className="text-xs mt-4" style={{ color: 'var(--color-text-muted)' }}>
        Para dar acceso a la app a una nueva manicurista: crea su usuario en Supabase (Authentication →
        Add user) y luego agrégala en la tabla <code>profiles</code> con <code>role = 'manicurista'</code> y
        el <code>manicurista_id</code> correspondiente. Instrucciones detalladas en el README.
      </p>
    </div>
  )
}
