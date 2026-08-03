import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/AuthContext'
import { currency, shortDate, startOfWeekISO, todayISO } from '../utils/format'

export default function MisIngresos() {
  const { profile } = useAuth()
  const [registros, setRegistros] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile?.manicurista_id) return
    const desde = new Date()
    desde.setDate(desde.getDate() - 90)
    supabase
      .from('registros_servicios')
      .select('id, fecha, cliente_nombre, tipo_servicio, costo, porcentaje, pagado_manicurista')
      .eq('manicurista_id', profile.manicurista_id)
      .gte('fecha', desde.toISOString().slice(0, 10))
      .order('fecha', { ascending: false })
      .then(({ data }) => {
        setRegistros(data ?? [])
        setLoading(false)
      })
  }, [profile])

  const hoy = todayISO()

  const resumen = useMemo(() => {
    const inicioSemana = startOfWeekISO(hoy)
    const inicioMes = hoy.slice(0, 7) + '-01'
    const sum = (arr) => arr.reduce((s, r) => s + Number(r.pagado_manicurista), 0)
    return {
      semana: sum(registros.filter((r) => r.fecha >= inicioSemana)),
      mes: sum(registros.filter((r) => r.fecha >= inicioMes)),
      hoy: sum(registros.filter((r) => r.fecha === hoy)),
    }
  }, [registros, hoy])

  if (loading) return <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Cargando…</p>

  return (
    <div>
      <h2 className="font-display text-2xl mb-1">Mis ingresos</h2>
      <p className="text-sm mb-6" style={{ color: 'var(--color-text-muted)' }}>
        Lo que has generado, {profile?.nombre_completo?.split(' ')[0]}.
      </p>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="card p-4">
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Hoy</p>
          <p className="font-mono-num text-lg font-semibold">{currency(resumen.hoy)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Semana</p>
          <p className="font-mono-num text-lg font-semibold">{currency(resumen.semana)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Mes</p>
          <p className="font-mono-num text-lg font-semibold">{currency(resumen.mes)}</p>
        </div>
      </div>

      <div className="card overflow-x-auto">
        {registros.length === 0 ? (
          <p className="p-4 text-sm" style={{ color: 'var(--color-text-muted)' }}>Aún no tienes servicios registrados.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left" style={{ color: 'var(--color-text-muted)' }}>
                <th className="px-4 py-2 font-medium">Fecha</th>
                <th className="px-4 py-2 font-medium">Servicio</th>
                <th className="px-4 py-2 font-medium">Cliente</th>
                <th className="px-4 py-2 font-medium text-right">Costo</th>
                <th className="px-4 py-2 font-medium text-right">Recibiste</th>
              </tr>
            </thead>
            <tbody>
              {registros.map((r) => (
                <tr key={r.id} className="border-t" style={{ borderColor: 'var(--color-border)' }}>
                  <td className="px-4 py-2 whitespace-nowrap">{shortDate(r.fecha)}</td>
                  <td className="px-4 py-2">{r.tipo_servicio}</td>
                  <td className="px-4 py-2" style={{ color: 'var(--color-text-muted)' }}>{r.cliente_nombre || '—'}</td>
                  <td className="px-4 py-2 text-right font-mono-num">{currency(r.costo)}</td>
                  <td className="px-4 py-2 text-right font-mono-num font-medium" style={{ color: 'var(--color-primary)' }}>
                    {currency(r.pagado_manicurista)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
