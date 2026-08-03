// Muestra la foto circular de una manicurista. Si no tiene foto, muestra sus iniciales.
export default function Avatar({ url, nombre, size = 32 }) {
  const iniciales = (nombre || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')

  if (url) {
    return (
      <img
        src={url}
        alt={nombre || 'Foto'}
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size, border: '1px solid var(--color-border)' }}
      />
    )
  }

  return (
    <span
      className="rounded-full flex items-center justify-center font-semibold shrink-0"
      style={{
        width: size,
        height: size,
        background: 'var(--color-accent-soft)',
        color: 'var(--color-primary)',
        fontSize: Math.max(10, size * 0.4),
      }}
    >
      {iniciales || '?'}
    </span>
  )
}
