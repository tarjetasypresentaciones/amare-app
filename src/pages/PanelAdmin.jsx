import { useEffect, useMemo, useState } from 'react'
import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, PieChart, Pie, Legend } from 'recharts'
import { supabase } from '../lib/supabaseClient'
import { currency, startOfWeekISO, startOfMonthISO, todayISO, daysAgoISO, addDaysISO } from '../utils/format'
import PolishDot from '../components/PolishDot'

const META_MENSUAL_DEFECTO = 9000000

const longMonth = (isoDate) =>
  new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric' }).format(new Date(isoDate + 'T00:00:00'))

// Cantidad de días del mes al que pertenece esta fecha ISO (para repartir la meta mensual entre los días)
const diasDelMes = (isoDate) => {
  const [y, m] = isoDate.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

export default function PanelAdmin() {
  const [registros, setRegistros] = useState([])
  const [gastos, setGastos] = useState([])
  const [manicuristas, setManicuristas] = useState([])
  const [metaMensual, setMetaMensual] = useState(META_MENSUAL_DEFECTO)
  const [editandoMeta, setEditandoMeta] = useState(false)
  const [metaInput, setMetaInput] = useState('')
  const [guardandoMeta, setGuardandoMeta] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const desde = daysAgoISO(180) // suficiente para vistas semanal/mensual
    Promise.all([
      supabase
        .from('registros_servicios')
        .select('fecha, costo, pagado_manicurista, manicurista_id, manicuristas(nombre, color)')
        .gte('fecha', desde),
      supabase.from('gastos').select('fecha, valor, categorias_gasto(nombre)').gte('fecha', desde),
      supabase.from('manicuristas').select('id, nombre, color, activo').order('nombre'),
      supabase.from('configuracion').select('meta_mensual').eq('id', 1).maybeSingle(),
    ]).then(([r, g, m, cfg]) => {
      setRegistros(r.data ?? [])
      setGastos(g.data ?? [])
      setManicuristas(m.data ?? [])
      if (cfg.data?.meta_mensual) setMetaMensual(Number(cfg.data.meta_mensual))
      setLoading(false)
    })
  }, [])

  const abrirEdicionMeta = () => {
    setMetaInput(String(metaMensual))
    setEditandoMeta(true)
  }

  const guardarMeta = async () => {
    const valor = parseFloat(metaInput)
    if (!valor || valor <= 0) return
    setGuardandoMeta(true)
    const { error } = await supabase.from('configuracion').update({ meta_mensual: valor }).eq('id', 1)
    setGuardandoMeta(false)
    if (!error) {
      setMetaMensual(valor)
      setEditandoMeta(false)
    }
  }

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

  // Neto diario del mes en curso: (ingresos del spa ya sin comisión) - gastos del día
  const netoDiarioMes = useMemo(() => {
    const inicioMes = startOfMonthISO(hoy)
    const netoPorFecha = new Map()
    registros
      .filter((r) => r.fecha >= inicioMes && r.fecha <= hoy)
      .forEach((r) => {
        const netoServicio = Number(r.costo) - Number(r.pagado_manicurista)
        netoPorFecha.set(r.fecha, (netoPorFecha.get(r.fecha) ?? 0) + netoServicio)
      })
    gastos
      .filter((g) => g.fecha >= inicioMes && g.fecha <= hoy)
      .forEach((g) => {
        netoPorFecha.set(g.fecha, (netoPorFecha.get(g.fecha) ?? 0) - Number(g.valor))
      })

    // Un punto por cada día del mes hasta hoy (aunque no haya movimientos, para que la barra no "salte" días)
    const dias = []
    for (let f = inicioMes; f <= hoy; f = addDaysISO(f, 1)) {
      dias.push({ fecha: f, dia: f.slice(8, 10), neto: Math.round(netoPorFecha.get(f) ?? 0) })
    }
    return dias
  }, [registros, gastos, hoy])

  // Acumulado del mes en curso, con la meta mínima como referencia
  const acumuladoMes = useMemo(() => {
    let corrido = 0
    return netoDiarioMes.map((d) => {
      corrido += d.neto
      return { ...d, acumulado: corrido }
    })
  }, [netoDiarioMes])

  const totalAcumuladoMes = acumuladoMes.length ? acumuladoMes[acumuladoMes.length - 1].acumulado : 0
  const metaDiaria = Math.ceil(metaMensual / diasDelMes(hoy))

  // Gastos por categoría (mes en curso), para la dona
  const COLORES_DONA = ['#55300A', '#C9A24B', '#B3462C', '#7C8B6F', '#8A8070', '#D9B978', '#6E4315', '#A9977B']
  const gastosPorCategoria = useMemo(() => {
    const inicioMes = startOfMonthISO(hoy)
    const map = new Map()
    gastos
      .filter((g) => g.fecha >= inicioMes && g.fecha <= hoy)
      .forEach((g) => {
        const nombre = g.categorias_gasto?.nombre ?? 'Sin categoría'
        map.set(nombre, (map.get(nombre) ?? 0) + Number(g.valor))
      })
    return [...map.entries()]
      .map(([nombre, valor]) => ({ nombre, valor }))
      .sort((a, b) => b.valor - a.valor)
  }, [gastos, hoy])
  const totalGastosMes = gastosPorCategoria.reduce((s, g) => s + g.valor, 0)

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
      <h2 className="font-display text-2xl mb-1">Dashboard</h2>
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
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Meta mínima del mes</p>
            <p className="font-mono-num text-lg font-semibold">{currency(metaMensual)}</p>
          </div>
          {editandoMeta ? (
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                step="10000"
                autoFocus
                value={metaInput}
                onChange={(e) => setMetaInput(e.target.value)}
                className="w-36 text-sm"
                style={{ borderBottom: '1px solid var(--color-border)' }}
                placeholder="9000000"
              />
              <button
                type="button"
                onClick={guardarMeta}
                disabled={guardandoMeta}
                className="text-xs font-semibold rounded-full px-4 py-2"
                style={{ background: 'var(--color-primary)', color: '#fff' }}
              >
                {guardandoMeta ? 'Guardando…' : 'Guardar'}
              </button>
              <button
                type="button"
                onClick={() => setEditandoMeta(false)}
                className="text-xs font-medium"
                style={{ color: 'var(--color-text-muted)' }}
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={abrirEdicionMeta}
              className="text-xs font-medium rounded-full px-4 py-2"
              style={{ border: '1px solid #E2D3AE', color: '#B58A54' }}
            >
              Editar meta del mes
            </button>
          )}
        </div>
      </div>

      <div className="card p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Neto diario · {longMonth(hoy)}</h3>
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Ingresos del spa − gastos del día</span>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={netoDiarioMes}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="dia" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} width={40} />
            <Tooltip formatter={(v) => currency(v)} labelFormatter={(l) => `Día ${l}`} />
            <Bar dataKey="neto" name="Neto del día" radius={[4, 4, 0, 0]}>
              {netoDiarioMes.map((d, i) => (
                <Cell key={i} fill={d.neto >= 0 ? 'var(--color-primary)' : 'var(--color-danger)'} />
              ))}
            </Bar>
            <ReferenceLine y={0} stroke="var(--color-border)" />
            <ReferenceLine
              y={metaDiaria}
              stroke="var(--color-primary)"
              strokeDasharray="5 4"
              strokeWidth={1.5}
              label={{ value: `Meta día ${currency(metaDiaria)}`, position: 'insideTopRight', fontSize: 11, fill: 'var(--color-primary)' }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="card p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Acumulado del mes vs. meta</h3>
          <span className="text-xs font-mono-num" style={{ color: totalAcumuladoMes >= metaMensual ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
            {currency(totalAcumuladoMes)} de {currency(metaMensual)}
          </span>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={acumuladoMes}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="dia" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} width={40} />
            <Tooltip formatter={(v) => currency(v)} labelFormatter={(l) => `Día ${l}`} />
            <Bar dataKey="acumulado" name="Acumulado" radius={[4, 4, 0, 0]}>
              {acumuladoMes.map((d, i) => (
                <Cell key={i} fill={d.neto >= 0 ? 'var(--color-accent)' : 'var(--color-danger)'} />
              ))}
            </Bar>
            <ReferenceLine
              y={metaMensual}
              stroke="var(--color-primary)"
              strokeDasharray="5 4"
              strokeWidth={1.5}
              label={{ value: `Meta ${currency(metaMensual)}`, position: 'insideTopRight', fontSize: 11, fill: 'var(--color-primary)' }}
            />
          </BarChart>
        </ResponsiveContainer>
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

      <div className="card p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Gastos por categoría · mes en curso</h3>
          <span className="text-xs font-mono-num" style={{ color: 'var(--color-text-muted)' }}>{currency(totalGastosMes)}</span>
        </div>
        {gastosPorCategoria.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Sin gastos registrados este mes.</p>
        ) : (
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <ResponsiveContainer width="100%" height={200} style={{ maxWidth: 220 }}>
              <PieChart>
                <Pie
                  data={gastosPorCategoria}
                  dataKey="valor"
                  nameKey="nombre"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={2}
                >
                  {gastosPorCategoria.map((g, i) => (
                    <Cell key={g.nombre} fill={COLORES_DONA[i % COLORES_DONA.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => currency(v)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2 flex-1 w-full">
              {gastosPorCategoria.map((g, i) => (
                <div key={g.nombre} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: COLORES_DONA[i % COLORES_DONA.length], display: 'inline-block' }} />
                    {g.nombre}
                  </span>
                  <span className="font-mono-num" style={{ color: 'var(--color-text-muted)' }}>
                    {currency(g.valor)} · {totalGastosMes ? Math.round((g.valor / totalGastosMes) * 100) : 0}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
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
