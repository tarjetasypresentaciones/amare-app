// Utilidades compartidas por las vistas de calendario (admin y manicurista)

// Horario visible en el calendario: 8:00 a 20:00 (horario amplio del local)
export const HORA_INICIO_CALENDARIO = 8 * 60 // minutos desde medianoche
export const HORA_FIN_CALENDARIO = 20 * 60

// Horario en el que un cliente puede tomar un servicio: 10:00 a 19:00
export const HORA_INICIO_CLIENTE = 10 * 60
export const HORA_FIN_CLIENTE = 19 * 60

export const PASO_MINUTOS = 30

// Genera la lista de slots (en minutos desde medianoche) para las filas del calendario
export function generarSlots() {
  const slots = []
  for (let m = HORA_INICIO_CALENDARIO; m < HORA_FIN_CALENDARIO; m += PASO_MINUTOS) {
    slots.push(m)
  }
  return slots
}

export function minutosATexto(minutos) {
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function textoAMinutos(texto) {
  const [h, m] = texto.split(':').map(Number)
  return h * 60 + m
}

export function sumarMinutos(horaTexto, minutos) {
  return minutosATexto(textoAMinutos(horaTexto) + minutos)
}

export function fechaISO(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// 0 = domingo, 6 = sábado (igual que Date#getDay)
export function esFinDeSemana(date) {
  const dia = date.getDay()
  return dia === 0 || dia === 6
}

export const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

export function nombreDia(date) {
  return DIAS_SEMANA[date.getDay()]
}
