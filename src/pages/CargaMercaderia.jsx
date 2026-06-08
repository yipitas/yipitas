import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useBarcodeScanner } from '../hooks/useBarcodeScanner'
import {
  Barcode, Plus, Minus, Trash2, PackagePlus, Check, X, AlertTriangle,
} from 'lucide-react'

export default function CargaMercaderia() {
  const [items, setItems] = useState([])           // { producto, cantidad }
  const [scanToast, setScanToast] = useState(null)
  const [variantesModal, setVariantesModal] = useState(null)
  const [lastScan, setLastScan] = useState('')
  const [confirmando, setConfirmando] = useState(false)
  const [resultado, setResultado] = useState(null)
  const scanInputRef = useRef(null)
  const toastTimer = useRef(null)

  useEffect(() => {
    if (scanInputRef.current) scanInputRef.current.focus()
  }, [])

  const showToast = (type, msg) => {
    clearTimeout(toastTimer.current)
    setScanToast({ type, msg })
    toastTimer.current = setTimeout(() => setScanToast(null), 3000)
  }

  const agregarProducto = useCallback((producto) => {
    setItems(prev => {
      const existe = prev.find(i => i.producto.id === producto.id)
      if (existe) {
        showToast('ok', `+1 a ${producto.nombre} (${producto.talla})`)
        return prev.map(i =>
          i.producto.id === producto.id ? { ...i, cantidad: i.cantidad + 1 } : i
        )
      }
      showToast('ok', `${producto.nombre} (${producto.talla}) agregado`)
      return [...prev, { producto, cantidad: 1 }]
    })
  }, [])

  const procesarCodigo = useCallback(async (code) => {
    setLastScan(code)
    const { data } = await supabase.from('productos').select('*').eq('codigo', code)

    if (!data || data.length === 0) {
      showToast('error', `Código "${code}" no encontrado`)
      return
    }
    if (data.length === 1) {
      agregarProducto(data[0])
    } else {
      setVariantesModal(data)
    }
  }, [agregarProducto])

  useBarcodeScanner(procesarCodigo)

  function handleScanInputKeyDown(e) {
    if (e.key === 'Enter') {
      const code = e.target.value.trim()
      if (code) { procesarCodigo(code); e.target.value = '' }
    }
  }

  function seleccionarVariante(producto) {
    agregarProducto(producto)
    setVariantesModal(null)
  }

  function cambiarCantidad(id, delta) {
    setItems(prev =>
      prev.map(i => i.producto.id === id
        ? { ...i, cantidad: Math.max(1, i.cantidad + delta) }
        : i
      )
    )
  }

  function setCantidadDirecta(id, val) {
    const n = parseInt(val)
    if (isNaN(n) || n < 1) return
    setItems(prev => prev.map(i => i.producto.id === id ? { ...i, cantidad: n } : i))
  }

  function quitarItem(id) {
    setItems(prev => prev.filter(i => i.producto.id !== id))
  }

  async function confirmarCarga() {
    if (items.length === 0) return
    setConfirmando(true)
    let ok = 0
    for (const { producto, cantidad } of items) {
      const nuevoStock = (producto.stock || 0) + cantidad
      const { error } = await supabase
        .from('productos')
        .update({ stock: nuevoStock })
        .eq('id', producto.id)
      if (!error) ok++
    }
    setResultado({ total: items.length, ok })
    setItems([])
    setConfirmando(false)
  }

  function nuevaCarga() {
    setResultado(null)
    setTimeout(() => scanInputRef.current?.focus(), 100)
  }

  const totalUnidades = items.reduce((s, i) => s + i.cantidad, 0)
  const fmt = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)

  // ── Pantalla de resultado ─────────────────────────────────────
  if (resultado) {
    return (
      <div className="p-6 max-w-lg mx-auto">
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">¡Mercadería cargada!</h2>
          <p className="text-gray-500 text-sm mb-6">
            Se actualizó el stock de <strong>{resultado.ok}</strong> producto{resultado.ok !== 1 ? 's' : ''}.
          </p>
          <button
            onClick={nuevaCarga}
            className="w-full bg-primary-600 hover:bg-primary-700 text-white py-3 rounded-xl font-semibold text-sm transition-colors"
          >
            Nueva carga
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl relative">
      {/* Toast */}
      {scanToast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2 ${
          scanToast.type === 'ok' ? 'bg-green-600 text-white' : 'bg-red-500 text-white'
        }`}>
          {scanToast.type === 'ok' ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
          {scanToast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Carga de Mercadería</h2>
          <p className="text-sm text-gray-500">Escaneá los productos para actualizar el stock</p>
        </div>
        {items.length > 0 && (
          <button
            onClick={confirmarCarga}
            disabled={confirmando}
            className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 disabled:bg-primary-300 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors"
          >
            <PackagePlus className="w-4 h-4" />
            {confirmando ? 'Actualizando...' : `Confirmar ingreso (${totalUnidades} uds)`}
          </button>
        )}
      </div>

      {/* Barra de escaneo */}
      <div className="flex items-center gap-2 bg-primary-50 border-2 border-primary-200 rounded-xl px-4 py-3 focus-within:border-primary-400 transition-colors mb-6">
        <Barcode className="w-5 h-5 text-primary-500 flex-shrink-0" />
        <input
          ref={scanInputRef}
          type="text"
          placeholder="Listo para escanear... (o escribí un código y presioná Enter)"
          onKeyDown={handleScanInputKeyDown}
          className="flex-1 bg-transparent text-sm text-primary-900 placeholder-primary-400 outline-none"
        />
      </div>

      {/* Lista de items */}
      {items.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 p-12 text-center text-gray-400">
          <Barcode className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm font-medium">Aún no hay productos</p>
          <p className="text-xs mt-1">Comenzá a escanear los productos que ingresaron</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-600">{items.length} producto{items.length !== 1 ? 's' : ''} · {totalUnidades} unidades</span>
            <button onClick={() => setItems([])} className="text-xs text-red-500 hover:text-red-700 font-medium">Limpiar todo</button>
          </div>
          <div className="divide-y divide-gray-50">
            {items.map(({ producto: p, cantidad }) => (
              <div key={p.id} className="flex items-center gap-4 px-4 py-3">
                {p.foto_url && (
                  <img src={p.foto_url} alt={p.nombre} className="w-10 h-10 rounded-lg object-cover flex-shrink-0 border border-gray-100" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 text-sm truncate">{p.nombre}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Talla {p.talla}
                    {p.color && ` · ${p.color}`}
                    {p.codigo && ` · #${p.codigo}`}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-400">Stock actual:</span>
                    <span className="text-xs font-semibold text-gray-600">{p.stock}</span>
                    <span className="text-xs text-green-600">→ {p.stock + cantidad}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button onClick={() => cambiarCantidad(p.id, -1)} className="w-7 h-7 bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center justify-center transition-colors">
                    <Minus className="w-3 h-3" />
                  </button>
                  <input
                    type="number"
                    value={cantidad}
                    onChange={e => setCantidadDirecta(p.id, e.target.value)}
                    className="w-12 text-center border border-gray-200 rounded-lg py-1 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary-400"
                    min="1"
                  />
                  <button onClick={() => cambiarCantidad(p.id, 1)} className="w-7 h-7 bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center justify-center transition-colors">
                    <Plus className="w-3 h-3" />
                  </button>
                  <button onClick={() => quitarItem(p.id)} className="w-7 h-7 text-gray-300 hover:text-red-500 ml-1 flex items-center justify-center transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          {/* Footer con totales */}
          <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
            <span className="text-sm text-gray-500">Total a ingresar</span>
            <span className="text-sm font-bold text-gray-900">{totalUnidades} unidades</span>
          </div>
        </div>
      )}

      {/* Advertencia sin confirmación */}
      {items.length > 0 && (
        <div className="mt-4 flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>El stock no se actualiza hasta que presiones <strong>Confirmar ingreso</strong>.</span>
        </div>
      )}

      {/* Modal variantes */}
      {variantesModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h3 className="font-semibold text-gray-900">Seleccionar variante</h3>
                <p className="text-xs text-gray-400">Código: {lastScan}</p>
              </div>
              <button onClick={() => setVariantesModal(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-2">
              {variantesModal.map(p => (
                <button
                  key={p.id}
                  onClick={() => seleccionarVariante(p)}
                  className="w-full flex items-center justify-between px-4 py-3 border border-gray-200 rounded-xl hover:border-primary-300 hover:bg-primary-50 transition-all text-left"
                >
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{p.nombre}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Talla {p.talla}
                      {p.color && ` · ${p.color}`}
                      {' · '}Stock actual: {p.stock}
                    </p>
                  </div>
                  <span className="font-semibold text-gray-600 text-sm ml-3">{fmt(p.precio)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
