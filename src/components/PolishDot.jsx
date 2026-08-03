export default function PolishDot({ color, label }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="polish-dot" style={{ background: color || '#8E3B46' }} aria-hidden="true" />
      {label && <span>{label}</span>}
    </span>
  )
}
