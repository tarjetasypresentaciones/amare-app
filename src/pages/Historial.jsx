import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { currency, shortDate, todayISO } from '../utils/format'
import PolishDot from '../components/PolishDot'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export default function Historial() {
  const [manicuristas, setManicuristas] = useState([])
  const [filtroManicurista, setFiltroManicurista] = useState('')
  const [desde, setDesde] = useState(todayISO())
  const [hasta, setHasta] = useState(todayISO())
  const [registros, setRegistros] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('manicuristas').select('id, nombre, color').order('nombre')
      .then(({ data }) => setManicuristas(data ?? []))
  }, [])

  useEffect(() => {
    setLoading(true)
    let query = supabase
      .from('registros_servicios')
      .select('id, fecha, cliente_nombre, tipo_servicio, costo, porcentaje, pagado_manicurista, metodo_pago, numero_recibo, manicuristas(nombre, color)')
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })

    if (filtroManicurista) query = query.eq('manicurista_id', filtroManicurista)

    query.then(({ data, error }) => {
      if (!error) setRegistros(data ?? [])
      setLoading(false)
    })
  }, [filtroManicurista, desde, hasta])

  const totalCosto = registros.reduce((s, r) => s + Number(r.costo), 0)
  const totalPagado = registros.reduce((s, r) => s + Number(r.pagado_manicurista), 0)

  // Nombre de archivo con el rango de fechas filtrado, para que quede
  // claro qué periodo contiene cada descarga.
  const nombreArchivo = `historial-servicios_${desde}_a_${hasta}`

  // Mismas filas que se ven en pantalla, con las columnas pedidas:
  // Fecha, Manicurista, Servicio, Cliente, Costo, Pagado.
  const filasParaExportar = () =>
    registros.map((r) => ({
      Fecha: shortDate(r.fecha),
      Manicurista: r.manicuristas?.nombre ?? '—',
      Servicio: r.tipo_servicio,
      Cliente: r.cliente_nombre || '—',
      Costo: Number(r.costo),
      Pagado: Number(r.pagado_manicurista),
    }))

  const exportarExcel = () => {
    const filas = filasParaExportar()
    const hoja = XLSX.utils.json_to_sheet(filas)
    hoja['!cols'] = [{ wch: 10 }, { wch: 20 }, { wch: 22 }, { wch: 24 }, { wch: 12 }, { wch: 12 }]
    const libro = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(libro, hoja, 'Historial')
    XLSX.writeFile(libro, `${nombreArchivo}.xlsx`)
  }

  const exportarPDF = () => {
    const filas = filasParaExportar()
    const doc = new jsPDF({ orientation: 'landscape' })

    doc.setFontSize(14)
    doc.text('Amaré — Historial de servicios', 14, 15)
    doc.setFontSize(10)
    doc.text(
      `Del ${shortDate(desde)} al ${shortDate(hasta)}` +
        (filtroManicurista ? ` — ${manicuristas.find((m) => m.id === filtroManicurista)?.nombre ?? ''}` : ''),
      14,
      21
    )

    autoTable(doc, {
      startY: 26,
      head: [['Fecha', 'Manicurista', 'Servicio', 'Cliente', 'Costo', 'Pagado']],
      body: filas.map((f) => [
        f.Fecha,
        f.Manicurista,
        f.Servicio,
        f.Cliente,
        currency(f.Costo),
        currency(f.Pagado),
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [122, 46, 58] },
    })

    doc.save(`${nombreArchivo}.pdf`)
  }

  return (
    <div>
      <h2 className="font-display text-2xl mb-1">Historial de servicios</h2>
      <p className="text-sm mb-6" style={{ color: 'var(--color-text-muted)' }}>
        Consulta y filtra todos los servicios registrados.
      </p>

      <div className="card p-4 mb-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className="block text-xs font-medium mb-1">Desde</label>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
            className="w-full rounded-lg border px-2 py-1.5 text-sm" style={{ borderColor: 'var(--color-border)' }} />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Hasta</label>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
            className="w-full rounded-lg border px-2 py-1.5 text-sm" style={{ borderColor: 'var(--color-border)' }} />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium mb-1">Manicurista</label>
          <select value={filtroManicurista} onChange={(e) => setFiltroManicurista(e.target.value)}
            className="w-full rounded-lg border px-2 py-1.5 text-sm" style={{ borderColor: 'var(--color-border)' }}>
            <option value="">Todas</option>
            {manicuristas.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
          </select>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={exportarExcel}
          disabled={registros.length === 0}
          className="text-sm font-medium rounded-full px-3 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ border: '1px solid var(--color-border)' }}
        >
          📊 Exportar Excel
        </button>
        <button
          type="button"
          onClick={exportarPDF}
          disabled={registros.length === 0}
          className="text-sm font-medium rounded-full px-3 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ border: '1px solid var(--color-border)' }}
        >
          📄 Exportar PDF
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="card p-4">
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Total ingresos</p>
          <p className="font-mono-num text-xl font-semibold">{currency(totalCosto)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Total pagado a manicuristas</p>
          <p className="font-mono-num text-xl font-semibold" style={{ color: 'var(--color-primary)' }}>{currency(totalPagado)}</p>
        </div>
      </div>

      <div className="card overflow-x-auto">
        {loading ? (
          <p className="p-4 text-sm" style={{ color: 'var(--color-text-muted)' }}>Cargando…</p>
        ) : registros.length === 0 ? (
          <p className="p-4 text-sm" style={{ color: 'var(--color-text-muted)' }}>No hay servicios en este rango.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left" style={{ color: 'var(--color-text-muted)' }}>
                <th className="px-4 py-2 font-medium">Recibo de Caja</th>
                <th className="px-4 py-2 font-medium">Fecha</th>
                <th className="px-4 py-2 font-medium">Manicurista</th>
                <th className="px-4 py-2 font-medium">Servicio</th>
                <th className="px-4 py-2 font-medium">Cliente</th>
                <th className="px-4 py-2 font-medium text-right">Costo</th>
                <th className="px-4 py-2 font-medium text-right">%</th>
                <th className="px-4 py-2 font-medium text-right">Pagado</th>
              </tr>
            </thead>
            <tbody>
              {registros.map((r) => (
                <tr key={r.id} className="border-t" style={{ borderColor: 'var(--color-border)' }}>
                  <td className="px-4 py-2 whitespace-nowrap font-mono-num" style={{ color: 'var(--color-text-muted)' }}>
                    {r.numero_recibo ? `N.º ${String(r.numero_recibo).padStart(6, '0')}` : '—'}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">{shortDate(r.fecha)}</td>
                  <td className="px-4 py-2">
                    <PolishDot color={r.manicuristas?.color} label={r.manicuristas?.nombre} />
                  </td>
                  <td className="px-4 py-2">{r.tipo_servicio}</td>
                  <td className="px-4 py-2" style={{ color: 'var(--color-text-muted)' }}>{r.cliente_nombre || '—'}</td>
                  <td className="px-4 py-2 text-right font-mono-num">{currency(r.costo)}</td>
                  <td className="px-4 py-2 text-right font-mono-num">{r.porcentaje}%</td>
                  <td className="px-4 py-2 text-right font-mono-num font-medium">{currency(r.pagado_manicurista)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
