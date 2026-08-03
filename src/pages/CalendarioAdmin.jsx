import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import PolishDot from '../components/PolishDot'
import {
  generarSlots, minutosATexto, textoAMinutos, sumarMinutos,
  fechaISO, esFinDeSemana, nombreDia, PASO_MINUTOS,
  HORA_INICIO_CLIENTE, HORA_FIN_CLIENTE,
} from '../utils/calendario'

const slots = generarSlots()

export default function CalendarioAdmin() {
  const [fecha, setFecha] = useState(new Date())
  const [manicuristas, setManicuristas] = useState([])
  const [clientes, setClientes] = useState([])
  const [tiposServicio, setTiposServicio] = useState([])
  const [agendamientos, setAgendamientos] = useState([])
  const [diasLibres, setDiasLibres] = useState([])
  const [franjas, setFranjas] = useState([])
  const [solicitudesPendientes, setSolicitudesPendientes] = useState({ dias: [], franjas: [] })
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')

  // Formulario para agendar un servicio en un slot vacío
  const [slotSeleccionado, setSlotSeleccionado] = useState(null) // { manicuristaId, minutos }
  const [formAgenda, setFormAgenda] = useState({ cliente_id: '', tipo_servicio_id: '' })

  // Formulario para asignar día libre directo (sábado/domingo) o bloquear un día ya agendado
  const [mostrarDiaLibreFinde, setMostrarDiaLibreFinde] = useState(false)

  const iso = fechaISO(fecha)

  const cargarCatalogos = () => {
    supabase.from('manicuristas').select('id, nombre, color').eq('activo', true).order('nombre')
      .then(({ data }) => setManicuristas(data ?? []))
    supabase.from('clientes').select('id, nombre, apellido').eq('activo', true).order('nombre')
      .then(({ data }) => setClientes(data ?? []))
    supabase.from('tipos_servicio').select('id, nombre, duracion_minutos').eq('activo', true).order('nombre')
      .then(({ data }) => setTiposServicio(data ?? []))
  }

  const cargarDia = () => {
    setLoading(true)
    Promise.all([
      supabase
        .from('agendamientos_servicios')
        .select('id, manicurista_id, cliente_id, tipo_servicio_id, hora_inicio, hora_fin, estado, clientes(nombre, apellido), tipos_servicio(nombre)')
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
  useEffect(cargarDia, [iso])
  useEffect(cargarSolicitudesPendientes, [])

  const cambiarDia = (delta) => {
    const nueva = new Date(fecha)
    nueva.setDate(nueva.getDate() + delta)
    setFecha(nueva)
  }

  // Mapa: para cada manicurista, qué minutos están ocupados y por qué bloque
  const ocupacion = useMemo(() => {
    const mapa = {}
    manicuristas.forEach((m) => { mapa[m.id] = {} })

    agendamientos.forEach((a) => {
      const inicio = textoAMinutos(a.hora_inicio.slice(0, 5))
      const fin = textoAMinutos(a.hora_fin.slice(0, 5))
      for (let t = inicio; t < fin; t += PASO_MINUTOS) {
        if (!mapa[a.manicurista_id]) mapa[a.manicurista_id] = {}
        mapa[a.manicurista_id][t] = { tipo: 'servicio', esInicio: t === inicio, data: a }
      }
    })

    franjas.filter((f) => f.estado === 'aprobado').forEach((f) => {
      const inicio = textoAMinutos(f.hora_inicio.slice(0, 5))
      const fin = textoAMinutos(f.hora_fin.slice(0, 5))
      for (let t = inicio; t < fin; t += PASO_MINUTOS) {
        if (!mapa[f.manicurista_id]) mapa[f.manicurista_id] = {}
        mapa[f.manicurista_id][t] = { tipo: 'franja', esInicio: t === inicio, data: f }
      }
    })

    diasLibres.filter((d) => d.estado === 'aprobado').forEach((d) => {
      slots.forEach((t) => {
        if (!mapa[d.manicurista_id]) mapa[d.manicurista_id] = {}
        mapa[d.manicurista_id][t] = { tipo: 'dia_libre', esInicio: t === slots[0], data: d }
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
      setStatus('Error: ' + error.message)
      return
    }
    setSlotSeleccionado(null)
    cargarDia()
  }

  const cancelarAgendamiento = async (agendamientoId) => {
    if (!confirm('¿Cancelar este servicio agendado?')) return
    await supabase.from('agendamientos_servicios').update({ estado: 'cancelado' }).eq('id', agendamientoId)
    cargarDia()
  }

  const resolverDiaLibre = async (id, estado, observacion_admin = null) => {
    await supabase.from('dias_libres_manicurista').update({ estado, observacion_admin }).eq('id', id)
    cargarDia()
    cargarSolicitudesPendientes()
  }

  const resolverFranja = async (id, estado, observacion_admin = null) => {
    await supabase.from('franjas_bloqueadas').update({ estado, observacion_admin }).eq('id', id)
    cargarDia()
    cargarSolicitudesPendientes()
  }

  const desbloquearDiaLibre = async (diaLibreId) => {
    if (!confirm('¿Desbloquear este día? La manicurista volverá a estar disponible.')) return
    await supabase.from('dias_libres_manicurista').update({ estado: 'rechazado', observacion_admin: 'Desbloqueado por admin' }).eq('id', diaLibreId)
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
    const { data: motivos } = await supabase.from('motivos').select('id').eq('nombre', 'Día libre').single()
    await supabase.from('dias_libres_manicurista').insert({
      manicurista_id: manicuristaId,
      fecha: iso,
      motivo_id: motivos?.id,
      estado: 'aprobado',
      observacion_admin: 'Asignado directamente por admin (fin de semana)',
    })
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
                  <PolishDot color={m.color} label={m.nombre} />
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

            {/* Filas de horario */}
            {slots.map((minutos) => {
              const horaTexto = minutosATexto(minutos)
              const enHorarioCliente = minutos >= HORA_INICIO_CLIENTE && minutos < HORA_FIN_CLIENTE
              return (
                <div key={minutos} className="grid" style={{ gridTemplateColumns: `80px repeat(${manicuristas.length}, 1fr)` }}>
                  <div
                    className="px-2 py-2 text-xs font-mono-num"
                    style={{
                      borderBottom: '1px solid var(--color-border)',
                      color: enHorarioCliente ? 'var(--color-text)' : 'var(--color-text-muted)',
                      background: enHorarioCliente ? 'transparent' : 'var(--color-bg)',
                    }}
                  >
                    {horaTexto}
                  </div>
                  {manicuristas.map((m) => {
                    const celda = ocupacion[m.id]?.[minutos]
                    const estiloBase = { borderBottom: '1px solid var(--color-border)', borderLeft: '1px solid var(--color-border)', minHeight: '2.25rem' }

                    if (!celda) {
                      return (
                        <button
                          key={m.id}
                          onClick={() => abrirSlot(m.id, minutos)}
                          className="text-left px-2 py-2 text-xs hover:bg-black/5 transition-colors"
                          style={estiloBase}
                          title="Agendar servicio"
                        >
                          <span style={{ color: 'var(--color-text-muted)' }}>+ Libre</span>
                        </button>
                      )
                    }

                    if (celda.tipo === 'servicio') {
                      if (!celda.esInicio) return <div key={m.id} style={estiloBase} />
                      return (
                        <button
                          key={m.id}
                          onClick={() => cancelarAgendamiento(celda.data.id)}
                          className="text-left px-2 py-2 text-xs"
                          style={{ ...estiloBase, background: 'var(--color-accent-soft)' }}
                          title="Clic para cancelar este servicio"
                        >
                          <p className="font-semibold truncate">{celda.data.clientes?.nombre} {celda.data.clientes?.apellido}</p>
                          <p className="truncate" style={{ color: 'var(--color-text-muted)' }}>{celda.data.tipos_servicio?.nombre}</p>
                        </button>
                      )
                    }

                    if (celda.tipo === 'franja') {
                      if (!celda.esInicio) return <div key={m.id} style={estiloBase} />
                      return (
                        <div key={m.id} className="px-2 py-2 text-xs" style={{ ...estiloBase, background: 'var(--color-bg)' }}>
                          <span style={{ color: 'var(--color-text-muted)' }}>
                            {celda.data.tipo === 'almuerzo' ? '🍽️ Almuerzo' : '⛔ Bloqueado'}
                          </span>
                        </div>
                      )
                    }

                    if (celda.tipo === 'dia_libre') {
                      if (minutos !== slots[0]) return <div key={m.id} style={estiloBase} />
                      return (
                        <button
                          key={m.id}
                          onClick={() => desbloquearDiaLibre(celda.data.id)}
                          className="text-left px-2 py-2 text-xs"
                          style={{ ...estiloBase, background: 'var(--color-danger-soft)', gridRow: `span ${slots.length}` }}
                          title="Clic para desbloquear el día"
                        >
                          <span style={{ color: 'var(--color-danger)' }}>Día libre — {celda.data.motivos?.nombre}</span>
                        </button>
                      )
                    }

                    return <div key={m.id} style={estiloBase} />
                  })}
                </div>
              )
            })}
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
    </div>
  )
}
