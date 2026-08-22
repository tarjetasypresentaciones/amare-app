import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import PolishDot from '../components/PolishDot'
import Avatar from '../components/Avatar'
import {
  generarSlots, minutosATexto, textoAMinutos, sumarMinutos,
  fechaISO, esFinDeSemana, nombreDia, PASO_MINUTOS,
  HORA_INICIO_CLIENTE, HORA_FIN_CLIENTE, esHoy, minutosAhora,
} from '../utils/calendario'

const slots = generarSlots()
const ROW_REM = 3 // alto de cada franja de 30 min — fijo, para que las citas de varias franjas se vean como un solo bloque continuo

// Deja solo dígitos y arma el link de WhatsApp (mismo criterio que en Clientes)
const linkWhatsapp = (telefono) => {
  const soloDigitos = (telefono || '').replace(/\D/g, '')
  return `https://wa.me/${soloDigitos}`
}

export default function CalendarioAdmin() {
  const [fecha, setFecha] = useState(new Date())
  const [manicuristas, setManicuristas] = useState([])
  const [clientes, setClientes] = useState([])
  const [tiposServicio, setTiposServicio] = useState([])
  const [agendamientos, setAgendamientos] = useState([])
  const [diasLibres, setDiasLibres] = useState([])
  const [franjas, setFranjas] = useState([])
  const [solicitudesPendientes, setSolicitudesPendientes] = useState({ dias: [], franjas: [] })
  const [motivos, setMotivos] = useState([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')

  // Formulario para agendar un servicio en un slot vacío
  const [slotSeleccionado, setSlotSeleccionado] = useState(null) // { manicuristaId, minutos }
  const [formAgenda, setFormAgenda] = useState({ cliente_id: '', tipo_servicio_id: '' })

  // Formulario para editar una cita ya agendada
  const [citaEditando, setCitaEditando] = useState(null) // la fila completa de agendamientos_servicios
  const [formEditar, setFormEditar] = useState({ fecha: '', hora_inicio: '', tipo_servicio_id: '' })
  const [statusEditar, setStatusEditar] = useState('')

  // Formulario para asignar día libre directo (sábado/domingo) o bloquear un día ya agendado
  const [mostrarDiaLibreFinde, setMostrarDiaLibreFinde] = useState(false)

  const iso = fechaISO(fecha)
  const esHoyVista = esHoy(fecha)

  // Refresca cada minuto para que las franjas se vayan bloqueando a medida que avanza la hora
  const [, forzarActualizacion] = useState(0)
  useEffect(() => {
    const intervalo = setInterval(() => forzarActualizacion((n) => n + 1), 60 * 1000)
    return () => clearInterval(intervalo)
  }, [])

  const cargarCatalogos = () => {
    supabase.from('manicuristas').select('id, nombre, color, foto_url').eq('activo', true).order('nombre')
      .then(({ data }) => setManicuristas(data ?? []))
    supabase.from('clientes').select('id, nombre, apellido, telefono, tiene_whatsapp').eq('activo', true).order('nombre')
      .then(({ data }) => setClientes(data ?? []))
    supabase.from('tipos_servicio').select('id, nombre, duracion_minutos').eq('activo', true).order('nombre')
      .then(({ data }) => setTiposServicio(data ?? []))
  }

  const cargarDia = () => {
    setLoading(true)
    Promise.all([
      supabase
        .from('agendamientos_servicios')
        .select('id, manicurista_id, cliente_id, tipo_servicio_id, hora_inicio, hora_fin, estado, clientes(nombre, apellido, telefono, tiene_whatsapp), tipos_servicio(nombre)')
        .eq('fecha', iso)
        .eq('estado', 'confirmado'),
      supabase
        .from('dias_libres_manicurista')
        .select('id, manicurista_id, estado, motivo_id, observacion_manicurista, observacion_admin, motivos(nombre)')
        .eq('fecha', iso),
      supabase
        .from('franjas_bloqueadas')
        .select('id, manicurista_id, hora_inicio, hora_fin, tipo, estado, observacion_admin')
        .eq('fecha', iso),
    ]).then(([ag, dl, fb]) => {
      setAgendamientos(ag.data ?? [])
      setDiasLibres(dl.data ?? [])
      setFranjas(fb.data ?? [])
      setLoading(false)
    })
  }

  const cargarSolicitudesPendientes = () => {
    supabase
      .from('dias_libres_manicurista')
      .select('id, fecha, manicurista_id, motivo_id, observacion_manicurista, manicuristas(nombre), motivos(nombre)')
      .eq('estado', 'pendiente')
      .order('fecha')
      .then(({ data }) => setSolicitudesPendientes((s) => ({ ...s, dias: data ?? [] })))

    supabase
      .from('franjas_bloqueadas')
      .select('id, fecha, manicurista_id, hora_inicio, hora_fin, manicuristas(nombre)')
      .eq('estado', 'pendiente')
      .order('fecha')
      .then(({ data }) => setSolicitudesPendientes((s) => ({ ...s, franjas: data ?? [] })))
  }

  useEffect(cargarCatalogos, [])
  useEffect(() => {
    supabase.from('motivos').select('id, nombre').eq('activo', true).then(({ data }) => setMotivos(data ?? []))
  }, [])
  useEffect(cargarDia, [iso])
  useEffect(cargarSolicitudesPendientes, [])

  const cambiarDia = (delta) => {
    const nueva = new Date(fecha)
    nueva.setDate(nueva.getDate() + delta)
    setFecha(nueva)
  }

  // Mapa: para cada manicurista, qué minutos están ocupados, por qué bloque, y cuántas
  // franjas de 30 min dura ese bloque (para poder "estirar" la burbuja visualmente)
  const ocupacion = useMemo(() => {
    const mapa = {}
    manicuristas.forEach((m) => { mapa[m.id] = {} })

    agendamientos.forEach((a) => {
      const inicio = textoAMinutos(a.hora_inicio.slice(0, 5))
      const fin = textoAMinutos(a.hora_fin.slice(0, 5))
      const numSlots = Math.max(1, Math.round((fin - inicio) / PASO_MINUTOS))
      for (let t = inicio; t < fin; t += PASO_MINUTOS) {
        if (!mapa[a.manicurista_id]) mapa[a.manicurista_id] = {}
        mapa[a.manicurista_id][t] = { tipo: 'servicio', esInicio: t === inicio, numSlots, data: a }
      }
    })

    franjas.filter((f) => f.estado === 'aprobado').forEach((f) => {
      const inicio = textoAMinutos(f.hora_inicio.slice(0, 5))
      const fin = textoAMinutos(f.hora_fin.slice(0, 5))
      const numSlots = Math.max(1, Math.round((fin - inicio) / PASO_MINUTOS))
      for (let t = inicio; t < fin; t += PASO_MINUTOS) {
        if (!mapa[f.manicurista_id]) mapa[f.manicurista_id] = {}
        mapa[f.manicurista_id][t] = { tipo: 'franja', esInicio: t === inicio, numSlots, data: f }
      }
    })

    diasLibres.filter((d) => d.estado === 'aprobado').forEach((d) => {
      slots.forEach((t) => {
        if (!mapa[d.manicurista_id]) mapa[d.manicurista_id] = {}
        mapa[d.manicurista_id][t] = { tipo: 'dia_libre', esInicio: t === slots[0], numSlots: slots.length, data: d }
      })
    })

    return mapa
  }, [agendamientos, franjas, diasLibres, manicuristas])

  const abrirSlot = (manicuristaId, minutos) => {
    setStatus('')
    setFormAgenda({ cliente_id: '', tipo_servicio_id: '' })
    setSlotSeleccionado({ manicuristaId, minutos })
  }

  const guardarAgendamiento = async (e) => {
    e.preventDefault()
    if (!formAgenda.cliente_id || !formAgenda.tipo_servicio_id) {
      setStatus('Elige cliente y servicio.')
      return
    }
    const tipo = tiposServicio.find((t) => t.id === formAgenda.tipo_servicio_id)
    const horaInicio = minutosATexto(slotSeleccionado.minutos)
    const horaFin = sumarMinutos(horaInicio, tipo?.duracion_minutos ?? 30)

    const { data: { user } } = await supabase.auth.getUser()

    const { error } = await supabase.from('agendamientos_servicios').insert({
      manicurista_id: slotSeleccionado.manicuristaId,
      cliente_id: formAgenda.cliente_id,
      tipo_servicio_id: formAgenda.tipo_servicio_id,
      fecha: iso,
      hora_inicio: horaInicio,
      hora_fin: horaFin,
      created_by: user?.id ?? null,
    })

    if (error) {
      if (error.code === '23505') {
        setStatus('Alguien más acaba de agendar ese mismo horario justo ahora. Cierra esta ventana y elige otra hora.')
        cargarDia() // refresca el calendario de fondo para que se vea la cita que ganó la carrera
      } else {
        setStatus('Error: ' + error.message)
      }
      return
    }
    setSlotSeleccionado(null)
    cargarDia()
  }

  const resolverDiaLibre = async (id, estado, observacion_admin = null) => {
    const { error } = await supabase.from('dias_libres_manicurista').update({ estado, observacion_admin }).eq('id', id)
    if (error) {
      alert('No se pudo actualizar la solicitud: ' + error.message)
      return
    }
    cargarDia()
    cargarSolicitudesPendientes()
  }

  const resolverFranja = async (id, estado, observacion_admin = null) => {
    const { error } = await supabase.from('franjas_bloqueadas').update({ estado, observacion_admin }).eq('id', id)
    if (error) {
      alert('No se pudo actualizar la solicitud: ' + error.message)
      return
    }
    cargarDia()
    cargarSolicitudesPendientes()
  }

  const desbloquearDiaLibre = async (diaLibreId) => {
    if (!confirm('¿Desbloquear este día? La manicurista volverá a estar disponible.')) return
    const { error } = await supabase.from('dias_libres_manicurista').update({ estado: 'rechazado', observacion_admin: 'Desbloqueado por admin' }).eq('id', diaLibreId)
    if (error) {
      alert('No se pudo desbloquear el día: ' + error.message)
      return
    }
    cargarDia()
  }

  const rechazarConObservacion = async (tipoSolicitud, id) => {
    const obs = prompt('Motivo del rechazo (se le mostrará a la manicurista):')
    if (obs === null) return
    if (tipoSolicitud === 'dia') await resolverDiaLibre(id, 'rechazado', obs)
    else await resolverFranja(id, 'rechazado', obs)
  }

  const asignarDiaLibreFinde = async (manicuristaId) => {
    if (!esFinDeSemana(fecha)) return
    const motivo = motivos.find((m) => m.nombre.toLowerCase().includes('libre')) ?? motivos[0]
    if (!motivo) {
      alert('No encontré ningún motivo activo en el catálogo de "Motivos" en Supabase, así que no puedo bloquear el día. Avísame para revisarlo.')
      return
    }
    const { error } = await supabase.from('dias_libres_manicurista').upsert({
      manicurista_id: manicuristaId,
      fecha: iso,
      motivo_id: motivo.id,
      estado: 'aprobado',
      observacion_admin: 'Asignado directamente por admin (fin de semana)',
    }, { onConflict: 'manicurista_id,fecha' })
    if (error) {
      alert('No se pudo bloquear el día: ' + error.message)
      return
    }
    cargarDia()
  }

  // --- Editar / eliminar una cita ya agendada ---
  const abrirEditarCita = (cita) => {
    setStatusEditar('')
    setCitaEditando(cita)
    setFormEditar({
      fecha: iso,
      hora_inicio: cita.hora_inicio.slice(0, 5),
      tipo_servicio_id: cita.tipo_servicio_id,
    })
  }

  const guardarEdicionCita = async (e) => {
    e.preventDefault()
    setStatusEditar('')
    const tipo = tiposServicio.find((t) => t.id === formEditar.tipo_servicio_id)
    const horaFin = sumarMinutos(formEditar.hora_inicio, tipo?.duracion_minutos ?? 30)

    const { error } = await supabase
      .from('agendamientos_servicios')
      .update({
        fecha: formEditar.fecha,
        hora_inicio: formEditar.hora_inicio,
        hora_fin: horaFin,
        tipo_servicio_id: formEditar.tipo_servicio_id,
      })
      .eq('id', citaEditando.id)

    if (error) {
      setStatusEditar(
        error.code === '23505'
          ? 'Ese horario ya está ocupado por otra cita de esta manicurista. Elige otro.'
          : 'Error: ' + error.message
      )
      return
    }
    setCitaEditando(null)
    cargarDia()
  }

  const eliminarCita = async (cita) => {
    if (!confirm(`¿Eliminar la cita de ${cita.clientes?.nombre} ${cita.clientes?.apellido ?? ''}?`)) return
    await supabase.from('agendamientos_servicios').update({ estado: 'cancelado' }).eq('id', cita.id)
    cargarDia()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <h2 className="font-display text-2xl">Calendario</h2>
        <div className="flex items-center gap-2">
          <button onClick={() => cambiarDia(-1)} className="rounded-full px-3 py-1 text-sm" style={{ border: '1px solid var(--color-border)' }}>←</button>
          <div className="text-sm font-medium text-center min-w-[150px]">
            {nombreDia(fecha)} <span className="font-mono-num" style={{ color: 'var(--color-text-muted)' }}>{iso}</span>
          </div>
          <button onClick={() => cambiarDia(1)} className="rounded-full px-3 py-1 text-sm" style={{ border: '1px solid var(--color-border)' }}>→</button>
          <button onClick={() => setFecha(new Date())} className="rounded-full px-3 py-1 text-xs font-medium" style={{ background: 'var(--color-accent-soft)' }}>Hoy</button>
        </div>
      </div>
      <p className="text-sm mb-4" style={{ color: 'var(--color-text-muted)' }}>
        Horario del local: 8:00 a 20:00 · Horario para clientes: 10:00 a 19:00
      </p>

      {solicitudesPendientes.dias.length + solicitudesPendientes.franjas.length > 0 && (
        <div className="card p-4 mb-6" style={{ borderColor: 'var(--color-accent)' }}>
          <h3 className="text-sm font-semibold mb-3">Solicitudes pendientes de aprobación</h3>
          <div className="space-y-2">
            {solicitudesPendientes.dias.map((d) => (
              <div key={`dia-${d.id}`} className="flex items-center justify-between gap-2 text-sm flex-wrap">
                <span>
                  <strong>{d.manicuristas?.nombre}</strong> pide día libre el <strong>{d.fecha}</strong> — {d.motivos?.nombre}
                  {d.observacion_manicurista && <em style={{ color: 'var(--color-text-muted)' }}> · "{d.observacion_manicurista}"</em>}
                </span>
                <span className="flex gap-2 shrink-0">
                  <button onClick={() => resolverDiaLibre(d.id, 'aprobado')} className="text-xs font-medium rounded-full px-3 py-1" style={{ background: 'var(--color-success-soft)', color: 'var(--color-success)' }}>Aprobar</button>
                  <button onClick={() => rechazarConObservacion('dia', d.id)} className="text-xs font-medium rounded-full px-3 py-1" style={{ background: 'var(--color-danger-soft)', color: 'var(--color-danger)' }}>Rechazar</button>
                </span>
              </div>
            ))}
            {solicitudesPendientes.franjas.map((f) => (
              <div key={`franja-${f.id}`} className="flex items-center justify-between gap-2 text-sm flex-wrap">
                <span>
                  <strong>{f.manicuristas?.nombre}</strong> pide bloquear franja el <strong>{f.fecha}</strong> de {f.hora_inicio.slice(0,5)} a {f.hora_fin.slice(0,5)}
                </span>
                <span className="flex gap-2 shrink-0">
                  <button onClick={() => resolverFranja(f.id, 'aprobado')} className="text-xs font-medium rounded-full px-3 py-1" style={{ background: 'var(--color-success-soft)', color: 'var(--color-success)' }}>Aprobar</button>
                  <button onClick={() => rechazarConObservacion('franja', f.id)} className="text-xs font-medium rounded-full px-3 py-1" style={{ background: 'var(--color-danger-soft)', color: 'var(--color-danger)' }}>Rechazar</button>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Cargando…</p>
      ) : (
        <div className="card overflow-x-auto">
          <div style={{ minWidth: `${100 + manicuristas.length * 170}px` }}>
            {/* Encabezado */}
            <div className="grid" style={{ gridTemplateColumns: `80px repeat(${manicuristas.length}, 1fr)` }}>
              <div className="px-2 py-3 text-xs font-semibold" style={{ borderBottom: '1px solid var(--color-border)' }} />
              {manicuristas.map((m) => (
                <div key={m.id} className="px-2 py-3 flex items-center justify-between gap-1" style={{ borderBottom: '1px solid var(--color-border)', borderLeft: '1px solid var(--color-border)' }}>
                  <div className="flex items-center gap-2 min-w-0">
                    <Avatar url={m.foto_url} nombre={m.nombre} size={28} />
                    <PolishDot color={m.color} label={m.nombre} />
                  </div>
                  {esFinDeSemana(fecha) && (
                    <button
                      onClick={() => asignarDiaLibreFinde(m.id)}
                      title="Bloquear este fin de semana para esta manicurista"
                      className="text-[10px] font-medium rounded-full px-2 py-0.5 shrink-0"
                      style={{ border: '1px solid var(--color-border)' }}
                    >
                      Bloquear día
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Cuerpo: UNA sola grilla para todo el día, así los bloques pueden "estirarse" varias franjas seguidas */}
            <div
              className="grid relative"
              style={{
                gridTemplateColumns: `80px repeat(${manicuristas.length}, 1fr)`,
                gridAutoRows: `${ROW_REM}rem`,
              }}
            >
              {/* Columna de horas */}
              {slots.map((minutos, i) => {
                const horaTexto = minutosATexto(minutos)
                const enHorarioCliente = minutos >= HORA_INICIO_CLIENTE && minutos < HORA_FIN_CLIENTE
                return (
                  <div
                    key={`t-${minutos}`}
                    className="px-2 py-2 text-xs font-mono-num"
                    style={{
                      gridColumn: 1,
                      gridRow: i + 1,
                      borderBottom: '1px solid var(--color-border)',
                      color: enHorarioCliente ? 'var(--color-text)' : 'var(--color-text-muted)',
                      background: enHorarioCliente ? 'transparent' : 'var(--color-bg)',
                    }}
                  >
                    {horaTexto}
                  </div>
                )
              })}

              {/* Una columna por manicurista */}
              {manicuristas.map((m, colIdx) =>
                slots.map((minutos, i) => {
                  const celda = ocupacion[m.id]?.[minutos]
                  const gridColumn = colIdx + 2
                  const estiloBase = {
                    gridColumn,
                    gridRow: i + 1,
                    borderBottom: '1px solid var(--color-border)',
                    borderLeft: '1px solid var(--color-border)',
                  }

                  if (!celda) {
                    const pasado = esHoyVista && minutos <= minutosAhora()
                    if (pasado) {
                      return (
                        <div key={`${m.id}-${minutos}`} className="text-left px-2 py-2 text-xs" style={{ ...estiloBase, background: 'var(--color-bg)' }} title="Esta hora ya pasó">
                          <span style={{ color: 'var(--color-text-muted)' }}>Hora pasada</span>
                        </div>
                      )
                    }
                    return (
                      <button
                        key={`${m.id}-${minutos}`}
                        onClick={() => abrirSlot(m.id, minutos)}
                        className="text-left px-2 py-2 text-xs hover:bg-black/5 transition-colors"
                        style={estiloBase}
                        title="Agendar servicio"
                      >
                        <span style={{ color: 'var(--color-text-muted)' }}>+ Libre</span>
                      </button>
                    )
                  }

                  // Las franjas "de continuación" de un bloque ya no dibujan nada — el
                  // bloque de su inicio ya ocupa ese espacio con gridRow: span N.
                  if (!celda.esInicio) return null

                  if (celda.tipo === 'servicio') {
                    const cita = celda.data
                    const tieneWhatsapp = cita.clientes?.telefono && cita.clientes?.tiene_whatsapp
                    return (
                      <div
                        key={`${m.id}-${minutos}`}
                        className="text-left px-2 py-1.5 text-xs overflow-hidden flex flex-col"
                        style={{
                          gridColumn,
                          gridRow: `${i + 1} / span ${celda.numSlots}`,
                          background: 'var(--color-accent-soft)',
                          border: '1.5px solid #7A2E3A',
                          borderRadius: '0.5rem',
                          margin: '2px',
                        }}
                      >
                        <p className="font-semibold truncate">{cita.clientes?.nombre} {cita.clientes?.apellido}</p>
                        <p className="truncate" style={{ color: 'var(--color-text-muted)' }}>{cita.tipos_servicio?.nombre}</p>
                        <div className="flex flex-wrap gap-1 mt-auto pt-1">
                          {tieneWhatsapp && (
                            <a
                              href={linkWhatsapp(cita.clientes.telefono)}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-[10px] font-medium rounded-full px-1.5 py-0.5"
                              style={{ background: 'var(--color-success-soft)', color: 'var(--color-success)' }}
                              title="Escribir por WhatsApp"
                            >
                              WhatsApp
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => abrirEditarCita(cita)}
                            className="text-[10px] font-medium rounded-full px-1.5 py-0.5"
                            style={{ background: '#C9A24B', color: '#fff' }}
                            title="Editar esta cita"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => eliminarCita(cita)}
                            className="text-[10px] font-medium rounded-full px-1.5 py-0.5"
                            style={{ background: 'var(--color-danger)', color: '#fff' }}
                            title="Eliminar esta cita"
                          >
                            Eliminar
                          </button>
                        </div>
                      </div>
                    )
                  }

                  if (celda.tipo === 'franja') {
                    return (
                      <div
                        key={`${m.id}-${minutos}`}
                        className="px-2 py-2 text-xs"
                        style={{ ...estiloBase, gridRow: `${i + 1} / span ${celda.numSlots}`, background: 'var(--color-bg)' }}
                      >
                        <span style={{ color: 'var(--color-text-muted)' }}>
                          {celda.data.tipo === 'almuerzo' ? '🍽️ Almuerzo' : '⛔ Bloqueado'}
                        </span>
                      </div>
                    )
                  }

                  if (celda.tipo === 'dia_libre') {
                    return (
                      <button
                        key={`${m.id}-${minutos}`}
                        onClick={() => desbloquearDiaLibre(celda.data.id)}
                        className="text-left px-2 py-2 text-xs"
                        style={{ ...estiloBase, gridRow: `${i + 1} / span ${celda.numSlots}`, background: 'var(--color-danger-soft)' }}
                        title="Clic para desbloquear el día"
                      >
                        <span style={{ color: 'var(--color-danger)' }}>Día libre — {celda.data.motivos?.nombre}</span>
                      </button>
                    )
                  }

                  return <div key={`${m.id}-${minutos}`} style={estiloBase} />
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal simple para agendar servicio */}
      {slotSeleccionado && (
        <div className="fixed inset-0 z-20 flex items-center justify-center p-4" style={{ background: 'rgba(45,34,48,0.4)' }}>
          <form onSubmit={guardarAgendamiento} className="card p-5 w-full max-w-sm space-y-3" style={{ background: 'var(--color-surface)' }}>
            <h3 className="font-display text-lg">
              Agendar {minutosATexto(slotSeleccionado.minutos)} — {manicuristas.find((m) => m.id === slotSeleccionado.manicuristaId)?.nombre}
            </h3>
            <div>
              <label className="block text-xs font-medium mb-1">Cliente</label>
              <select
                value={formAgenda.cliente_id}
                onChange={(e) => setFormAgenda({ ...formAgenda, cliente_id: e.target.value })}
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
              <label className="block text-xs font-medium mb-1">Servicio</label>
              <select
                value={formAgenda.tipo_servicio_id}
                onChange={(e) => setFormAgenda({ ...formAgenda, tipo_servicio_id: e.target.value })}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: 'var(--color-border)' }}
              >
                <option value="">Selecciona…</option>
                {tiposServicio.map((t) => (
                  <option key={t.id} value={t.id}>{t.nombre} ({t.duracion_minutos} min)</option>
                ))}
              </select>
            </div>
            {status && <p className="text-sm" style={{ color: 'var(--color-danger)' }}>{status}</p>}
            <div className="flex gap-2 pt-1">
              <button type="submit" className="rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ background: 'var(--color-primary)' }}>Agendar</button>
              <button type="button" onClick={() => setSlotSeleccionado(null)} className="rounded-lg px-4 py-2 text-sm font-medium" style={{ border: '1px solid var(--color-border)' }}>Cancelar</button>
            </div>
          </form>
        </div>
      )}

      {/* Modal para editar una cita ya agendada */}
      {citaEditando && (
        <div className="fixed inset-0 z-20 flex items-center justify-center p-4" style={{ background: 'rgba(45,34,48,0.4)' }}>
          <form onSubmit={guardarEdicionCita} className="card p-5 w-full max-w-sm space-y-3" style={{ background: 'var(--color-surface)' }}>
            <h3 className="font-display text-lg">
              Editar cita — {citaEditando.clientes?.nombre} {citaEditando.clientes?.apellido}
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">Fecha</label>
                <input
                  type="date"
                  value={formEditar.fecha}
                  onChange={(e) => setFormEditar({ ...formEditar, fecha: e.target.value })}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  style={{ borderColor: 'var(--color-border)' }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Hora</label>
                <input
                  type="time"
                  value={formEditar.hora_inicio}
                  onChange={(e) => setFormEditar({ ...formEditar, hora_inicio: e.target.value })}
                  className="w-full rounded-lg border px-3 py-2 text-sm font-mono-num"
                  style={{ borderColor: 'var(--color-border)' }}
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Servicio</label>
              <select
                value={formEditar.tipo_servicio_id}
                onChange={(e) => setFormEditar({ ...formEditar, tipo_servicio_id: e.target.value })}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: 'var(--color-border)' }}
              >
                {tiposServicio.map((t) => (
                  <option key={t.id} value={t.id}>{t.nombre} ({t.duracion_minutos} min)</option>
                ))}
              </select>
            </div>
            {statusEditar && <p className="text-sm" style={{ color: 'var(--color-danger)' }}>{statusEditar}</p>}
            <div className="flex gap-2 pt-1">
              <button type="submit" className="rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ background: 'var(--color-primary)' }}>Guardar cambios</button>
              <button type="button" onClick={() => setCitaEditando(null)} className="rounded-lg px-4 py-2 text-sm font-medium" style={{ border: '1px solid var(--color-border)' }}>Cancelar</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
