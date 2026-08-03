import { useEffect, useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { supabase } from '../lib/supabaseClient'
import { currency, startOfWeekISO, todayISO } from '../utils/format'
import PolishDot from '../components/PolishDot'

function daysAgoISO(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

export default function PanelAdmin() {
  const [registros, setRegistros] = useState([])
  const [manicuristas, setManicuristas] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const desde = daysAgoISO(180) // suficiente para vistas semanal/mensual
    Promise.all([
      supabase
        .from('registros_servicios')
        .select('fecha, costo, pagado_manicurista, manicurista_id, manicuristas(nombre, color)')
        .gte('fecha', desde),
      supabase.from('manicuristas').select('id, nombre, color, activo').order('nombre'),
    ]).then(([r, m]) => {
      setRegistros(r.data ?? [])
      setManicuristas(m.data ?? [])
      setLoading(false)
    })
  }, [])

  const hoy = todayISO()

  const resumen = useMemo(() => {
    const inicioSemana = startOfWeekISO(hoy)
    const inicioMes = hoy.slice(0, 7) + '-01'

    const deHoy = registros.filter((r) => r.fecha === hoy)
    const deSemana = registros.filter((r) => r.fecha >= inicioSemana)
    const deMes = registros.filter((r) => r.fecha >= inicioMes)

    const sum = (arr, key) => arr.reduce((s, r) => s + Number(r[key]), 0)

    return {
      hoy: { ingresos: sum(deHoy, 'costo'), pagado: sum(deHoy, 'pagado_manicurista'), n: deHoy.length },
      semana: { ingresos: sum(deSemana, 'costo'), pagado: sum(deSemana, 'pagado_manicurista'), n: deSemana.length },
      mes: { ingresos: sum(deMes, 'costo'), pagado: sum(deMes, 'pagado_manicurista'), n: deMes.length },
    }
  }, [registros, hoy])

  // Últimas 8 semanas: ingresos netos del spa
  const porSemana = useMemo(() => {
    const map = new Map()
    registros.forEach((r) => {
      const semana = startOfWeekISO(r.fecha)
      const cur = map.get(semana) ?? { semana, ingresos: 0, pagado: 0 }
      cur.ingresos += Number(r.costo)
      cur.pagado += Number(r.pagado_manicurista)
      map.set(semana, cur)
    })
    return [...map.values()]
      .sort((a, b) => a.semana.localeCompare(b.semana))
      .slice(-8)
      .map((s) => ({ ...s, neto: s.ingresos - s.pagado, label: s.semana.slice(5) }))
  }, [registros])

  // Por manicurista (mes en curso)
  const porManicurista = useMemo(() => {
    const inicioMes = hoy.slice(0, 7) + '-01'
    const deMes = registros.filter((r) => r.fecha >= inicioMes)
    const map = new Map()
    deMes.forEach((r) => {
      const nombre = r.manicuristas?.nombre ?? 'Sin asignar'
      const color = r.manicuristas?.color ?? '#8E3B46'
      const cur = map.get(r.manicurista_id) ?? { nombre, color, ingresos: 0, pagado: 0, servicios: 0 }
      cur.ingresos += Number(r.costo)
      cur.pagado += Number(r.pagado_manicurista)
      cur.servicios += 1
      map.set(r.manicurista_id, cur)
    })
    return [...map.values()].sort((a, b) => b.ingresos - a.ingresos)
  }, [registros, hoy])

  if (loading) return <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Cargando panel…</p>

  return (
    <div>
      <h2 className="font-display text-2xl mb-1">Panel general</h2>
      <p className="text-sm mb-6" style={{ color: 'var(--color-text-muted)' }}>
        Ingresos, pagos a manicuristas y utilidad neta del spa.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        {[
          { label: 'Hoy', d: resumen.hoy },
          { label: 'Esta semana', d: resumen.semana },
          { label: 'Este mes', d: resumen.mes },
        ].map((b) => (
          <div key={b.label} className="card p-4">
            <p className="text-xs mb-2" style={{ color: 'var(--color-text-muted)' }}>{b.label} · {b.d.n} servicios</p>
            <p className="font-mono-num text-2xl font-semibold">{currency(b.d.ingresos)}</p>
            <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
              Neto spa: <span className="font-mono-num font-medium" style={{ color: 'var(--color-success)' }}>{currency(b.d.ingresos - b.d.pagado)}</span>
            </p>
          </div>
        ))}
      </div>

      <div className="card p-4 mb-6">
        <h3 className="text-sm font-semibold mb-3">Últimas 8 semanas</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={porSemana}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} width={40} />
            <Tooltip formatter={(v) => currency(v)} labelFormatter={(l) => `Semana del ${l}`} />
            <Bar dataKey="ingresos" name="Ingresos" fill="#C9A24B" radius={[4, 4, 0, 0]} />
            <Bar dataKey="neto" name="Neto spa" fill="#7A2E3A" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="card p-4">
        <h3 className="text-sm font-semibold mb-3">Por manicurista · mes en curso</h3>
        {porManicurista.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Sin servicios este mes.</p>
        ) : (
          <div className="space-y-3">
            {porManicurista.map((m) => (
              <div key={m.nombre} className="flex items-center justify-between text-sm">
                <PolishDot color={m.color} label={m.nombre} />
                <div className="text-right">
                  <p className="font-mono-num font-medium">{currency(m.ingresos)}</p>
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    {m.servicios} servicios · pagado {currency(m.pagado)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
