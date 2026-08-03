import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/AuthContext'
import {
  generarSlots, minutosATexto, textoAMinutos, fechaISO, esFinDeSemana,
  nombreDia, PASO_MINUTOS, HORA_INICIO_CLIENTE, HORA_FIN_CLIENTE, esHoy, minutosAhora,
} from '../utils/calendario'

const slots = generarSlots()

export default function MiCalendario() {
  const { profile } = useAuth()
  const manicuristaId = profile?.manicurista_id

  const [fecha, setFecha] = useState(new Date())
  const [agendamientos, setAgendamientos] = useState([])
  const [diaLibre, setDiaLibre] = useState(null)
  const [franjasDia, setFranjasDia] = useState([])
  const [motivos, setMotivos] = useState([])
  const [misSolicitudes, setMisSolicitudes] = useState({ dias: [], franjas: [] })
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')

  const [mostrarFormDiaLibre, setMostrarFormDiaLibre] = useState(false)
  const [formDiaLibre, setFormDiaLibre] = useState({ fecha: '', motivo_id: '', observacion: '' })

  const [mostrarFormFranja, setMostrarFormFranja] = useState(false)
  const [formFranja, setFormFranja] = useState({ hora_inicio: '13:00', hora_fin: '14:00' })

  const iso = fechaISO(fecha)
  const esHoyVista = esHoy(fecha)

  const cargarDia = () => {
    if (!manicuristaId) return
    setLoading(true)
    Promise.all([
      supabase
        .from('agendamientos_servicios')
        .select('id, hora_inicio, hora_fin, clientes(nombre, apellido), tipos_servicio(nombre)')
        .eq('manicurista_id', manicuristaId)
        .eq('fecha', iso)
        .eq('estado', 'confirmado'),
      supabase
        .from('dias_libres_manicurista')
        .select('id, estado, motivos(nombre), observacion_admin')
        .eq('manicurista_id', manicuristaId)
        .eq('fecha', iso)
        .eq('estado', 'aprobado')
        .maybeSingle(),
      supabase
        .from('franjas_bloqueadas')
        .select('id, hora_inicio, hora_fin, tipo, estado')
        .eq('manicurista_id', manicuristaId)
        .eq('fecha', iso)
        .eq('estado', 'aprobado'),
    ]).then(([ag, dl, fb]) => {
      setAgendamientos(ag.data ?? [])
      setDiaLibre(dl.data ?? null)
      setFranjasDia(fb.data ?? [])
      setLoading(false)
    })
  }

  const cargarMisSolicitudes = () => {
    if (!manicuristaId) return
    supabase
      .from('dias_libres_manicurista')
      .select('id, fecha, estado, observacion_admin, motivos(nombre)')
      .eq('manicurista_id', manicuristaId)
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => setMisSolicitudes((s) => ({ ...s, dias: data ?? [] })))

    supabase
      .from('franjas_bloqueadas')
      .select('id, fecha, hora_inicio, hora_fin, tipo, estado, observacion_admin')
      .eq('manicurista_id', manicuristaId)
      .eq('tipo', 'otro')
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => setMisSolicitudes((s) => ({ ...s, franjas: data ?? [] })))
  }

  useEffect(() => {
    supabase.from('motivos').select('id, nombre').eq('activo', true).then(({ data }) => setMotivos(data ?? []))
  }, [])
  useEffect(cargarDia, [iso, manicuristaId])
  useEffect(cargarMisSolicitudes, [manicuristaId])

  const cambiarDia = (delta) => {
    const nueva = new Date(fecha)
    nueva.setDate(nueva.getDate() + delta)
    setFecha(nueva)
  }

  const ocupacion = useMemo(() => {
    const mapa = {}
    agendamientos.forEach((a) => {
      const inicio = textoAMinutos(a.hora_inicio.slice(0, 5))
      const fin = textoAMinutos(a.hora_fin.slice(0, 5))
      for (let t = inicio; t < fin; t += PASO_MINUTOS) mapa[t] = { tipo: 'servicio', esInicio: t === inicio, data: a }
    })
    franjasDia.forEach((f) => {
      const inicio = textoAMinutos(f.hora_inicio.slice(0, 5))
      const fin = textoAMinutos(f.hora_fin.slice(0, 5))
      for (let t = inicio; t < fin; t += PASO_MINUTOS) mapa[t] = { tipo: 'franja', esInicio: t === inicio, data: f }
    })
    return mapa
  }, [agendamientos, franjasDia])

  const yaTieneAlmuerzo = franjasDia.some((f) => f.tipo === 'almuerzo')

  const solicitarDiaLibre = async (e) => {
    e.preventDefault()
    setStatus('')
    if (!formDiaLibre.fecha || !formDiaLibre.motivo_id) {
      setStatus('Elige la fecha y el motivo.')
      return
    }
    const fechaElegida = new Date(formDiaLibre.fecha + 'T12:00:00')
    if (esFinDeSemana(fechaElegida)) {
      setStatus('Los sábados y domingos los asigna directamente la administradora.')
      return
    }
    const { error } = await supabase.from('dias_libres_manicurista').insert({
      manicurista_id: manicuristaId,
      fecha: formDiaLibre.fecha,
      motivo_id: formDiaLibre.motivo_id,
      observacion_manicurista: formDiaLibre.observacion || null,
    })
    if (error) {
      setStatus('Error: ' + error.message)
      return
    }
    setMostrarFormDiaLibre(false)
    setFormDiaLibre({ fecha: '', motivo_id: '', observacion: '' })
    cargarMisSolicitudes()
    cargarDia()
  }

  const bloquearAlmuerzo = async (horaInicio, horaFin) => {
    const { error } = await supabase.from('franjas_bloqueadas').insert({
      manicurista_id: manicuristaId,
      fecha: iso,
      hora_inicio: horaInicio,
      hora_fin: horaFin,
      tipo: 'almuerzo',
      estado: 'aprobado',
    })
    if (error) setStatus('Error: ' + error.message)
    cargarDia()
  }

  const solicitarFranja = async (e) => {
    e.preventDefault()
    setStatus('')
    const { error } = await supabase.from('franjas_bloqueadas').insert({
      manicurista_id: manicuristaId,
      fecha: iso,
      hora_inicio: formFranja.hora_inicio,
      hora_fin: formFranja.hora_fin,
      tipo: 'otro',
      estado: 'pendiente',
    })
    if (error) {
      setStatus('Error: ' + error.message)
      return
    }
    setMostrarFormFranja(false)
    cargarMisSolicitudes()
    cargarDia()
  }

  if (!manicuristaId) {
    return <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Tu usuario no tiene una manicurista asociada. Contacta a la administradora.</p>
  }

  return (
    <div className="max-w-xl">
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <h2 className="font-display text-2xl">Mi calendario</h2>
        <div className="flex items-center gap-2">
          <button onClick={() => cambiarDia(-1)} className="rounded-full px-3 py-1 text-sm" style={{ border: '1px solid var(--color-border)' }}>←</button>
          <div className="text-sm font-medium text-center min-w-[130px]">
            {nombreDia(fecha)} <span className="font-mono-num" style={{ color: 'var(--color-text-muted)' }}>{iso}</span>
          </div>
          <button onClick={() => cambiarDia(1)} className="rounded-full px-3 py-1 text-sm" style={{ border: '1px solid var(--color-border)' }}>→</button>
          <button onClick={() => setFecha(new Date())} className="rounded-full px-3 py-1 text-xs font-medium" style={{ background: 'var(--color-accent-soft)' }}>Hoy</button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 my-4">
        <button
          onClick={() => setMostrarFormDiaLibre(true)}
          className="text-xs font-medium rounded-full px-3 py-1.5"
          style={{ border: '1px solid var(--color-border)' }}
        >
          Solicitar día libre
        </button>
        {!yaTieneAlmuerzo && (
          <button
            onClick={() => bloquearAlmuerzo('13:00', '14:00')}
            className="text-xs font-medium rounded-full px-3 py-1.5"
            style={{ border: '1px solid var(--color-border)' }}
          >
            🍽️ Bloquear almuerzo (13:00–14:00)
          </button>
        )}
        <button
          onClick={() => setMostrarFormFranja(true)}
          className="text-xs font-medium rounded-full px-3 py-1.5"
          style={{ border: '1px solid var(--color-border)' }}
        >
          Solicitar otra franja
        </button>
      </div>

      {status && <p className="text-sm mb-3" style={{ color: 'var(--color-danger)' }}>{status}</p>}

      {loading ? (
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Cargando…</p>
      ) : diaLibre ? (
        <div className="card p-4 mb-6" style={{ background: 'var(--color-danger-soft)' }}>
          <p className="text-sm font-semibold" style={{ color: 'var(--color-danger)' }}>Día libre aprobado — {diaLibre.motivos?.nombre}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>No tienes servicios agendados este día.</p>
        </div>
      ) : (
        <div className="card divide-y" style={{ borderColor: 'var(--color-border)' }}>
          {slots.map((minutos) => {
            const celda = ocupacion[minutos]
            const horaTexto = minutosATexto(minutos)
            const enHorarioCliente = minutos >= HORA_INICIO_CLIENTE && minutos < HORA_FIN_CLIENTE

            if (celda && !celda.esInicio) return null

            return (
              <div key={minutos} className="flex items-stretch gap-3 px-4 py-2">
                <div
                  className="text-xs font-mono-num w-12 shrink-0 flex items-center"
                  style={{ color: enHorarioCliente ? 'var(--color-text)' : 'var(--color-text-muted)' }}
                >
                  {horaTexto}
                </div>
                <div className="flex-1 py-1">
                  {celda?.tipo === 'servicio' ? (
                    <div className="rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--color-accent-soft)' }}>
                      <p className="font-semibold">{celda.data.clientes?.nombre} {celda.data.clientes?.apellido}</p>
                      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{celda.data.tipos_servicio?.nombre}</p>
                    </div>
                  ) : celda?.tipo === 'franja' ? (
                    <div className="rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--color-bg)', color: 'var(--color-text-muted)' }}>
                      {celda.data.tipo === 'almuerzo' ? '🍽️ Almuerzo' : '⛔ Bloqueado'}
                    </div>
                  ) : esHoyVista && minutos <= minutosAhora() ? (
                    <p className="text-xs px-3 py-2" style={{ color: 'var(--color-text-muted)' }}>Hora pasada</p>
                  ) : (
                    <p className="text-xs px-3 py-2" style={{ color: 'var(--color-text-muted)' }}>Disponible</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Historial de solicitudes / notificaciones */}
      {(misSolicitudes.dias.length > 0 || misSolicitudes.franjas.length > 0) && (
        <div className="mt-8">
          <h3 className="text-sm font-semibold mb-2">Mis solicitudes</h3>
          <div className="card divide-y" style={{ borderColor: 'var(--color-border)' }}>
            {misSolicitudes.dias.map((d) => (
              <div key={`d-${d.id}`} className="px-4 py-3 text-sm">
                <p>Día libre <strong>{d.fecha}</strong> — {d.motivos?.nombre}
                  <span className="ml-2 text-xs font-medium rounded-full px-2 py-0.5" style={{
                    background: d.estado === 'aprobado' ? 'var(--color-success-soft)' : d.estado === 'rechazado' ? 'var(--color-danger-soft)' : 'var(--color-accent-soft)',
                    color: d.estado === 'aprobado' ? 'var(--color-success)' : d.estado === 'rechazado' ? 'var(--color-danger)' : 'var(--color-text)',
                  }}>{d.estado}</span>
                </p>
                {d.observacion_admin && <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>Nota de admin: {d.observacion_admin}</p>}
              </div>
            ))}
            {misSolicitudes.franjas.map((f) => (
              <div key={`f-${f.id}`} className="px-4 py-3 text-sm">
                <p>Franja <strong>{f.fecha}</strong> {f.hora_inicio.slice(0,5)}–{f.hora_fin.slice(0,5)}
                  <span className="ml-2 text-xs font-medium rounded-full px-2 py-0.5" style={{
                    background: f.estado === 'aprobado' ? 'var(--color-success-soft)' : f.estado === 'rechazado' ? 'var(--color-danger-soft)' : 'var(--color-accent-soft)',
                    color: f.estado === 'aprobado' ? 'var(--color-success)' : f.estado === 'rechazado' ? 'var(--color-danger)' : 'var(--color-text)',
                  }}>{f.estado}</span>
                </p>
                {f.observacion_admin && <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>Nota de admin: {f.observacion_admin}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal: solicitar día libre */}
      {mostrarFormDiaLibre && (
        <div className="fixed inset-0 z-20 flex items-center justify-center p-4" style={{ background: 'rgba(45,34,48,0.4)' }}>
          <form onSubmit={solicitarDiaLibre} className="card p-5 w-full max-w-sm space-y-3" style={{ background: 'var(--color-surface)' }}>
            <h3 className="font-display text-lg">Solicitar día libre</h3>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Solo de lunes a viernes. Sábados y domingos los asigna la administradora.</p>
            <div>
              <label className="block text-xs font-medium mb-1">Fecha</label>
              <input
                type="date"
                value={formDiaLibre.fecha}
                onChange={(e) => setFormDiaLibre({ ...formDiaLibre, fecha: e.target.value })}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: 'var(--color-border)' }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Motivo</label>
              <select
                value={formDiaLibre.motivo_id}
                onChange={(e) => setFormDiaLibre({ ...formDiaLibre, motivo_id: e.target.value })}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: 'var(--color-border)' }}
              >
                <option value="">Selecciona…</option>
                {motivos.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Observación (opcional)</label>
              <textarea
                value={formDiaLibre.observacion}
                onChange={(e) => setFormDiaLibre({ ...formDiaLibre, observacion: e.target.value })}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: 'var(--color-border)' }}
                rows={2}
              />
            </div>
            {status && <p className="text-sm" style={{ color: 'var(--color-danger)' }}>{status}</p>}
            <div className="flex gap-2 pt-1">
              <button type="submit" className="rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ background: 'var(--color-primary)' }}>Enviar solicitud</button>
              <button type="button" onClick={() => setMostrarFormDiaLibre(false)} className="rounded-lg px-4 py-2 text-sm font-medium" style={{ border: '1px solid var(--color-border)' }}>Cancelar</button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: solicitar franja adicional */}
      {mostrarFormFranja && (
        <div className="fixed inset-0 z-20 flex items-center justify-center p-4" style={{ background: 'rgba(45,34,48,0.4)' }}>
          <form onSubmit={solicitarFranja} className="card p-5 w-full max-w-sm space-y-3" style={{ background: 'var(--color-surface)' }}>
            <h3 className="font-display text-lg">Solicitar franja bloqueada</h3>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Esta solicitud necesita aprobación de la administradora.</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">Desde</label>
                <input
                  type="time"
                  value={formFranja.hora_inicio}
                  onChange={(e) => setFormFranja({ ...formFranja, hora_inicio: e.target.value })}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  style={{ borderColor: 'var(--color-border)' }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Hasta</label>
                <input
                  type="time"
                  value={formFranja.hora_fin}
                  onChange={(e) => setFormFranja({ ...formFranja, hora_fin: e.target.value })}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  style={{ borderColor: 'var(--color-border)' }}
                />
              </div>
            </div>
            {status && <p className="text-sm" style={{ color: 'var(--color-danger)' }}>{status}</p>}
            <div className="flex gap-2 pt-1">
              <button type="submit" className="rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ background: 'var(--color-primary)' }}>Enviar solicitud</button>
              <button type="button" onClick={() => setMostrarFormFranja(false)} className="rounded-lg px-4 py-2 text-sm font-medium" style={{ border: '1px solid var(--color-border)' }}>Cancelar</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
