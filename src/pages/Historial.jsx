import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { currency, shortDate, todayISO } from '../utils/format'
import PolishDot from '../components/PolishDot'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import logoAmareUrl from '../assets/logo-amare.png'

const CHOCOLATE = [85, 48, 10]
const GOLD = [201, 162, 75]
const TEXT_MUTED = [138, 128, 112]
const INK = [43, 38, 32]
const ACCENT_SOFT = [241, 227, 196]

// Convierte el logo (importado por Vite como URL) a un data URL base64,
// que es lo que jsPDF necesita para poder incrustar la imagen en el PDF.
async function logoComoDataUrl() {
  const res = await fetch(logoAmareUrl)
  const blob = await res.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

// Tamaños de letra a probar, de mayor a menor, hasta que la tabla + el
// pie de firma quepan en una sola hoja A4.
const NIVELES_PAGO = [
  { fontSize: 9.5, cellPadding: 2.4 },
  { fontSize: 8.5, cellPadding: 2.0 },
  { fontSize: 7.5, cellPadding: 1.6 },
  { fontSize: 6.8, cellPadding: 1.3 },
  { fontSize: 6.0, cellPadding: 1.0 },
  { fontSize: 5.4, cellPadding: 0.8 },
]

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

  // ---- "Pago servicios manicuristas": recibo de pago por prestación de
  // servicios, agrupado por día, para UNA manicurista y un rango de fechas ----
  const [generandoPago, setGenerandoPago] = useState(false)
  const [avisoPago, setAvisoPago] = useState('')

  const dibujarIntentoPago = (doc, logoDataUrl, manicuristaNombre, filasPorDia, total, nivel) => {
    const pageW = doc.internal.pageSize.getWidth()
    const pageH = doc.internal.pageSize.getHeight()
    const margin = 16

    const logoW = 17
    const logoH = logoW * (607 / 500)
    doc.addImage(logoDataUrl, 'PNG', margin, 14, logoW, logoH)

    doc.setFont('times', 'bolditalic')
    doc.setFontSize(16)
    doc.setTextColor(...CHOCOLATE)
    doc.text('Pago por prestación de servicios', pageW - margin, 22, { align: 'right' })

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...TEXT_MUTED)
    doc.text('Amaré Atelier · Donde te eliges a ti.', pageW - margin, 28, { align: 'right' })

    const yLinea = 14 + logoH + 3
    doc.setDrawColor(...GOLD)
    doc.setLineWidth(0.5)
    doc.line(margin, yLinea, pageW - margin, yLinea)

    const yInfo = yLinea + 6
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10.5)
    doc.setTextColor(...INK)
    doc.text('Manicurista:', margin, yInfo)
    doc.setFont('helvetica', 'normal')
    doc.text(manicuristaNombre, margin + 26, yInfo)
    doc.setFont('helvetica', 'bold')
    doc.text('Periodo:', pageW - margin - 60, yInfo)
    doc.setFont('helvetica', 'normal')
    doc.text(`${shortDate(desde)} — ${shortDate(hasta)}`, pageW - margin - 42, yInfo)

    const startY = yInfo + 5

    autoTable(doc, {
      startY,
      margin: { left: margin, right: margin },
      head: [['Fecha', 'Servicios', 'Total pagado']],
      body: filasPorDia,
      styles: {
        font: 'helvetica',
        fontSize: nivel.fontSize,
        cellPadding: nivel.cellPadding,
        textColor: INK,
        lineColor: [231, 224, 208],
        lineWidth: 0.15,
      },
      headStyles: { fillColor: CHOCOLATE, textColor: [246, 242, 234], fontStyle: 'bold', halign: 'left' },
      alternateRowStyles: { fillColor: [250, 247, 240] },
      columnStyles: {
        0: { cellWidth: 55 },
        1: { halign: 'center', cellWidth: 55 },
        2: { halign: 'right', cellWidth: 68 },
      },
    })

    const finalY = doc.lastAutoTable.finalY
    const desbordoPaginas = doc.internal.getNumberOfPages() > 1

    const totalBoxW = 90
    const totalBoxH = 11
    doc.setFillColor(...ACCENT_SOFT)
    doc.roundedRect(pageW - margin - totalBoxW, finalY + 5, totalBoxW, totalBoxH, 1.5, 1.5, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(138, 122, 78)
    doc.text('TOTAL PAGADO A LA MANICURISTA', pageW - margin - totalBoxW + 5, finalY + 5 + 4.5)
    doc.setFont('times', 'bolditalic')
    doc.setFontSize(13)
    doc.setTextColor(...CHOCOLATE)
    doc.text(currency(total), pageW - margin - 5, finalY + 5 + 9, { align: 'right' })

    const yFirmaNatural = finalY + 5 + totalBoxH + 13
    const anclaInferior = pageH - 55
    const yFirma = Math.max(yFirmaNatural, anclaInferior)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(...INK)
    doc.text(manicuristaNombre, pageW / 2, yFirma, { align: 'center' })
    doc.setDrawColor(...INK)
    doc.setLineWidth(0.3)
    doc.line(pageW / 2 - 40, yFirma + 10, pageW / 2 + 40, yFirma + 10)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...TEXT_MUTED)
    doc.text('Recibí conforme', pageW / 2, yFirma + 15, { align: 'center' })

    doc.setFontSize(7.5)
    doc.text(`Generado el ${new Date().toLocaleDateString('es-CO')}`, margin, pageH - 10)

    const finalBottom = yFirma + 15
    return finalBottom <= pageH - 10 && !desbordoPaginas
  }

  const generarPagoManicurista = async () => {
    if (!filtroManicurista) {
      setAvisoPago('Selecciona una manicurista arriba para generar su pago.')
      return
    }
    if (registros.length === 0) {
      setAvisoPago('No hay servicios en este rango de fechas para esa manicurista.')
      return
    }
    setAvisoPago('')
    setGenerandoPago(true)

    const manicuristaNombre = manicuristas.find((m) => m.id === filtroManicurista)?.nombre ?? '—'

    // Agrupa por día: Fecha | cantidad de servicios | total pagado ese día
    const porDia = new Map()
    registros.forEach((r) => {
      const f = shortDate(r.fecha)
      const actual = porDia.get(f) ?? { cantidad: 0, total: 0 }
      actual.cantidad += 1
      actual.total += Number(r.pagado_manicurista)
      porDia.set(f, actual)
    })
    const filasPorDia = [...porDia.entries()].map(([f, d]) => [f, String(d.cantidad), currency(d.total)])
    const total = registros.reduce((s, r) => s + Number(r.pagado_manicurista), 0)

    const logoDataUrl = await logoComoDataUrl()

    let docFinal = null
    for (const nivel of NIVELES_PAGO) {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const cabe = dibujarIntentoPago(doc, logoDataUrl, manicuristaNombre, filasPorDia, total, nivel)
      docFinal = doc
      if (cabe) break
    }

    docFinal.save(`pago-servicios_${manicuristaNombre.replace(/\s+/g, '-').toLowerCase()}_${desde}_a_${hasta}.pdf`)
    setGenerandoPago(false)
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

      <div className="flex gap-2 mb-1 flex-wrap">
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
        <button
          type="button"
          onClick={generarPagoManicurista}
          disabled={generandoPago}
          className="text-sm font-semibold rounded-full px-3 py-1.5 disabled:opacity-60"
          style={{ border: '1px solid #E2D3AE', color: '#B58A54' }}
        >
          {generandoPago ? 'Generando…' : '🧾 Pago servicios manicuristas'}
        </button>
      </div>
      {avisoPago && (
        <p className="text-xs mb-3" style={{ color: 'var(--color-danger)' }}>{avisoPago}</p>
      )}
      <div className="mb-4" />

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
