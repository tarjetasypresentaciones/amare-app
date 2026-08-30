import { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react'

// Cuadro de firma: el usuario dibuja con el mouse o el dedo. Expone
// `getDataUrl()` (PNG base64) y `clear()` a través de la ref.
const SignaturePad = forwardRef(function SignaturePad(_, ref) {
  const canvasRef = useRef(null)
  const dibujando = useRef(false)
  const [vacio, setVacio] = useState(true)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    // Escala el canvas a la resolución real del dispositivo para que la
    // firma no se vea pixelada en celulares con pantallas de alta densidad.
    const ratio = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * ratio
    canvas.height = rect.height * ratio
    ctx.scale(ratio, ratio)
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#2B2620'
  }, [])

  const posición = (e) => {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const punto = e.touches ? e.touches[0] : e
    return { x: punto.clientX - rect.left, y: punto.clientY - rect.top }
  }

  const empezar = (e) => {
    e.preventDefault()
    dibujando.current = true
    const ctx = canvasRef.current.getContext('2d')
    const { x, y } = posición(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  const mover = (e) => {
    if (!dibujando.current) return
    e.preventDefault()
    const ctx = canvasRef.current.getContext('2d')
    const { x, y } = posición(e)
    ctx.lineTo(x, y)
    ctx.stroke()
    if (vacio) setVacio(false)
  }

  const terminar = () => {
    dibujando.current = false
  }

  useImperativeHandle(ref, () => ({
    getDataUrl: () => canvasRef.current.toDataURL('image/png'),
    isEmpty: () => vacio,
    clear: () => {
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      setVacio(true)
    },
  }))

  return (
    <div>
      <canvas
        ref={canvasRef}
        onMouseDown={empezar}
        onMouseMove={mover}
        onMouseUp={terminar}
        onMouseLeave={terminar}
        onTouchStart={empezar}
        onTouchMove={mover}
        onTouchEnd={terminar}
        style={{
          width: '100%',
          height: 160,
          background: '#FFFFFF',
          border: '1px solid var(--color-border)',
          borderRadius: 8,
          touchAction: 'none',
          cursor: 'crosshair',
        }}
      />
      {vacio && (
        <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
          Firma aquí con el dedo o el mouse.
        </p>
      )}
    </div>
  )
})

export default SignaturePad
