import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { currency, shortDate } from './format'

const CHOCOLATE = [85, 48, 10]
const GOLD = [201, 162, 75]
const TEXT_MUTED = [138, 128, 112]
const INK = [43, 38, 32]
const ACCENT_SOFT = [241, 227, 196]

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

// Convierte una URL de imagen (p.ej. la del logo importado por Vite) a un
// data URL base64, que es lo que jsPDF necesita para incrustarla.
export async function imagenComoDataUrl(url) {
  const res = await fetch(url)
  const blob = await res.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function dibujarIntento(doc, { logoDataUrl, manicuristaNombre, desde, hasta, filasPorDia, total, nivel, firma }) {
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

  // Si ya está firmado, dibuja la imagen de la firma encima de la línea
  if (firma?.dataUrl) {
    const firmaW = 55
    const firmaH = 22
    doc.addImage(firma.dataUrl, 'PNG', pageW / 2 - firmaW / 2, yFirma - firmaH - 2, firmaW, firmaH)
  }

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

  let yPie = yFirma + 15
  if (firma?.fechaHoraTexto) {
    doc.setFontSize(7.5)
    doc.setTextColor(...TEXT_MUTED)
    doc.text(`Firmado el ${firma.fechaHoraTexto}${firma.dispositivo ? ' · ' + firma.dispositivo : ''}`, pageW / 2, yPie + 5, {
      align: 'center',
      maxWidth: pageW - margin * 2,
    })
    yPie += 5
  }

  doc.setFontSize(7.5)
  doc.setTextColor(...TEXT_MUTED)
  doc.text(`Generado el ${new Date().toLocaleDateString('es-CO')}`, margin, pageH - 10)

  const finalBottom = yPie + 5
  return finalBottom <= pageH - 10 && !desbordoPaginas
}

// Genera el PDF completo (jsPDF doc, sin guardar) probando tamaños de letra
// hasta que quepa en una sola hoja. `firma` es opcional:
// { dataUrl, fechaHoraTexto, dispositivo }
export function generarPagoServiciosPDF({ logoDataUrl, manicuristaNombre, desde, hasta, filasPorDia, total, firma }) {
  let docFinal = null
  for (const nivel of NIVELES_PAGO) {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const cabe = dibujarIntento(doc, { logoDataUrl, manicuristaNombre, desde, hasta, filasPorDia, total, nivel, firma })
    docFinal = doc
    if (cabe) break
  }
  return docFinal
}

// Agrupa registros de servicios por fecha: [[fecha, cantidad, totalTexto], ...]
export function agruparPorDia(registros, campoFecha = 'fecha', campoPagado = 'pagado_manicurista') {
  const porDia = new Map()
  registros.forEach((r) => {
    const f = shortDate(r[campoFecha])
    const actual = porDia.get(f) ?? { cantidad: 0, total: 0 }
    actual.cantidad += 1
    actual.total += Number(r[campoPagado])
    porDia.set(f, actual)
  })
  return [...porDia.entries()].map(([f, d]) => [f, String(d.cantidad), currency(d.total)])
}
