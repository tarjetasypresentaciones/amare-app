import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import ImportarExcel from '../components/ImportarExcel'
import { currency, shortDate, todayISO } from '../utils/format'
import PolishDot from '../components/PolishDot'

// Deja solo dígitos y arma el link de WhatsApp (wa.me exige el número sin '+', espacios ni guiones)
const linkWhatsapp = (telefono) => {
  const soloDigitos = (telefono || '').replace(/\D/g, '')
  return `https://wa.me/${soloDigitos}`
}

const COLUMNAS_IMPORTAR = [
  { key: 'nombre', etiqueta: 'Nombre', requerido: true, tipo: 'texto', ejemplo: 'María' },
  { key: 'apellido', etiqueta: 'Apellido', requerido: true, tipo: 'texto', ejemplo: 'Gómez' },
  { key: 'correo', etiqueta: 'Correo', requerido: false, tipo: 'texto', ejemplo: 'maria@correo.com' },
  { key: 'telefono', etiqueta: 'Teléfono', requerido: false, tipo: 'texto', ejemplo: '3001234567' },
  { key: 'tiene_whatsapp', etiqueta: 'Tiene WhatsApp (Sí/No)', requerido: false, tipo: 'booleano', ejemplo: 'Sí' },
]

export default function Clientes() {
  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [nuevo, setNuevo] = useState({
    nombre: '', apellido: '', correo: '', telefono: '', tiene_whatsapp: true,
  })
  const [editandoId, setEditandoId] = useState(null)
  const [status, setStatus] = useState('')

  // --- Historial de servicios por cliente (panel derecho) ---
  const [filtroDesde, setFiltroDesde] = useState(todayISO())
  const [filtroHasta, setFiltroHasta] = useState(todayISO())
  const [filtroCliente, setFiltroCliente] = useState('')
  const [filtroRecibo, setFiltroRecibo] = useState('')
  const [historial, setHistorial] = useState([])
  const [loadingHistorial, setLoadingHistorial] = useState(true)

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

  const cargarHistorial = () => {
    setLoadingHistorial(true)
    let query = supabase
      .from('registros_servicios')
      .select('id, fecha, numero_recibo, tipo_servicio, costo, cliente_nombre, manicuristas(nombre, color)')
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(300)

    if (filtroDesde) query = query.gte('fecha', filtroDesde)
    if (filtroHasta) query = query.lte('fecha', filtroHasta)
    if (filtroCliente.trim()) query = query.ilike('cliente_nombre', `%${filtroCliente.trim()}%`)
    if (filtroRecibo.trim()) {
      const n = parseInt(filtroRecibo.trim(), 10)
      if (!isNaN(n)) query = query.eq('numero_recibo', n)
    }

    query.then(({ data, error }) => {
      if (!error) setHistorial(data ?? [])
      setLoadingHistorial(false)
    })
  }

  useEffect(cargarHistorial, [filtroDesde, filtroHasta, filtroCliente, filtroRecibo])

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

  const verHistorialDe = (c) => {
    setFiltroCliente(`${c.nombre} ${c.apellido}`)
    setFiltroDesde('')
    setFiltroHasta('')
    setFiltroRecibo('')
  }

  const clientesFiltrados = clientes.filter((c) => {
    const texto = `${c.nombre} ${c.apellido} ${c.correo ?? ''} ${c.telefono ?? ''}`.toLowerCase()
    return texto.includes(busqueda.toLowerCase())
  })

  const importarClientes = async (filas) => {
    let ok = 0
    const fallos = []
    for (const fila of filas) {
      const { error } = await supabase.from('clientes').insert({
        nombre: fila.nombre,
        apellido: fila.apellido,
        correo: fila.correo || null,
        telefono: fila.telefono || null,
        tiene_whatsapp: fila.tiene_whatsapp,
      })
      if (error) fallos.push({ fila, error: error.message })
      else ok++
    }
    return { ok, fallos }
  }

  return (
    <div className="max-w-6xl">
      <div className="grid lg:grid-cols-2 gap-6 items-start">
        {/* --- Columna izquierda: alta y lista de clientes --- */}
        <div>
          <div className="flex items-start justify-between gap-3 mb-1">
            <h2 className="font-display text-2xl">Clientes</h2>
            <ImportarExcel
              titulo="Importar clientes desde Excel"
              nombreArchivo="plantilla_clientes"
              columnas={COLUMNAS_IMPORTAR}
              onImportar={importarClientes}
              onTerminado={cargar}
            />
          </div>
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
                    <button
                      type="button"
                      onClick={() => verHistorialDe(c)}
                      className="text-sm font-medium truncate text-left hover:underline"
                    >
                      {c.nombre} {c.apellido}
                    </button>
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

        {/* --- Columna derecha: historial de servicios --- */}
        <div>
          <h2 className="font-display text-2xl mb-1">Historial por cliente</h2>
          <p className="text-sm mb-6" style={{ color: 'var(--color-text-muted)' }}>
            Servicios registrados, del más reciente al más antiguo. Haz clic en un cliente de la izquierda para filtrar su historial.
          </p>

          <div className="card p-4 mb-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">Desde</label>
                <input
                  type="date"
                  value={filtroDesde}
                  onChange={(e) => setFiltroDesde(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  style={{ borderColor: 'var(--color-border)' }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Hasta</label>
                <input
                  type="date"
                  value={filtroHasta}
                  onChange={(e) => setFiltroHasta(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  style={{ borderColor: 'var(--color-border)' }}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">Cliente</label>
                <input
                  type="text"
                  value={filtroCliente}
                  onChange={(e) => setFiltroCliente(e.target.value)}
                  placeholder="Nombre del cliente"
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  style={{ borderColor: 'var(--color-border)' }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">N.º de recibo</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={filtroRecibo}
                  onChange={(e) => setFiltroRecibo(e.target.value)}
                  placeholder="Ej: 12"
                  className="w-full rounded-lg border px-3 py-2 text-sm font-mono-num"
                  style={{ borderColor: 'var(--color-border)' }}
                />
              </div>
            </div>
            {(filtroDesde || filtroHasta || filtroCliente || filtroRecibo) && (
              <button
                type="button"
                onClick={() => {
                  setFiltroDesde('')
                  setFiltroHasta('')
                  setFiltroCliente('')
                  setFiltroRecibo('')
                }}
                className="text-xs font-medium"
                style={{ color: 'var(--color-primary)' }}
              >
                Quitar filtros
              </button>
            )}
          </div>

          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left" style={{ color: 'var(--color-text-muted)' }}>
                    <th className="px-3 py-2 font-medium">Fecha</th>
                    <th className="px-3 py-2 font-medium">Recibo</th>
                    <th className="px-3 py-2 font-medium">Cliente</th>
                    <th className="px-3 py-2 font-medium">Manicurista</th>
                    <th className="px-3 py-2 font-medium">Servicio</th>
                    <th className="px-3 py-2 font-medium text-right">Pagado</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingHistorial ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-4 text-sm" style={{ color: 'var(--color-text-muted)' }}>
                        Cargando…
                      </td>
                    </tr>
                  ) : historial.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-4 text-sm" style={{ color: 'var(--color-text-muted)' }}>
                        Sin servicios para este filtro.
                      </td>
                    </tr>
                  ) : (
                    historial.map((r) => (
                      <tr key={r.id} className="border-t" style={{ borderColor: 'var(--color-border)' }}>
                        <td className="px-3 py-2 whitespace-nowrap">{shortDate(r.fecha)}</td>
                        <td className="px-3 py-2 whitespace-nowrap font-mono-num" style={{ color: 'var(--color-text-muted)' }}>
                          {r.numero_recibo ? `N.º ${String(r.numero_recibo).padStart(6, '0')}` : '—'}
                        </td>
                        <td className="px-3 py-2" style={{ color: 'var(--color-text-muted)' }}>{r.cliente_nombre || '—'}</td>
                        <td className="px-3 py-2">
                          <PolishDot color={r.manicuristas?.color} label={r.manicuristas?.nombre} />
                        </td>
                        <td className="px-3 py-2">{r.tipo_servicio}</td>
                        <td className="px-3 py-2 text-right font-mono-num font-medium">{currency(r.costo)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
