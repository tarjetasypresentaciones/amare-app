import { useRef, useState } from 'react'
import * as XLSX from 'xlsx'

// Quita tildes y pasa a minúsculas, para hacer el "match" de encabezados
// tolerante a que alguien escriba "Teléfono" en vez de "telefono", etc.
const normalizar = (texto) =>
  (texto ?? '')
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

const parsearBooleano = (valor) => {
  const t = normalizar(valor)
  return ['si', 'sí', 'yes', 'true', '1', 'x'].includes(t)
}

const parsearNumero = (valor) => {
  if (valor === '' || valor === null || valor === undefined) return null
  const n = Number(String(valor).replace(',', '.').replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : null
}

/**
 * columnas: [{ key, etiqueta, requerido, tipo: 'texto' | 'numero' | 'booleano', ejemplo }]
 * onImportar: async (filasNormalizadas) => { ok: number, fallos: [{ fila, error }] }
 * onTerminado: () => void   (se llama al cerrar, para refrescar la lista del padre)
 */
export default function ImportarExcel({ titulo, nombreArchivo, columnas, onImportar, onTerminado }) {
  const [abierto, setAbierto] = useState(false)
  const [filas, setFilas] = useState(null) // null = aún no se ha subido nada
  const [importando, setImportando] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [errorArchivo, setErrorArchivo] = useState('')
  const inputRef = useRef(null)

  const cerrar = () => {
    setAbierto(false)
    setFilas(null)
    setResultado(null)
    setErrorArchivo('')
    if (inputRef.current) inputRef.current.value = ''
    onTerminado?.()
  }

  const descargarPlantilla = () => {
    const encabezados = columnas.map((c) => c.etiqueta)
    const filaEjemplo = columnas.map((c) => c.ejemplo ?? '')
    const hoja = XLSX.utils.aoa_to_sheet([encabezados, filaEjemplo])
    const libro = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(libro, hoja, 'Plantilla')
    XLSX.writeFile(libro, `${nombreArchivo}.xlsx`)
  }

  const procesarFila = (filaCruda) => {
    // Arma un mapa header-normalizado -> valor, para poder buscar cada
    // columna sin importar mayúsculas/tildes ni el orden de las columnas
    const mapa = {}
    Object.entries(filaCruda).forEach(([header, valor]) => {
      mapa[normalizar(header)] = valor
    })

    const salida = {}
    const errores = []

    for (const col of columnas) {
      const clave = normalizar(col.etiqueta)
      const claveAlt = normalizar(col.key)
      const crudo = mapa[clave] ?? mapa[claveAlt]

      if (col.tipo === 'numero') {
        const n = parsearNumero(crudo)
        if (n === null && col.requerido) errores.push(`${col.etiqueta} no es un número válido`)
        salida[col.key] = n
      } else if (col.tipo === 'booleano') {
        salida[col.key] = parsearBooleano(crudo)
      } else {
        const texto = (crudo ?? '').toString().trim()
        if (!texto && col.requerido) errores.push(`${col.etiqueta} es obligatorio`)
        salida[col.key] = texto
      }
    }

    return { valores: salida, errores }
  }

  const manejarArchivo = async (e) => {
    const archivo = e.target.files?.[0]
    if (!archivo) return
    setErrorArchivo('')
    setResultado(null)
    try {
      const buffer = await archivo.arrayBuffer()
      const libro = XLSX.read(buffer, { type: 'array' })
      const hoja = libro.Sheets[libro.SheetNames[0]]
      const filasCrudas = XLSX.utils.sheet_to_json(hoja, { defval: '' })

      if (filasCrudas.length === 0) {
        setErrorArchivo('El archivo no tiene filas de datos (solo encabezados, o está vacío).')
        return
      }

      const procesadas = filasCrudas.map((f) => procesarFila(f))
      setFilas(procesadas)
    } catch (err) {
      setErrorArchivo('No se pudo leer el archivo. ¿Es un .xlsx, .xls o .csv válido? — ' + err.message)
    }
  }

  const filasValidas = filas?.filter((f) => f.errores.length === 0) ?? []
  const filasInvalidas = filas?.filter((f) => f.errores.length > 0) ?? []

  const importar = async () => {
    setImportando(true)
    const res = await onImportar(filasValidas.map((f) => f.valores))
    setResultado(res)
    setImportando(false)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="text-sm font-medium rounded-full px-3 py-1.5"
        style={{ border: '1px solid var(--color-border)' }}
      >
        📥 Importar desde Excel
      </button>

      {abierto && (
        <div className="fixed inset-0 z-30 flex items-center justify-center p-4" style={{ background: 'rgba(45,34,48,0.4)' }}>
          <div className="card w-full max-w-lg p-5 space-y-4 max-h-[85vh] overflow-y-auto" style={{ background: 'var(--color-surface)' }}>
            <h3 className="font-display text-lg">{titulo}</h3>

            {!resultado && (
              <>
                <div className="text-sm space-y-2" style={{ color: 'var(--color-text-muted)' }}>
                  <p>
                    1. Descarga la plantilla, complétala en Excel manteniendo los encabezados,
                    y súbela aquí.
                  </p>
                  <button
                    type="button"
                    onClick={descargarPlantilla}
                    className="text-sm font-medium rounded-full px-3 py-1.5"
                    style={{ border: '1px solid var(--color-border)' }}
                  >
                    ⬇️ Descargar plantilla ({nombreArchivo}.xlsx)
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1">2. Sube tu archivo (.xlsx, .xls o .csv)</label>
                  <input
                    ref={inputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={manejarArchivo}
                    className="w-full text-sm"
                  />
                </div>

                {errorArchivo && <p className="text-sm" style={{ color: 'var(--color-danger)' }}>{errorArchivo}</p>}

                {filas && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">
                      {filasValidas.length} de {filas.length} filas listas para importar
                      {filasInvalidas.length > 0 && ` — ${filasInvalidas.length} con errores`}
                    </p>
                    <div className="max-h-56 overflow-y-auto rounded-lg border text-xs" style={{ borderColor: 'var(--color-border)' }}>
                      {filas.slice(0, 50).map((f, i) => (
                        <div
                          key={i}
                          className="px-3 py-1.5 border-b last:border-b-0 flex items-start gap-2"
                          style={{ borderColor: 'var(--color-border)' }}
                        >
                          <span>{f.errores.length === 0 ? '✅' : '❌'}</span>
                          <span className="min-w-0 flex-1">
                            {columnas.map((c) => f.valores[c.key]).filter((v) => v !== '' && v !== null).join(' · ') || '(fila vacía)'}
                            {f.errores.length > 0 && (
                              <span className="block" style={{ color: 'var(--color-danger)' }}>{f.errores.join(', ')}</span>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                    {filas.length > 50 && (
                      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        Mostrando las primeras 50 filas de {filas.length}.
                      </p>
                    )}
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={importar}
                    disabled={!filas || filasValidas.length === 0 || importando}
                    className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    style={{ background: 'var(--color-primary)' }}
                  >
                    {importando ? 'Importando…' : `Importar ${filasValidas.length} registro${filasValidas.length === 1 ? '' : 's'}`}
                  </button>
                  <button
                    type="button"
                    onClick={cerrar}
                    className="rounded-lg px-4 py-2 text-sm font-medium"
                    style={{ border: '1px solid var(--color-border)' }}
                  >
                    Cancelar
                  </button>
                </div>
              </>
            )}

            {resultado && (
              <div className="space-y-3">
                <p className="text-sm">
                  ✅ {resultado.ok} registro{resultado.ok === 1 ? '' : 's'} importado{resultado.ok === 1 ? '' : 's'} con éxito
                  {resultado.fallos.length > 0 && `, ${resultado.fallos.length} con error`}
                </p>
                {resultado.fallos.length > 0 && (
                  <div className="max-h-48 overflow-y-auto rounded-lg border text-xs" style={{ borderColor: 'var(--color-border)' }}>
                    {resultado.fallos.map((f, i) => (
                      <div key={i} className="px-3 py-1.5 border-b last:border-b-0" style={{ borderColor: 'var(--color-border)' }}>
                        <span style={{ color: 'var(--color-danger)' }}>
                          {columnas.map((c) => f.fila[c.key]).filter(Boolean).join(' · ')}: {f.error}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={cerrar}
                  className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
                  style={{ background: 'var(--color-primary)' }}
                >
                  Cerrar
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
