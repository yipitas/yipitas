import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, supabaseAdmin } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useBarcodeScanner } from '../hooks/useBarcodeScanner'
import {
  Search, Plus, Minus, Trash2, ShoppingCart, User, X, Check, Printer, Barcode, Wallet,
} from 'lucide-react'

const hoyISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function POS() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [cajaAbierta, setCajaAbierta] = useState(null) // null=cargando, false=sin caja, obj=abierta
  const [productos, setProductos] = useState([])
  const [clientes, setClientes] = useState([])
  const [search, setSearch] = useState('')
  const [clienteSearch, setClienteSearch] = useState('')
  const [carrito, setCarrito] = useState([])
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null)
  const [metodoPago, setMetodoPago] = useState('efectivo')
  const [cuotas, setCuotas] = useState(1)
  const [interesPct, setInteresPct] = useState('')
  const [processing, setProcessing] = useState(false)
  const [ticketVenta, setTicketVenta] = useState(null)
  const [showClienteDropdown, setShowClienteDropdown] = useState(false)
  const [scanToast, setScanToast] = useState(null)       // { type, msg }
  const [variantesModal, setVariantesModal] = useState(null) // [productos]
  const [lastScan, setLastScan] = useState('')
  const searchRef = useRef(null)
  const scanInputRef = useRef(null)
  const toastTimer = useRef(null)

  useEffect(() => { verificarCaja() }, [])

  async function verificarCaja() {
    const { data } = await supabaseAdmin
      .from('cajas')
      .select('id, estado')
      .eq('fecha', hoyISO())
      .eq('estado', 'abierta')
      .maybeSingle()
    setCajaAbierta(data || false)
    if (data) { loadProductos(); loadClientes() }
  }

  useEffect(() => {
    if (scanInputRef.current) scanInputRef.current.focus()
  }, [])

  async function loadProductos() {
    const { data } = await supabase.from('productos').select('*').gt('stock', 0).order('nombre')
    setProductos(data || [])
  }

  async function loadClientes() {
    const { data } = await supabase.from('clientes').select('id, nombre, telefono').order('nombre')
    setClientes(data || [])
  }

  // ── Lógica de código de barras ────────────────────────────────
  const showToast = (type, msg) => {
    clearTimeout(toastTimer.current)
    setScanToast({ type, msg })
    toastTimer.current = setTimeout(() => setScanToast(null), 3000)
  }

  const procesarCodigoBarras = useCallback(async (code) => {
    setLastScan(code)
    // Buscar en productos cargados primero (más rápido)
    const matches = productos.filter(p => p.codigo === code)

    if (matches.length === 0) {
      // Consultar DB por si se agregó desde otro módulo
      const { data } = await supabase.from('productos').select('*').eq('codigo', code).gt('stock', 0)
      if (!data || data.length === 0) {
        showToast('error', `Código "${code}" no encontrado`)
        return
      }
      if (data.length === 1) {
        agregarAlCarrito(data[0])
        showToast('ok', `${data[0].nombre} (${data[0].talla}) agregado`)
      } else {
        setVariantesModal(data)
      }
    } else if (matches.length === 1) {
      agregarAlCarrito(matches[0])
      showToast('ok', `${matches[0].nombre} (${matches[0].talla}) agregado`)
    } else {
      // Mismo código → varias variantes → mostrar selector
      setVariantesModal(matches)
    }

  }, [productos])

  useBarcodeScanner(procesarCodigoBarras)

  // Input manual del scan bar (Enter en el campo)
  function handleScanInputKeyDown(e) {
    if (e.key === 'Enter') {
      const code = e.target.value.trim()
      if (code) {
        procesarCodigoBarras(code)
        e.target.value = ''
      }
    }
  }

  const productosFiltrados = productos.filter(p =>
    p.nombre.toLowerCase().includes(search.toLowerCase()) ||
    p.categoria?.toLowerCase().includes(search.toLowerCase()) ||
    p.color?.toLowerCase().includes(search.toLowerCase()) ||
    p.talla?.toLowerCase().includes(search.toLowerCase())
  )

  const clientesFiltrados = clientes.filter(c =>
    c.nombre.toLowerCase().includes(clienteSearch.toLowerCase()) ||
    c.telefono?.includes(clienteSearch)
  ).slice(0, 5)

  function agregarAlCarrito(producto) {
    setCarrito(prev => {
      const existe = prev.find(i => i.id === producto.id)
      if (existe) {
        if (existe.cantidad >= producto.stock) return prev
        return prev.map(i => i.id === producto.id ? { ...i, cantidad: i.cantidad + 1 } : i)
      }
      return [...prev, { ...producto, cantidad: 1 }]
    })
  }

  function seleccionarVariante(producto) {
    agregarAlCarrito(producto)
    showToast('ok', `${producto.nombre} (${producto.talla}) agregado`)
    setVariantesModal(null)
  }

  function cambiarCantidad(id, delta) {
    setCarrito(prev =>
      prev.map(i => i.id === id ? { ...i, cantidad: Math.max(1, Math.min(i.cantidad + delta, i.stock)) } : i)
    )
  }

  function quitarItem(id) {
    setCarrito(prev => prev.filter(i => i.id !== id))
  }

  const total = carrito.reduce((s, i) => s + i.precio * i.cantidad, 0)
  const tieneInteres = metodoPago === 'crédito' || metodoPago === 'mercadopago'
  const interesMonto = tieneInteres ? Math.round(total * (Number(interesPct) || 0) / 100) : 0
  const montoNeto = total - interesMonto

  async function confirmarVenta() {
    if (carrito.length === 0) return
    setProcessing(true)

    const { data: venta, error } = await supabase
      .from('ventas')
      .insert({
        cliente_id: clienteSeleccionado?.id || null,
        user_id: user.id,
        total,
        metodo_pago: metodoPago,
        cuotas: metodoPago === 'crédito' ? cuotas : 1,
        interes_porcentaje: tieneInteres ? Number(interesPct) || 0 : 0,
        interes_monto: interesMonto,
        monto_neto: montoNeto,
      })
      .select().single()

    if (error) { alert('Error al registrar la venta'); setProcessing(false); return }

    await supabase.from('venta_items').insert(
      carrito.map(i => ({ venta_id: venta.id, producto_id: i.id, cantidad: i.cantidad, precio_unitario: i.precio }))
    )
    for (const item of carrito) {
      await supabase.from('productos').update({ stock: item.stock - item.cantidad }).eq('id', item.id)
    }

    setTicketVenta({ ...venta, items: carrito, cliente: clienteSeleccionado })
    setCarrito([])
    setClienteSeleccionado(null)
    setClienteSearch('')
    setMetodoPago('efectivo')
    setCuotas(1)
    setInteresPct('')
    await loadProductos()
    setProcessing(false)
  }

  function nuevaVenta() {
    setTicketVenta(null)
    setSearch('')
    setTimeout(() => scanInputRef.current?.focus(), 100)
  }

  const fmt = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)

  // ── Sin caja abierta ─────────────────────────────────────────
  if (cajaAbierta === null) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (cajaAbierta === false) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center max-w-sm">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Wallet className="w-8 h-8 text-amber-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Caja sin abrir</h2>
          <p className="text-sm text-gray-500 mb-6">
            Para registrar ventas primero tenés que abrir la caja del día.
          </p>
          <button
            onClick={() => navigate('/caja')}
            className="w-full bg-primary-600 hover:bg-primary-700 text-white py-3 rounded-xl font-semibold text-sm transition-colors"
          >
            Ir a Caja diaria
          </button>
        </div>
      </div>
    )
  }

  // ── Ticket ────────────────────────────────────────────────────
  if (ticketVenta) {
    return (
      <div className="p-6 max-w-lg mx-auto">
        <div className="bg-white rounded-2xl border border-gray-200 p-6 text-center">
          <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-7 h-7 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-1">¡Venta registrada!</h2>
          <p className="text-gray-400 text-sm mb-6">Ticket #{ticketVenta.id?.slice(-6).toUpperCase()}</p>
          <div className="text-left border-t border-dashed border-gray-200 pt-4 mb-4">
            {ticketVenta.cliente && (
              <p className="text-sm text-gray-500 mb-3">Cliente: <span className="text-gray-900 font-medium">{ticketVenta.cliente.nombre}</span></p>
            )}
            <div className="space-y-2 mb-4">
              {ticketVenta.items.map(i => (
                <div key={i.id} className="flex justify-between text-sm">
                  <span className="text-gray-700">{i.nombre} ({i.talla}) x{i.cantidad}</span>
                  <span className="font-medium">{fmt(i.precio * i.cantidad)}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-dashed border-gray-200 pt-3 flex justify-between">
              <span className="font-bold text-gray-900">Total</span>
              <span className="font-bold text-xl text-primary-600">{fmt(ticketVenta.total)}</span>
            </div>
            <p className="text-xs text-gray-400 mt-2 capitalize">Pago: {ticketVenta.metodo_pago}</p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => window.print()} className="flex-1 flex items-center justify-center gap-2 border border-gray-300 text-gray-700 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
              <Printer className="w-4 h-4" />Imprimir
            </button>
            <button onClick={nuevaVenta} className="flex-1 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors">
              Nueva venta
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full relative">
      {/* Toast */}
      {scanToast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2 transition-all ${
          scanToast.type === 'ok'
            ? 'bg-green-600 text-white'
            : 'bg-red-500 text-white'
        }`}>
          {scanToast.type === 'ok' ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
          {scanToast.msg}
        </div>
      )}

      {/* ── Panel izquierdo: productos ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Barra de escaneo */}
        <div className="px-6 pt-5 pb-3">
          <h2 className="text-xl font-bold text-gray-900 mb-3">Punto de Venta</h2>
          <div className="flex items-center gap-2 bg-primary-50 border-2 border-primary-200 rounded-xl px-4 py-2.5 focus-within:border-primary-400 transition-colors">
            <Barcode className="w-5 h-5 text-primary-500 flex-shrink-0" />
            <input
              ref={scanInputRef}
              type="text"
              placeholder="Listo para escanear... (o escribí un código y presioná Enter)"
              onKeyDown={handleScanInputKeyDown}
              className="flex-1 bg-transparent text-sm text-primary-900 placeholder-primary-400 outline-none"
            />
          </div>
        </div>

        {/* Búsqueda manual */}
        <div className="px-6 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              ref={searchRef}
              type="text"
              placeholder="Buscar por nombre, talla, color..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>

        {/* Grid de productos */}
        <div className="overflow-y-auto flex-1 px-6 pb-6 grid grid-cols-2 lg:grid-cols-3 gap-3 content-start">
          {productosFiltrados.map(p => (
            <button
              key={p.id}
              onClick={() => agregarAlCarrito(p)}
              className="bg-white border border-gray-200 rounded-xl overflow-hidden text-left hover:border-primary-300 hover:shadow-sm transition-all group"
            >
              {p.foto_url ? (
                <img src={p.foto_url} alt={p.nombre} className="w-full h-28 object-cover" />
              ) : (
                <div className="w-full h-28 bg-gray-50 flex items-center justify-center text-gray-200">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              )}
              <div className="p-3">
                <div className="flex items-start justify-between mb-1">
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-medium">{p.talla}</span>
                  <span className="text-xs text-gray-400">Stock: {p.stock}</span>
                </div>
                <p className="font-medium text-gray-900 text-sm mb-1 line-clamp-2">{p.nombre}</p>
                {p.color && <p className="text-xs text-gray-400 mb-1">{p.color}</p>}
                <p className="text-primary-600 font-bold">{fmt(p.precio)}</p>
                <div className="mt-1.5 flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Plus className="w-3 h-3 text-primary-600" />
                  <span className="text-xs text-primary-600">Agregar</span>
                </div>
              </div>
            </button>
          ))}
          {productosFiltrados.length === 0 && (
            <div className="col-span-3 text-center text-gray-400 py-12 text-sm">No se encontraron productos</div>
          )}
        </div>
      </div>

      {/* ── Panel derecho: carrito ── */}
      <div className="w-80 border-l border-gray-200 bg-white flex flex-col">
        <div className="px-4 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2 mb-3">
            <ShoppingCart className="w-4 h-4 text-gray-500" />
            <span className="font-semibold text-gray-900 text-sm">Carrito ({carrito.length})</span>
          </div>
          {/* Cliente */}
          <div className="relative">
            <div className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2">
              <User className="w-4 h-4 text-gray-400 flex-shrink-0" />
              {clienteSeleccionado ? (
                <div className="flex items-center justify-between flex-1 min-w-0">
                  <span className="text-sm text-gray-900 truncate">{clienteSeleccionado.nombre}</span>
                  <button onClick={() => { setClienteSeleccionado(null); setClienteSearch('') }} className="text-gray-400 hover:text-gray-600 ml-1">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <input
                  type="text"
                  placeholder="Buscar cliente..."
                  value={clienteSearch}
                  onChange={e => { setClienteSearch(e.target.value); setShowClienteDropdown(true) }}
                  onFocus={() => setShowClienteDropdown(true)}
                  onBlur={() => setTimeout(() => setShowClienteDropdown(false), 150)}
                  className="flex-1 text-sm outline-none bg-transparent"
                />
              )}
            </div>
            {showClienteDropdown && clienteSearch && clientesFiltrados.length > 0 && !clienteSeleccionado && (
              <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg z-10 mt-1">
                {clientesFiltrados.map(c => (
                  <button key={c.id} onMouseDown={() => { setClienteSeleccionado(c); setClienteSearch(''); setShowClienteDropdown(false) }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg">
                    <p className="font-medium text-gray-900">{c.nombre}</p>
                    {c.telefono && <p className="text-xs text-gray-400">{c.telefono}</p>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {carrito.length === 0 ? (
            <div className="text-center text-gray-400 text-sm py-8">
              <ShoppingCart className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>El carrito está vacío</p>
              <p className="text-xs mt-1 text-primary-400">Escaneá o tocá un producto</p>
            </div>
          ) : carrito.map(item => (
            <div key={item.id} className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{item.nombre}</p>
                <p className="text-xs text-gray-400">{item.talla} {item.color && `· ${item.color}`}</p>
                <p className="text-xs text-primary-600 font-semibold mt-0.5">{fmt(item.precio)}</p>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => cambiarCantidad(item.id, -1)} className="w-6 h-6 bg-gray-100 hover:bg-gray-200 rounded flex items-center justify-center transition-colors">
                  <Minus className="w-3 h-3" />
                </button>
                <span className="w-6 text-center text-sm font-medium">{item.cantidad}</span>
                <button onClick={() => cambiarCantidad(item.id, 1)} disabled={item.cantidad >= item.stock} className="w-6 h-6 bg-gray-100 hover:bg-gray-200 rounded flex items-center justify-center transition-colors disabled:opacity-40">
                  <Plus className="w-3 h-3" />
                </button>
                <button onClick={() => quitarItem(item.id)} className="w-6 h-6 text-gray-300 hover:text-red-500 ml-1 flex items-center justify-center transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Checkout */}
        <div className="p-4 border-t border-gray-100 space-y-3">
          {/* Medios de pago */}
          <div>
            <p className="text-xs text-gray-500 mb-1.5">Medio de pago</p>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { id: 'efectivo', label: 'Efectivo' },
                { id: 'débito', label: 'Débito' },
                { id: 'crédito', label: 'Crédito' },
                { id: 'mercadopago', label: 'Mercado Pago' },
              ].map(m => (
                <button key={m.id} onClick={() => { setMetodoPago(m.id); setInteresPct(''); setCuotas(1) }}
                  className={`py-1.5 rounded-lg text-xs font-medium transition-colors ${metodoPago === m.id ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Cuotas e interés (crédito) */}
          {metodoPago === 'crédito' && (
            <div className="bg-orange-50 border border-orange-100 rounded-xl p-3 space-y-2">
              <div>
                <p className="text-xs text-orange-700 font-medium mb-1.5">Cuotas</p>
                <div className="flex gap-1 flex-wrap">
                  {[1, 3, 6, 12, 18, 24].map(c => (
                    <button key={c} onClick={() => setCuotas(c)}
                      className={`px-2 py-1 rounded text-xs font-semibold transition-colors ${cuotas === c ? 'bg-orange-500 text-white' : 'bg-white text-orange-700 border border-orange-200 hover:bg-orange-100'}`}>
                      {c === 1 ? 'Cont.' : `${c}c`}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-orange-700 font-medium whitespace-nowrap">Interés %</label>
                <input type="number" value={interesPct} onChange={e => setInteresPct(e.target.value)} min="0" max="100" step="0.1"
                  className="flex-1 border border-orange-200 rounded-lg px-2 py-1 text-xs text-center focus:outline-none focus:ring-1 focus:ring-orange-400 bg-white"
                  placeholder="0" />
              </div>
              {Number(interesPct) > 0 && (
                <div className="text-xs text-orange-600 space-y-0.5">
                  <div className="flex justify-between"><span>Bruto:</span><span className="font-semibold">{fmt(total)}</span></div>
                  <div className="flex justify-between"><span>Interés ({interesPct}%):</span><span className="font-semibold text-red-500">- {fmt(interesMonto)}</span></div>
                  <div className="flex justify-between border-t border-orange-200 pt-1 mt-1"><span className="font-bold">Neto local:</span><span className="font-bold">{fmt(montoNeto)}</span></div>
                </div>
              )}
            </div>
          )}

          {/* Comisión (Mercado Pago) */}
          {metodoPago === 'mercadopago' && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-2">
                <label className="text-xs text-blue-700 font-medium whitespace-nowrap">Comisión MP %</label>
                <input type="number" value={interesPct} onChange={e => setInteresPct(e.target.value)} min="0" max="100" step="0.01"
                  className="flex-1 border border-blue-200 rounded-lg px-2 py-1 text-xs text-center focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                  placeholder="0" />
              </div>
              {Number(interesPct) > 0 && (
                <div className="text-xs text-blue-600 space-y-0.5">
                  <div className="flex justify-between"><span>Bruto:</span><span className="font-semibold">{fmt(total)}</span></div>
                  <div className="flex justify-between"><span>Comisión ({interesPct}%):</span><span className="font-semibold text-red-500">- {fmt(interesMonto)}</span></div>
                  <div className="flex justify-between border-t border-blue-200 pt-1 mt-1"><span className="font-bold">Neto local:</span><span className="font-bold">{fmt(montoNeto)}</span></div>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-between items-center">
            <span className="text-gray-500 text-sm">Total</span>
            <span className="text-xl font-bold text-gray-900">{fmt(total)}</span>
          </div>
          <button onClick={confirmarVenta} disabled={carrito.length === 0 || processing} className="w-full bg-primary-600 hover:bg-primary-700 disabled:bg-gray-200 disabled:text-gray-400 text-white py-3 rounded-xl font-semibold text-sm transition-colors">
            {processing ? 'Procesando...' : 'Confirmar venta'}
          </button>
        </div>
      </div>

      {/* ── Modal selector de variantes ── */}
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
                      {' · '}Stock: {p.stock}
                    </p>
                  </div>
                  <span className="font-bold text-primary-600 ml-3">{fmt(p.precio)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
