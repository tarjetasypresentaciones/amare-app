import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { currency, longDate, shortDate, todayISO } from '../utils/format'

export default function CierreCaja() {
  const [fecha, setFecha] = useState(todayISO())
  const [cierre, setCierre] = useState(null)
  const [historial, setHistorial] = useState([])
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const cargar = async () => {
    setLoading(true)
    const [{ data: c }, { data: h }, { data: cfg }] = await Promise.all([
      supabase.from('cierres_caja').select('*').eq('fecha', fecha).maybeSingle(),
      supabase.from('cierres_caja').select('*').order('fecha', { ascending: false }).limit(14),
      supabase.from('configuracion').select('*').eq('id', 1).single(),
    ])
    setCierre(c)
    setHistorial(h ?? [])
    setConfig(cfg)
    setLoading(false)
  }

  useEffect(() => { cargar() }, [fecha]) // eslint-disable-line react-hooks/exhaustive-deps

  const generar = async () => {
    setBusy(true)
    await supabase.rpc('generar_cierre_dia', { p_fecha: fecha })
    await cargar()
    setBusy(false)
  }

  const confirmar = async () => {
    setBusy(true)
    await supabase.rpc('confirmar_cierre', { p_fecha: fecha })
    await cargar()
    setBusy(false)
  }

  const cambiarConfig = async (valor) => {
    await supabase.from('configuracion').update({ requiere_confirmacion_cierre: valor }).eq('id', 1)
    setConfig((c) => ({ ...c, requiere_confirmacion_cierre: valor }))
  }

  if (loading && !config) return <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Cargando…</p>

  const estadoLabel = {
    pendiente: { text: 'Pendiente de confirmar', bg: 'var(--color-danger-soft)', fg: 'var(--color-danger)' },
    auto_confirmado: { text: 'Cerrado automáticamente', bg: 'var(--color-success-soft)', fg: 'var(--color-success)' },
    confirmado: { text: 'Confirmado', bg: 'var(--color-success-soft)', fg: 'var(--color-success)' },
  }

  return (
    <div className="max-w-2xl">
      <h2 className="font-display text-2xl mb-1">Cierre de caja</h2>
      <p className="text-sm mb-6" style={{ color: 'var(--color-text-muted)' }}>
        El cierre se recalcula solo con cada servicio registrado. Puedes exigir confirmación manual si lo prefieres.
      </p>

      <div className="card p-4 mb-6 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Requerir confirmación manual del cierre</p>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Si está activo, el cierre del día queda "pendiente" hasta que un admin lo confirme.
          </p>
        </div>
        <button
          role="switch"
          aria-checked={config?.requiere_confirmacion_cierre}
          onClick={() => cambiarConfig(!config?.requiere_confirmacion_cierre)}
          className="w-12 h-7 rounded-full relative shrink-0 transition-colors"
          style={{ background: config?.requiere_confirmacion_cierre ? 'var(--color-primary)' : 'var(--color-border)' }}
        >
          <span
            className="absolute top-1 w-5 h-5 rounded-full bg-white transition-transform"
            style={{ transform: config?.requiere_confirmacion_cierre ? 'translateX(22px)' : 'translateX(4px)' }}
          />
        </button>
      </div>

      <div className="card p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="rounded-lg border px-3 py-1.5 text-sm"
            style={{ borderColor: 'var(--color-border)' }}
          />
          {cierre && (
            <span
              className="text-xs font-medium rounded-full px-3 py-1"
              style={{ background: estadoLabel[cierre.estado].bg, color: estadoLabel[cierre.estado].fg }}
            >
              {estadoLabel[cierre.estado].text}
            </span>
          )}
        </div>

        <p className="font-display text-lg mb-4 capitalize">{longDate(fecha)}</p>

        {!cierre ? (
          <div className="text-center py-6">
            <p className="text-sm mb-4" style={{ color: 'var(--color-text-muted)' }}>
              Aún no hay cierre generado para este día.
            </p>
            <button
              onClick={generar}
              disabled={busy}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              style={{ background: 'var(--color-primary)' }}
            >
              {busy ? 'Generando…' : 'Generar cierre de este día'}
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div>
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Ingresos</p>
                <p className="font-mono-num text-lg font-semibold">{currency(cierre.total_ingresos)}</p>
              </div>
              <div>
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Pagado a manicuristas</p>
                <p className="font-mono-num text-lg font-semibold">{currency(cierre.total_pagado_manicuristas)}</p>
              </div>
              <div>
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Neto spa</p>
                <p className="font-mono-num text-lg font-semibold" style={{ color: 'var(--color-success)' }}>
                  {currency(cierre.total_neto_spa)}
                </p>
              </div>
            </div>
            <p className="text-xs mb-4" style={{ color: 'var(--color-text-muted)' }}>
              {cierre.cantidad_servicios} servicios registrados ese día.
            </p>
            <div className="flex gap-2">
              <button
                onClick={generar}
                disabled={busy}
                className="rounded-lg px-4 py-2 text-sm font-medium border disabled:opacity-60"
                style={{ borderColor: 'var(--color-border)' }}
              >
                Recalcular
              </button>
              {cierre.estado === 'pendiente' && (
                <button
                  onClick={confirmar}
                  disabled={busy}
                  className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  style={{ background: 'var(--color-primary)' }}
                >
                  Confirmar cierre
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <div className="card divide-y" style={{ borderColor: 'var(--color-border)' }}>
        <p className="px-4 py-3 text-sm font-semibold">Últimos cierres</p>
        {historial.map((h) => (
          <button
            key={h.id}
            onClick={() => setFecha(h.fecha)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-left hover:bg-black/5"
          >
            <span>{shortDate(h.fecha)}</span>
            <span className="font-mono-num">{currency(h.total_neto_spa)}</span>
            <span
              className="text-xs font-medium rounded-full px-2 py-0.5"
              style={{ background: estadoLabel[h.estado].bg, color: estadoLabel[h.estado].fg }}
            >
              {estadoLabel[h.estado].text}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
