import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

// Deja solo dígitos y arma el link de WhatsApp (wa.me exige el número sin '+', espacios ni guiones)
const linkWhatsapp = (telefono) => {
  const soloDigitos = (telefono || '').replace(/\D/g, '')
  return `https://wa.me/${soloDigitos}`
}

export default function Clientes() {
  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [nuevo, setNuevo] = useState({
    nombre: '', apellido: '', correo: '', telefono: '', tiene_whatsapp: true,
  })
  const [editandoId, setEditandoId] = useState(null)
  const [status, setStatus] = useState('')

  const cargar = () => {
    supabase
      .from('clientes')
      .select('id, nombre, apellido, correo, telefono, tiene_whatsapp, activo')
      .eq('activo', true)
      .order('nombre')
      .then(({ data, error }) => {
        if (error) setStatus('Error al cargar: ' + error.message)
        setClientes(data ?? [])
        setLoading(false)
      })
  }

  useEffect(cargar, [])

  const limpiarForm = () => {
    setNuevo({ nombre: '', apellido: '', correo: '', telefono: '', tiene_whatsapp: true })
    setEditandoId(null)
  }

  const guardar = async (e) => {
    e.preventDefault()
    setStatus('')
    if (!nuevo.nombre.trim() || !nuevo.apellido.trim()) {
      setStatus('Nombre y apellido son obligatorios.')
      return
    }

    const payload = {
      nombre: nuevo.nombre.trim(),
      apellido: nuevo.apellido.trim(),
      correo: nuevo.correo.trim() || null,
      telefono: nuevo.telefono.trim() || null,
      tiene_whatsapp: nuevo.tiene_whatsapp,
    }

    const { error } = editandoId
      ? await supabase.from('clientes').update(payload).eq('id', editandoId)
      : await supabase.from('clientes').insert(payload)

    if (error) {
      setStatus('Error: ' + error.message)
      return
    }
    limpiarForm()
    cargar()
  }

  const editar = (c) => {
    setEditandoId(c.id)
    setNuevo({
      nombre: c.nombre,
      apellido: c.apellido,
      correo: c.correo ?? '',
      telefono: c.telefono ?? '',
      tiene_whatsapp: c.tiene_whatsapp,
    })
  }

  const desactivar = async (c) => {
    if (!confirm(`¿Quitar a ${c.nombre} ${c.apellido} de la lista de clientes?`)) return
    await supabase.from('clientes').update({ activo: false }).eq('id', c.id)
    cargar()
  }

  const clientesFiltrados = clientes.filter((c) => {
    const texto = `${c.nombre} ${c.apellido} ${c.correo ?? ''} ${c.telefono ?? ''}`.toLowerCase()
    return texto.includes(busqueda.toLowerCase())
  })

  return (
    <div className="max-w-2xl">
      <h2 className="font-display text-2xl mb-1">Clientes</h2>
      <p className="text-sm mb-6" style={{ color: 'var(--color-text-muted)' }}>
        Base de datos de clientes del spa. Se usan para llenar el campo "Cliente" al registrar un servicio.
      </p>

      <form onSubmit={guardar} className="card p-4 mb-6 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1">Nombre</label>
            <input
              type="text"
              value={nuevo.nombre}
              onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: 'var(--color-border)' }}
              placeholder="María"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Apellido</label>
            <input
              type="text"
              value={nuevo.apellido}
              onChange={(e) => setNuevo({ ...nuevo, apellido: e.target.value })}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: 'var(--color-border)' }}
              placeholder="Gómez"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1">Correo (opcional)</label>
            <input
              type="email"
              value={nuevo.correo}
              onChange={(e) => setNuevo({ ...nuevo, correo: e.target.value })}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: 'var(--color-border)' }}
              placeholder="maria@correo.com"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Teléfono / WhatsApp</label>
            <input
              type="tel"
              value={nuevo.telefono}
              onChange={(e) => setNuevo({ ...nuevo, telefono: e.target.value })}
              className="w-full rounded-lg border px-3 py-2 text-sm font-mono-num"
              style={{ borderColor: 'var(--color-border)' }}
              placeholder="+57 300 000 0000"
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={nuevo.tiene_whatsapp}
            onChange={(e) => setNuevo({ ...nuevo, tiene_whatsapp: e.target.checked })}
          />
          Este número tiene WhatsApp
        </label>

        {status && <p className="text-sm" style={{ color: 'var(--color-danger)' }}>{status}</p>}

        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
            style={{ background: 'var(--color-primary)' }}
          >
            {editandoId ? 'Guardar cambios' : 'Agregar cliente'}
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
        </div>
      </form>

      <input
        type="text"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar cliente…"
        className="w-full rounded-lg border px-3 py-2 text-sm mb-4"
        style={{ borderColor: 'var(--color-border)' }}
      />

      <div className="card divide-y" style={{ borderColor: 'var(--color-border)' }}>
        {loading ? (
          <p className="p-4 text-sm" style={{ color: 'var(--color-text-muted)' }}>Cargando…</p>
        ) : clientesFiltrados.length === 0 ? (
          <p className="p-4 text-sm" style={{ color: 'var(--color-text-muted)' }}>Sin clientes todavía.</p>
        ) : (
          clientesFiltrados.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{c.nombre} {c.apellido}</p>
                <p className="text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>
                  {[c.telefono, c.correo].filter(Boolean).join(' · ') || 'Sin datos de contacto'}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {c.telefono && c.tiene_whatsapp && (
                  <a
                    href={linkWhatsapp(c.telefono)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium rounded-full px-3 py-1"
                    style={{ background: 'var(--color-success-soft)', color: 'var(--color-success)' }}
                  >
                    WhatsApp
                  </a>
                )}
                <button
                  onClick={() => editar(c)}
                  className="text-xs font-medium rounded-full px-3 py-1"
                  style={{ border: '1px solid var(--color-border)' }}
                >
                  Editar
                </button>
                <button
                  onClick={() => desactivar(c)}
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
