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

export const todayISO = () => new Date().toISOString().slice(0, 10)

// Lunes como inicio de semana (ISO)
export const startOfWeekISO = (isoDate) => {
  const d = new Date(isoDate + 'T00:00:00')
  const day = d.getDay()
  const diff = (day === 0 ? -6 : 1) - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().slice(0, 10)
}

export const startOfMonthISO = (isoDate) => isoDate.slice(0, 7) + '-01'
