import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/AuthContext'
import { currency, shortDate, startOfWeekISO, todayISO, daysAgoISO } from '../utils/format'
import SignaturePad from '../components/SignaturePad'
import { generarPagoServiciosPDF, imagenComoDataUrl } from '../utils/pagoServiciosPdf'
import logoAmareUrl from '../assets/logo-amare.png'

// Descripción legible del dispositivo/navegador, para dejar constancia de
// desde dónde se firmó (no es infalible, pero sirve como referencia).
function descripcionDispositivo() {
  const ua = navigator.userAgent
  const tipo = /iPhone|Android.*Mobile/i.test(ua) ? 'Celular' : /iPad|Android/i.test(ua) ? 'Tablet' : 'Computador'
  let navegador = 'Navegador'
  if (/Edg\//.test(ua)) navegador = 'Edge'
  else if (/Chrome\//.test(ua) && !/OPR\//.test(ua)) navegador = 'Chrome'
  else if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) navegador = 'Safari'
  else if (/Firefox\//.test(ua)) navegador = 'Firefox'
  return `${tipo} · ${navegador}`
}

export default function MisIngresos() {
  const { profile } = useAuth()
  const [registros, setRegistros] = useState([])
  const [pagos, setPagos] = useState([])
  const [loading, setLoading] = useState(true)

  const [pagoAbierto, setPagoAbierto] = useState(null) // id del pago que se está revisando/firmando
  const [firmando, setFirmando] = useState(false)
  const [errorFirma, setErrorFirma] = useState('')
  const firmaRef = useRef(null)

  const cargarPagos = () => {
    if (!profile?.manicurista_id) return
    supabase
      .from('pagos_manicuristas')
      .select('*')
      .eq('manicurista_id', profile.manicurista_id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setPagos(data ?? []))
  }

  useEffect(() => {
    if (!profile?.manicurista_id) {
      setLoading(false)
      return
    }
    supabase
      .from('registros_servicios')
      .select('id, fecha, cliente_nombre, tipo_servicio, costo, porcentaje, pagado_manicurista')
      .eq('manicurista_id', profile.manicurista_id)
      .gte('fecha', daysAgoISO(90))
      .order('fecha', { ascending: false })
      .then(({ data }) => {
        setRegistros(data ?? [])
        setLoading(false)
      })
    cargarPagos()
  }, [profile])

  const hoy = todayISO()

  const resumen = useMemo(() => {
    const inicioSemana = startOfWeekISO(hoy)
    const inicioMes = hoy.slice(0, 7) + '-01'
    const sum = (arr) => arr.reduce((s, r) => s + Number(r.pagado_manicurista), 0)
    return {
      semana: sum(registros.filter((r) => r.fecha >= inicioSemana)),
      mes: sum(registros.filter((r) => r.fecha >= inicioMes)),
      hoy: sum(registros.filter((r) => r.fecha === hoy)),
    }
  }, [registros, hoy])

  const pendientes = pagos.filter((p) => p.estado === 'pendiente_firma')
  const firmados = pagos.filter((p) => p.estado === 'firmado')

  const abrirFirma = (id) => {
    setPagoAbierto(id)
    setErrorFirma('')
  }

  const cancelarFirma = () => {
    setPagoAbierto(null)
    setErrorFirma('')
    firmaRef.current?.clear()
  }

  const confirmarFirma = async (pago) => {
    if (!firmaRef.current || firmaRef.current.isEmpty()) {
      setErrorFirma('Falta tu firma — dibújala en el recuadro antes de confirmar.')
      return
    }
    setFirmando(true)
    setErrorFirma('')

    const firmaDataUrl = firmaRef.current.getDataUrl()
    const dispositivo = descripcionDispositivo()
    const fechaHoraTexto = new Date().toLocaleString('es-CO', {
      dateStyle: 'long',
      timeStyle: 'short',
    })

    try {
      const logoDataUrl = await imagenComoDataUrl(logoAmareUrl)
      const doc = generarPagoServiciosPDF({
        logoDataUrl,
        manicuristaNombre: profile?.nombre_completo ?? '—',
        desde: pago.fecha_desde,
        hasta: pago.fecha_hasta,
        filasPorDia: pago.detalle,
        total: pago.total,
        firma: { dataUrl: firmaDataUrl, fechaHoraTexto, dispositivo },
      })
      const blob = doc.output('blob')
      const ruta = `${profile.manicurista_id}/${pago.id}.pdf`
      const { error: errorSubida } = await supabase.storage
        .from('pagos-manicuristas')
        .upload(ruta, blob, { upsert: true, cacheControl: '3600', contentType: 'application/pdf' })
      if (errorSubida) throw errorSubida

      const { data: urlData } = supabase.storage.from('pagos-manicuristas').getPublicUrl(ruta)

      const { error: errorRpc } = await supabase.rpc('firmar_pago_manicurista', {
        p_pago_id: pago.id,
        p_firma_data_url: firmaDataUrl,
        p_dispositivo: dispositivo,
        p_pdf_url: urlData.publicUrl,
      })
      if (errorRpc) throw errorRpc

      // Descarga automáticamente su copia firmada para que quede en su celular
      doc.save(`pago-servicios_${(profile?.nombre_completo ?? 'firmado').replace(/\s+/g, '-').toLowerCase()}.pdf`)

      setPagoAbierto(null)
      firmaRef.current?.clear()
      cargarPagos()
    } catch (e) {
      setErrorFirma('No se pudo guardar la firma: ' + (e.message ?? 'intenta de nuevo.'))
    }
    setFirmando(false)
  }

  if (loading) return <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Cargando…</p>

  if (!profile?.manicurista_id) {
    return (
      <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
        Esta sección es solo para manicuristas.
      </p>
    )
  }

  return (
    <div>
      <h2 className="font-display text-2xl mb-1">Mis ingresos</h2>
      <p className="text-sm mb-6" style={{ color: 'var(--color-text-muted)' }}>
        Lo que has generado, {profile?.nombre_completo?.split(' ')[0]}.
      </p>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="card p-4">
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Hoy</p>
          <p className="font-mono-num text-lg font-semibold">{currency(resumen.hoy)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Semana</p>
          <p className="font-mono-num text-lg font-semibold">{currency(resumen.semana)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Mes</p>
          <p className="font-mono-num text-lg font-semibold">{currency(resumen.mes)}</p>
        </div>
      </div>

      {pendientes.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--color-danger)' }}>
            Pagos pendientes de firma
          </h3>
          <div className="space-y-3">
            {pendientes.map((p) => (
              <div key={p.id} className="card p-4" style={{ borderColor: '#E2D3AE' }}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <p className="text-sm font-medium">
                      {shortDate(p.fecha_desde)} — {shortDate(p.fecha_hasta)}
                    </p>
                    <p className="font-mono-num text-lg font-semibold" style={{ color: 'var(--color-primary)' }}>
                      {currency(p.total)}
                    </p>
                  </div>
                  {pagoAbierto !== p.id && (
                    <button
                      onClick={() => abrirFirma(p.id)}
                      className="text-xs font-semibold rounded-full px-4 py-2"
                      style={{ background: 'var(--color-primary)', color: '#fff' }}
                    >
                      Revisar y firmar
                    </button>
                  )}
                </div>

                {pagoAbierto === p.id && (
                  <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--color-border)' }}>
                    <div className="overflow-x-auto mb-4">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left" style={{ color: 'var(--color-text-muted)' }}>
                            <th className="px-2 py-1.5 font-medium">Fecha</th>
                            <th className="px-2 py-1.5 font-medium text-center">Servicios</th>
                            <th className="px-2 py-1.5 font-medium text-right">Total pagado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {p.detalle.map((fila, i) => (
                            <tr key={i} className="border-t" style={{ borderColor: 'var(--color-border)' }}>
                              <td className="px-2 py-1.5">{fila[0]}</td>
                              <td className="px-2 py-1.5 text-center">{fila[1]}</td>
                              <td className="px-2 py-1.5 text-right font-mono-num">{fila[2]}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <p className="text-xs font-medium mb-2">Firma para confirmar que recibiste este pago</p>
                    <SignaturePad ref={firmaRef} />
                    {errorFirma && (
                      <p className="text-xs mt-2" style={{ color: 'var(--color-danger)' }}>{errorFirma}</p>
                    )}
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => confirmarFirma(p)}
                        disabled={firmando}
                        className="text-sm font-semibold rounded-full px-4 py-2 disabled:opacity-60"
                        style={{ background: 'var(--color-primary)', color: '#fff' }}
                      >
                        {firmando ? 'Guardando…' : 'Firmar y confirmar'}
                      </button>
                      <button
                        onClick={cancelarFirma}
                        disabled={firmando}
                        className="text-sm font-medium"
                        style={{ color: 'var(--color-text-muted)' }}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {firmados.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold mb-2">Pagos firmados</h3>
          <div className="card divide-y" style={{ borderColor: 'var(--color-border)' }}>
            {firmados.map((p) => (
              <div key={p.id} className="p-4 flex items-center justify-between flex-wrap gap-2">
                <div>
                  <p className="text-sm font-medium">
                    {shortDate(p.fecha_desde)} — {shortDate(p.fecha_hasta)}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    Firmado el {new Date(p.firmado_at).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono-num text-sm font-semibold">{currency(p.total)}</span>
                  {p.pdf_url && (
                    <a
                      href={p.pdf_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-medium rounded-full px-3 py-1.5"
                      style={{ border: '1px solid var(--color-border)' }}
                    >
                      Ver PDF
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card overflow-x-auto">
        {registros.length === 0 ? (
          <p className="p-4 text-sm" style={{ color: 'var(--color-text-muted)' }}>Aún no tienes servicios registrados.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left" style={{ color: 'var(--color-text-muted)' }}>
                <th className="px-4 py-2 font-medium">Fecha</th>
                <th className="px-4 py-2 font-medium">Servicio</th>
                <th className="px-4 py-2 font-medium">Cliente</th>
                <th className="px-4 py-2 font-medium text-right">Costo</th>
                <th className="px-4 py-2 font-medium text-right">Recibiste</th>
              </tr>
            </thead>
            <tbody>
              {registros.map((r) => (
                <tr key={r.id} className="border-t" style={{ borderColor: 'var(--color-border)' }}>
                  <td className="px-4 py-2 whitespace-nowrap">{shortDate(r.fecha)}</td>
                  <td className="px-4 py-2">{r.tipo_servicio}</td>
                  <td className="px-4 py-2" style={{ color: 'var(--color-text-muted)' }}>{r.cliente_nombre || '—'}</td>
                  <td className="px-4 py-2 text-right font-mono-num">{currency(r.costo)}</td>
                  <td className="px-4 py-2 text-right font-mono-num font-medium" style={{ color: 'var(--color-primary)' }}>
                    {currency(r.pagado_manicurista)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
