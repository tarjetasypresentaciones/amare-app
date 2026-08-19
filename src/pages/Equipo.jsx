import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import PolishDot from '../components/PolishDot'
import Avatar from '../components/Avatar'
import ImportarExcel from '../components/ImportarExcel'

const COLORES = ['#7A2E3A', '#C9A24B', '#4E8577', '#8E5B9B', '#3C6E8F', '#B3462C']
const BUCKET_FOTOS = 'fotos-manicuristas'

const COLUMNAS_IMPORTAR = [
  { key: 'nombre', etiqueta: 'Nombre', requerido: true, tipo: 'texto', ejemplo: 'Naiffe Chacón' },
  { key: 'porcentaje_default', etiqueta: 'Porcentaje', requerido: false, tipo: 'numero', ejemplo: '50' },
  { key: 'direccion', etiqueta: 'Dirección', requerido: false, tipo: 'texto', ejemplo: 'Barrio Centro, Bogotá' },
  { key: 'telefono', etiqueta: 'Teléfono', requerido: false, tipo: 'texto', ejemplo: '3001234567' },
  { key: 'tiene_whatsapp', etiqueta: 'Tiene WhatsApp (Sí/No)', requerido: false, tipo: 'booleano', ejemplo: 'Sí' },
]

export default function Equipo() {
  const [manicuristas, setManicuristas] = useState([])
  const [loading, setLoading] = useState(true)
  const [nuevo, setNuevo] = useState({ nombre: '', porcentaje_default: 50, color: COLORES[0] })
  const [status, setStatus] = useState('')
  const [subiendoFotoId, setSubiendoFotoId] = useState(null)

  // Modal de datos (dirección / teléfono / whatsapp)
  const [editandoDatosId, setEditandoDatosId] = useState(null)
  const [formDatos, setFormDatos] = useState({ direccion: '', telefono: '', tiene_whatsapp: false })

  const inputsFoto = useRef({})

  const cargar = () => {
    supabase
      .from('manicuristas')
      .select('id, nombre, porcentaje_default, color, activo, foto_url, direccion, telefono, tiene_whatsapp')
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

  // --- Foto ---
  const elegirFoto = (manicuristaId) => {
    inputsFoto.current[manicuristaId]?.click()
  }

  const subirFoto = async (manicurista, file) => {
    if (!file) return
    setStatus('')
    setSubiendoFotoId(manicurista.id)

    const extension = file.name.split('.').pop()
    const ruta = `${manicurista.id}-${Date.now()}.${extension}`

    const { error: errorSubida } = await supabase
      .storage
      .from(BUCKET_FOTOS)
      .upload(ruta, file, { upsert: true, cacheControl: '3600' })

    if (errorSubida) {
      setStatus('Error subiendo la foto: ' + errorSubida.message)
      setSubiendoFotoId(null)
      return
    }

    const { data } = supabase.storage.from(BUCKET_FOTOS).getPublicUrl(ruta)

    const { error: errorGuardado } = await supabase
      .from('manicuristas')
      .update({ foto_url: data.publicUrl })
      .eq('id', manicurista.id)

    if (errorGuardado) {
      setStatus('Error guardando la foto: ' + errorGuardado.message)
    }

    setSubiendoFotoId(null)
    cargar()
  }

  // --- Datos (dirección / teléfono / whatsapp) ---
  const abrirDatos = (m) => {
    setEditandoDatosId(m.id)
    setFormDatos({
      direccion: m.direccion ?? '',
      telefono: m.telefono ?? '',
      tiene_whatsapp: m.tiene_whatsapp ?? false,
    })
  }

  const guardarDatos = async (e) => {
    e.preventDefault()
    await supabase
      .from('manicuristas')
      .update({
        direccion: formDatos.direccion.trim() || null,
        telefono: formDatos.telefono.trim() || null,
        tiene_whatsapp: formDatos.tiene_whatsapp,
      })
      .eq('id', editandoDatosId)
    setEditandoDatosId(null)
    cargar()
  }

  // --- Importar desde Excel ---
  const importarManicuristas = async (filas) => {
    let ok = 0
    const fallos = []
    for (const [i, fila] of filas.entries()) {
      const { error } = await supabase.from('manicuristas').insert({
        nombre: fila.nombre,
        porcentaje_default: fila.porcentaje_default ?? 50,
        color: COLORES[i % COLORES.length],
        direccion: fila.direccion || null,
        telefono: fila.telefono || null,
        tiene_whatsapp: fila.tiene_whatsapp,
      })
      if (error) fallos.push({ fila, error: error.message })
      else ok++
    }
    return { ok, fallos }
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h2 className="font-display text-2xl">Equipo</h2>
        <ImportarExcel
          titulo="Importar manicuristas desde Excel"
          nombreArchivo="plantilla_manicuristas"
          columnas={COLUMNAS_IMPORTAR}
          onImportar={importarManicuristas}
          onTerminado={cargar}
        />
      </div>
      <p className="text-sm mb-6" style={{ color: 'var(--color-text-muted)' }}>
        Agrega manicuristas, su foto, datos de contacto y ajusta su porcentaje por defecto.
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
            <div key={m.id} className="flex items-center justify-between gap-3 px-4 py-3 flex-wrap">
              <div className="flex items-center gap-3 min-w-0">
                <div className="relative shrink-0">
                  <Avatar url={m.foto_url} nombre={m.nombre} size={44} />
                  <button
                    type="button"
                    onClick={() => elegirFoto(m.id)}
                    disabled={subiendoFotoId === m.id}
                    title="Cambiar foto"
                    className="absolute -bottom-1 -right-1 rounded-full w-5 h-5 flex items-center justify-center text-[11px]"
                    style={{ background: 'var(--color-primary)', color: '#fff', border: '2px solid var(--color-surface)' }}
                  >
                    {subiendoFotoId === m.id ? '…' : '📷'}
                  </button>
                  <input
                    ref={(el) => (inputsFoto.current[m.id] = el)}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => subirFoto(m, e.target.files?.[0])}
                  />
                </div>
                <div className="min-w-0">
                  <PolishDot color={m.color} label={m.nombre} />
                  <p className="text-xs truncate mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                    {[m.telefono, m.direccion].filter(Boolean).join(' · ') || 'Sin datos de contacto'}
                    {m.telefono && m.tiene_whatsapp && ' · WhatsApp'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
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
                  onClick={() => abrirDatos(m)}
                  className="text-xs font-medium rounded-full px-3 py-1"
                  style={{ border: '1px solid var(--color-border)' }}
                >
                  Editar datos
                </button>
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

      {/* Modal: dirección / teléfono / whatsapp */}
      {editandoDatosId && (
        <div className="fixed inset-0 z-20 flex items-center justify-center p-4" style={{ background: 'rgba(45,34,48,0.4)' }}>
          <form onSubmit={guardarDatos} className="card p-5 w-full max-w-sm space-y-3" style={{ background: 'var(--color-surface)' }}>
            <h3 className="font-display text-lg">
              Datos de {manicuristas.find((m) => m.id === editandoDatosId)?.nombre}
            </h3>
            <div>
              <label className="block text-xs font-medium mb-1">Dirección</label>
              <input
                type="text"
                value={formDatos.direccion}
                onChange={(e) => setFormDatos({ ...formDatos, direccion: e.target.value })}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: 'var(--color-border)' }}
                placeholder="Barrio, ciudad…"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Teléfono</label>
              <input
                type="tel"
                value={formDatos.telefono}
                onChange={(e) => setFormDatos({ ...formDatos, telefono: e.target.value })}
                className="w-full rounded-lg border px-3 py-2 text-sm font-mono-num"
                style={{ borderColor: 'var(--color-border)' }}
                placeholder="+57 300 000 0000"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={formDatos.tiene_whatsapp}
                onChange={(e) => setFormDatos({ ...formDatos, tiene_whatsapp: e.target.checked })}
              />
              Este número tiene WhatsApp
            </label>
            <div className="flex gap-2 pt-1">
              <button type="submit" className="rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ background: 'var(--color-primary)' }}>Guardar</button>
              <button type="button" onClick={() => setEditandoDatosId(null)} className="rounded-lg px-4 py-2 text-sm font-medium" style={{ border: '1px solid var(--color-border)' }}>Cancelar</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
