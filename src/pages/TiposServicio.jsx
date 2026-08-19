import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import ImportarExcel from '../components/ImportarExcel'
import { currency } from '../utils/format'

const COLUMNAS_IMPORTAR = [
  { key: 'nombre', etiqueta: 'Nombre', requerido: true, tipo: 'texto', ejemplo: 'Manicure clásico' },
  { key: 'precio_sugerido', etiqueta: 'Precio', requerido: false, tipo: 'numero', ejemplo: '30000' },
  { key: 'duracion_minutos', etiqueta: 'Duración (minutos)', requerido: false, tipo: 'numero', ejemplo: '35' },
]

export default function TiposServicio() {
  const [tipos, setTipos] = useState([])
  const [loading, setLoading] = useState(true)
  const [nuevo, setNuevo] = useState({ nombre: '', precio_sugerido: '', duracion_minutos: 30 })
  const [editandoId, setEditandoId] = useState(null)
  const [status, setStatus] = useState('')

  const cargar = () => {
    supabase
      .from('tipos_servicio')
      .select('id, nombre, precio_sugerido, duracion_minutos, activo')
      .eq('activo', true)
      .order('nombre')
      .then(({ data }) => {
        setTipos(data ?? [])
        setLoading(false)
      })
  }

  useEffect(cargar, [])

  const limpiarForm = () => {
    setNuevo({ nombre: '', precio_sugerido: '', duracion_minutos: 30 })
    setEditandoId(null)
  }

  const guardar = async (e) => {
    e.preventDefault()
    setStatus('')
    if (!nuevo.nombre.trim()) {
      setStatus('El nombre es obligatorio.')
      return
    }
    const payload = {
      nombre: nuevo.nombre.trim(),
      precio_sugerido: nuevo.precio_sugerido === '' ? null : Number(nuevo.precio_sugerido),
      duracion_minutos: Number(nuevo.duracion_minutos) || 30,
    }
    const { error } = editandoId
      ? await supabase.from('tipos_servicio').update(payload).eq('id', editandoId)
      : await supabase.from('tipos_servicio').insert(payload)

    if (error) {
      setStatus(
        error.code === '23505'
          ? 'Ya existe un tipo de servicio con ese nombre.'
          : 'Error: ' + error.message
      )
      return
    }
    limpiarForm()
    cargar()
  }

  const editar = (t) => {
    setEditandoId(t.id)
    setNuevo({
      nombre: t.nombre,
      precio_sugerido: t.precio_sugerido ?? '',
      duracion_minutos: t.duracion_minutos ?? 30,
    })
  }

  const desactivar = async (t) => {
    if (!confirm(`¿Quitar "${t.nombre}" de la lista de servicios?`)) return
    await supabase.from('tipos_servicio').update({ activo: false }).eq('id', t.id)
    cargar()
  }

  const importarTipos = async (filas) => {
    let ok = 0
    const fallos = []
    for (const fila of filas) {
      const { error } = await supabase.from('tipos_servicio').insert({
        nombre: fila.nombre,
        precio_sugerido: fila.precio_sugerido,
        duracion_minutos: fila.duracion_minutos ?? 30,
      })
      if (error) {
        fallos.push({
          fila,
          error: error.code === '23505' ? 'Ya existe un servicio con este nombre' : error.message,
        })
      } else ok++
    }
    return { ok, fallos }
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h2 className="font-display text-2xl">Tipos de servicio</h2>
        <ImportarExcel
          titulo="Importar tipos de servicio desde Excel"
          nombreArchivo="plantilla_tipos_servicio"
          columnas={COLUMNAS_IMPORTAR}
          onImportar={importarTipos}
          onTerminado={cargar}
        />
      </div>
      <p className="text-sm mb-6" style={{ color: 'var(--color-text-muted)' }}>
        El catálogo de servicios que ofrece el spa. La <strong>duración</strong> es la que usa el
        Calendario para calcular automáticamente a qué hora termina una cita.
      </p>

      <form onSubmit={guardar} className="card p-4 mb-6 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[160px]">
          <label className="block text-xs font-medium mb-1">Nombre</label>
          <input
            type="text"
            value={nuevo.nombre}
            onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: 'var(--color-border)' }}
            placeholder="Manicure clásico"
          />
        </div>
        <div className="w-32">
          <label className="block text-xs font-medium mb-1">Precio sugerido</label>
          <input
            type="number" min="0"
            value={nuevo.precio_sugerido}
            onChange={(e) => setNuevo({ ...nuevo, precio_sugerido: e.target.value })}
            className="w-full rounded-lg border px-3 py-2 text-sm font-mono-num"
            style={{ borderColor: 'var(--color-border)' }}
            placeholder="30000"
          />
        </div>
        <div className="w-32">
          <label className="block text-xs font-medium mb-1">Duración (min)</label>
          <input
            type="number" min="5" step="5"
            value={nuevo.duracion_minutos}
            onChange={(e) => setNuevo({ ...nuevo, duracion_minutos: e.target.value })}
            className="w-full rounded-lg border px-3 py-2 text-sm font-mono-num"
            style={{ borderColor: 'var(--color-border)' }}
          />
        </div>
        <button
          type="submit"
          className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
          style={{ background: 'var(--color-primary)' }}
        >
          {editandoId ? 'Guardar cambios' : 'Agregar'}
        </button>
        {editandoId && (
          <button
            type="button"
            onClick={limpiarForm}
            className="rounded-lg px-4 py-2 text-sm font-medium"
            style={{ border: '1px solid var(--color-border)' }}
          >
            Cancelar
          </button>
        )}
      </form>
      {status && <p className="text-sm mb-4" style={{ color: 'var(--color-danger)' }}>{status}</p>}

      <div className="card divide-y" style={{ borderColor: 'var(--color-border)' }}>
        {loading ? (
          <p className="p-4 text-sm" style={{ color: 'var(--color-text-muted)' }}>Cargando…</p>
        ) : tipos.length === 0 ? (
          <p className="p-4 text-sm" style={{ color: 'var(--color-text-muted)' }}>Sin servicios todavía.</p>
        ) : (
          tipos.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{t.nombre}</p>
                <p className="text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>
                  {t.precio_sugerido != null ? currency(t.precio_sugerido) : 'Sin precio sugerido'}
                  {' · '}{t.duracion_minutos ?? 30} min
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => editar(t)}
                  className="text-xs font-medium rounded-full px-3 py-1"
                  style={{ border: '1px solid var(--color-border)' }}
                >
                  Editar
                </button>
                <button
                  onClick={() => desactivar(t)}
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
