export const currency = (value) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(value ?? 0)

export const shortDate = (isoDate) =>
  new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'short' }).format(
    new Date(isoDate + 'T00:00:00')
  )

export const longDate = (isoDate) =>
  new Intl.DateTimeFormat('es-CO', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date(isoDate + 'T00:00:00'))

// Convierte un objeto Date a texto YYYY-MM-DD usando su fecha LOCAL
// (no la de UTC). Usar .toISOString() aquí era el bug: como Bogotá está
// 5 horas detrás de UTC, entre las 7:00 p.m. y la medianoche locales
// .toISOString() ya devuelve el día siguiente, y "hoy" quedaba mal.
const aFechaLocalISO = (date) => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export const todayISO = () => aFechaLocalISO(new Date())

// Lunes como inicio de semana (ISO)
export const startOfWeekISO = (isoDate) => {
  const d = new Date(isoDate + 'T00:00:00')
  const day = d.getDay()
  const diff = (day === 0 ? -6 : 1) - day
  d.setDate(d.getDate() + diff)
  return aFechaLocalISO(d)
}

export const startOfMonthISO = (isoDate) => isoDate.slice(0, 7) + '-01'

// Fecha local de hace N días (útil para límites de consulta, ej. "últimos 90 días")
export const daysAgoISO = (n) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return aFechaLocalISO(d)
}
