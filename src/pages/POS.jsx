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
  const [cajaAbierta, setCajaAbierta] = useState(null)
  const [productos, setProductos] = useState([])
  const [clientes, setClientes] = useState([])
  const [search, setSearch] = useState('')
  const [showSearchDrop, setShowSearchDrop] = useState(false)
  const [clienteSearch, setClienteSearch] = useState('')
  const [carrito, setCarrito] = useState([])
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null)
  const [metodoPago, setMetodoPago] = useState('efectivo')
  const [cuotas, setCuotas] = useState(1)
  const [interesPct, setInteresPct] = useState('')
  const [descuentoPct, setDescuentoPct] = useState('')
  const [processing, setProcessing] = useState(false)
  const [ticketVenta, setTicketVenta] = useState(null)
  const [showClienteDropdown, setShowClienteDropdown] = useState(false)
  const [scanToast, setScanToast] = useState(null)
  const [confirmModal, setConfirmModal] = useState(null) // { productos[], titulo }
  const [lastScan, setLastScan] = useState('')
  const searchRef = useRef(null)
  const scanInputRef = useRef(null)
  const toastTimer = useRef(null)

  useEffect(() => { verificarCaja() }, [])

  async function verificarCaja() {
    const { data } = await supabaseAdmin
      .from('cajas').select('id, estado')
      .eq('fecha', hoyISO()).eq('estado', 'abierta').maybeSingle()
    setCajaAbierta(data || false)
    if (data) { loadProductos(); loadClientes() }
  }

  useEffect(() => {
    if (scanInputRef.current) scanInputRef.current.focus()
  }, [])

  async function loadProductos() {
    const { data } = await supabase.from('productos').select('*').gte('stock', 0).order('nombre')
    setProductos(data || [])
  }

  async function loadClientes() {
    const { data } = await supabase.from('clientes').select('id, nombre, telefono').order('nombre')
    setClientes(data || [])
  }

  const showToast = (type, msg) => {
    clearTimeout(toastTimer.current)
    setScanToast({ type, msg })
    toastTimer.current = setTimeout(() => setScanToast(null), 3000)
  }

  // ── Código de barras: siempre muestra modal de confirmación ───
  const procesarCodigoBarras = useCallback(async (code) => {
    setLastScan(code)
    let matches = productos.filter(p => p.codigo === code)

    if (matches.length === 0) {
      const { data } = await supabase.from('productos').select('*').eq('codigo', code).gte('stock', 0)
      if (!data || data.length === 0) {
        showToast('error', `Código "${code}" no encontrado`)
        return
      }
      matches = data
    }

    if (matches.length === 1) {
      const p = matches[0]
      if (p.stock <= 0) { showToast('error', `${p.nombre} sin stock`); return }
      agregarAlCarrito(p)
      showToast('ok', `${p.nombre} (${p.talla}) agregado`)
    } else {
      setConfirmModal({ productos: matches, titulo: 'Seleccionar variante' })
    }
  }, [productos])

  useBarcodeScanner(procesarCodigoBarras)

  function handleScanInputKeyDown(e) {
    if (e.key === 'Enter') {
      const code = e.target.value.trim()
      if (code) { procesarCodigoBarras(code); e.target.value = '' }
    }
  }

  // ── Búsqueda por nombre: dropdown ─────────────────────────────
  const resultadosBusqueda = search.length >= 1
    ? productos.filter(p =>
        p.nombre.toLowerCase().includes(search.toLowerCase()) ||
        p.categoria?.toLowerCase().includes(search.toLowerCase()) ||
        p.color?.toLowerCase().includes(search.toLowerCase()) ||
        p.talla?.toString().toLowerCase().includes(search.toLowerCase())
      ).slice(0, 30)
    : []

  const clientesFiltrados = clientes.filter(c =>
    c.nombre.toLowerCase().includes(clienteSearch.toLowerCase()) ||
    c.telefono?.includes(clienteSearch)
  ).slice(0, 5)

  function agregarAlCarrito(producto) {
    if (producto.stock <= 0) return
    setCarrito(prev => {
      const existe = prev.find(i => i.id === producto.id)
      if (existe) {
        if (existe.cantidad >= producto.stock) return prev
        return prev.map(i => i.id === producto.id ? { ...i, cantidad: i.cantidad + 1 } : i)
      }
      return [...prev, { ...producto, cantidad: 1 }]
    })
  }

  function seleccionarDesdeModal(producto) {
    if (producto.stock <= 0) { showToast('error', `${producto.nombre} sin stock`); return }
    agregarAlCarrito(producto)
    showToast('ok', `${producto.nombre} (${producto.talla}) agregado`)
    setConfirmModal(null)
  }

  function seleccionarDesdeBusqueda(producto) {
    agregarAlCarrito(producto)
    showToast('ok', `${producto.nombre} (${producto.talla}) agregado`)
    setSearch('')
    setShowSearchDrop(false)
  }

  function cambiarCantidad(id, delta) {
    setCarrito(prev =>
      prev.map(i => i.id === id ? { ...i, cantidad: Math.max(1, Math.min(i.cantidad + delta, i.stock)) } : i)
    )
  }

  function quitarItem(id) {
    setCarrito(prev => prev.filter(i => i.id !== id))
  }

  const totalBase = carrito.reduce((s, i) => s + i.precio * i.cantidad, 0)
  const descuentoMonto = Math.round(totalBase * (Number(descuentoPct) || 0) / 100)
  const totalConDescuento = totalBase - descuentoMonto
  const tieneInteres = metodoPago === 'crédito' || metodoPago === 'mercadopago'
  const interesMonto = tieneInteres ? Math.round(totalConDescuento * (Number(interesPct) || 0) / 100) : 0
  const total = totalConDescuento + interesMonto

  async function confirmarVenta() {
    if (carrito.length === 0) return
    setProcessing(true)
    const { data: venta, error } = await supabase.from('ventas').insert({
      cliente_id: clienteSeleccionado?.id || null,
      user_id: user.id,
      total,
      metodo_pago: metodoPago,
      cuotas: metodoPago === 'crédito' ? cuotas : 1,
      interes_porcentaje: tieneInteres ? Number(interesPct) || 0 : 0,
      interes_monto: interesMonto,
      monto_neto: totalConDescuento,
    }).select().single()

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
    setDescuentoPct('')
    await loadProductos()
    setProcessing(false)
  }

  function nuevaVenta() {
    setTicketVenta(null)
    setSearch('')
    setDescuentoPct('')
    setTimeout(() => scanInputRef.current?.focus(), 100)
  }

  const fmt = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)

  // ── Sin caja ──────────────────────────────────────────────────
  if (cajaAbierta === null) return (
    <div className="flex items-center justify-center h-full">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
    </div>
  )

  if (cajaAbierta === false) return (
    <div className="flex items-center justify-center h-full">
      <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center max-w-sm">
        <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Wallet className="w-8 h-8 text-amber-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Caja sin abrir</h2>
        <p className="text-sm text-gray-500 mb-6">Para registrar ventas primero tenés que abrir la caja del día.</p>
        <button onClick={() => navigate('/caja')} className="w-full bg-primary-600 hover:bg-primary-700 text-white py-3 rounded-xl font-semibold text-sm transition-colors">
          Ir a Caja diaria
        </button>
      </div>
    </div>
  )

  // ── Ticket ────────────────────────────────────────────────────
  if (ticketVenta) return (
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

  return (
    <div className="flex flex-col h-full relative">
      {/* Toast */}
      {scanToast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2 transition-all ${
          scanToast.type === 'ok' ? 'bg-green-600 text-white' : 'bg-red-500 text-white'
        }`}>
          {scanToast.type === 'ok' ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
          {scanToast.msg}
        </div>
      )}

      {/* ── Panel superior 30%: escaneo + búsqueda + productos ── */}
      <div className="h-[30%] flex flex-col overflow-hidden border-b border-gray-200">
        <div className="px-4 pt-3 pb-2 flex items-center gap-3 flex-shrink-0">
          <h2 className="text-base font-bold text-gray-900 flex-shrink-0">Punto de Venta</h2>

          {/* Barra de escaneo */}
          <div className="flex items-center gap-2 bg-primary-50 border-2 border-primary-200 rounded-xl px-3 py-2 focus-within:border-primary-400 transition-colors flex-1">
            <Barcode className="w-4 h-4 text-primary-500 flex-shrink-0" />
            <input
              ref={scanInputRef}
              type="text"
              placeholder="Escanear código de barras..."
              onKeyDown={handleScanInputKeyDown}
              className="flex-1 bg-transparent text-sm text-primary-900 placeholder-primary-400 outline-none"
            />
          </div>

          {/* Búsqueda por nombre con dropdown */}
          <div className="relative w-64 flex-shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 z-10" />
            <input
              ref={searchRef}
              type="text"
              placeholder="Buscar por nombre, talla, color..."
              value={search}
              onChange={e => { setSearch(e.target.value); setShowSearchDrop(true) }}
              onFocus={() => setShowSearchDrop(true)}
              onBlur={() => setTimeout(() => setShowSearchDrop(false), 150)}
              className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            {showSearchDrop && search.length >= 1 && (
              <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-xl z-40 mt-1 max-h-64 overflow-y-auto">
                {resultadosBusqueda.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">Sin resultados para "{search}"</p>
                ) : (
                  <>
                    <div className="px-3 py-2 border-b border-gray-100 bg-gray-50 rounded-t-xl">
                      <p className="text-xs text-gray-500 font-medium">{resultadosBusqueda.length} resultado{resultadosBusqueda.length !== 1 ? 's' : ''} — click para agregar</p>
                    </div>
                    {resultadosBusqueda.map(p => {
                      const sinStock = p.stock <= 0
                      return (
                        <button
                          key={p.id}
                          onMouseDown={() => !sinStock && seleccionarDesdeBusqueda(p)}
                          className={`w-full flex items-center justify-between px-4 py-3 border-b border-gray-50 last:border-0 text-left transition-colors ${
                            sinStock ? 'opacity-40 cursor-not-allowed' : 'hover:bg-primary-50'
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{p.nombre}</p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              Talla {p.talla}{p.color && ` · ${p.color}`}{' · '}Stock: {p.stock}
                              {sinStock && <span className="text-red-400 font-medium"> · Sin stock</span>}
                            </p>
                          </div>
                          <div className="ml-3 text-right flex-shrink-0">
                            <p className="text-sm font-bold text-primary-600">{fmt(p.precio)}</p>
                            {!sinStock && <p className="text-xs text-primary-400">+ agregar</p>}
                          </div>
                        </button>
                      )
                    })}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Grid de productos */}
        <div className="overflow-y-auto flex-1 px-4 pb-2 grid grid-cols-5 xl:grid-cols-7 gap-2 content-start">
          {(search.length === 0 ? productos : resultadosBusqueda).map(p => {
            const sinStock = p.stock <= 0
            return (
              <button
                key={p.id}
                onClick={() => !sinStock && agregarAlCarrito(p)}
                disabled={sinStock}
                className={`border rounded-lg overflow-hidden text-left transition-all group relative ${
                  sinStock ? 'bg-gray-50 border-gray-200 opacity-60 cursor-not-allowed' : 'bg-white border-gray-200 hover:border-primary-300 hover:shadow-sm'
                }`}
              >
                {sinStock && (
                  <div className="absolute top-1 right-1 z-10 bg-gray-500 text-white text-xs font-semibold px-1 py-0.5 rounded text-[10px]">Sin stock</div>
                )}
                {p.foto_url ? (
                  <img src={p.foto_url} alt={p.nombre} className="w-full h-16 object-cover" />
                ) : (
                  <div className="w-full h-16 bg-gray-50 flex items-center justify-center text-gray-200">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                )}
                <div className="p-1.5">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[10px] bg-gray-100 text-gray-600 px-1 rounded font-medium">{p.talla}</span>
                    <span className="text-[10px] text-gray-400">{p.stock}</span>
                  </div>
                  <p className="font-medium text-gray-900 text-[11px] line-clamp-1">{p.nombre}</p>
                  <p className={`text-xs font-bold ${sinStock ? 'text-gray-400' : 'text-primary-600'}`}>{fmt(p.precio)}</p>
                </div>
              </button>
            )
          })}
          {search.length === 0 && productos.length === 0 && (
            <div className="col-span-5 text-center text-gray-400 py-8 text-sm">No hay productos cargados</div>
          )}
        </div>
      </div>

      {/* ── Panel inferior 70%: carrito ── */}
      <div className="flex-1 flex overflow-hidden bg-white">

        {/* Items del carrito */}
        <div className="flex-1 flex flex-col border-r border-gray-200 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2 flex-shrink-0">
            <ShoppingCart className="w-4 h-4 text-gray-500" />
            <span className="font-semibold text-gray-900 text-sm">Carrito ({carrito.length})</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {carrito.length === 0 ? (
              <div className="text-center text-gray-400 text-sm py-10">
                <ShoppingCart className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p>El carrito está vacío</p>
                <p className="text-xs mt-1 text-primary-400">Escaneá o buscá un producto arriba</p>
              </div>
            ) : carrito.map(item => (
              <div key={item.id} className="flex items-center gap-3 py-2.5 border-b border-gray-100 last:border-0">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{item.nombre}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{item.talla}{item.color && ` · ${item.color}`}</p>
                  <p className="text-base font-bold text-primary-600 mt-0.5">{fmt(item.precio)}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => cambiarCantidad(item.id, -1)} className="w-7 h-7 bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center justify-center transition-colors">
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="w-8 text-center text-sm font-bold">{item.cantidad}</span>
                  <button onClick={() => cambiarCantidad(item.id, 1)} disabled={item.cantidad >= item.stock} className="w-7 h-7 bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center justify-center transition-colors disabled:opacity-40">
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => quitarItem(item.id)} className="w-7 h-7 text-gray-300 hover:text-red-500 flex items-center justify-center transition-colors ml-1">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="text-right flex-shrink-0 w-24">
                  <p className="text-base font-bold text-gray-900">{fmt(item.precio * item.cantidad)}</p>
                  {item.cantidad > 1 && <p className="text-xs text-gray-400">x{item.cantidad}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Panel de checkout */}
        <div className="w-1/2 flex flex-col border-l border-gray-100 flex-shrink-0">
          {/* Cliente */}
          <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0">
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

          {/* Métodos de pago + descuento */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
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
                    className="flex-1 border border-orange-200 rounded-lg px-2 py-1 text-xs text-center focus:outline-none focus:ring-1 focus:ring-orange-400 bg-white" placeholder="0" />
                </div>
                {Number(interesPct) > 0 && (
                  <div className="text-xs text-orange-600 space-y-0.5">
                    <div className="flex justify-between"><span>Base:</span><span className="font-semibold">{fmt(totalBase)}</span></div>
                    <div className="flex justify-between"><span>+ Interés ({interesPct}%):</span><span className="font-semibold text-orange-700">+ {fmt(interesMonto)}</span></div>
                    <div className="flex justify-between border-t border-orange-200 pt-1 mt-1"><span className="font-bold">Total:</span><span className="font-bold text-orange-800">{fmt(total)}</span></div>
                  </div>
                )}
              </div>
            )}

            {metodoPago === 'mercadopago' && (
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <label className="text-xs text-blue-700 font-medium whitespace-nowrap">Comisión MP %</label>
                  <input type="number" value={interesPct} onChange={e => setInteresPct(e.target.value)} min="0" max="100" step="0.01"
                    className="flex-1 border border-blue-200 rounded-lg px-2 py-1 text-xs text-center focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white" placeholder="0" />
                </div>
                {Number(interesPct) > 0 && (
                  <div className="text-xs text-blue-600 space-y-0.5">
                    <div className="flex justify-between"><span>Base:</span><span className="font-semibold">{fmt(totalBase)}</span></div>
                    <div className="flex justify-between"><span>+ Recargo MP ({interesPct}%):</span><span className="font-semibold text-blue-700">+ {fmt(interesMonto)}</span></div>
                    <div className="flex justify-between border-t border-blue-200 pt-1 mt-1"><span className="font-bold">Total:</span><span className="font-bold text-blue-800">{fmt(total)}</span></div>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500 whitespace-nowrap">Descuento %</label>
              <input type="number" value={descuentoPct} onChange={e => setDescuentoPct(e.target.value)} min="0" max="100" step="1"
                className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-center focus:outline-none focus:ring-1 focus:ring-primary-400" placeholder="0" />
            </div>
            {Number(descuentoPct) > 0 && (
              <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 space-y-0.5">
                <div className="flex justify-between"><span>Base:</span><span className="font-medium">{fmt(totalBase)}</span></div>
                <div className="flex justify-between text-green-600"><span>- Descuento ({descuentoPct}%):</span><span className="font-semibold">- {fmt(descuentoMonto)}</span></div>
                {tieneInteres && interesMonto > 0 && <div className="flex justify-between text-orange-600"><span>+ Recargo ({interesPct}%):</span><span className="font-semibold">+ {fmt(interesMonto)}</span></div>}
              </div>
            )}
          </div>

          {/* Total + botón */}
          <div className="p-4 border-t border-gray-100 space-y-3 flex-shrink-0">
            <div className="flex justify-between items-center">
              <span className="text-gray-500 text-sm font-medium">Total</span>
              <span className="text-2xl font-bold text-gray-900">{fmt(total)}</span>
            </div>
            <button onClick={confirmarVenta} disabled={carrito.length === 0 || processing}
              className="w-full bg-primary-600 hover:bg-primary-700 disabled:bg-gray-200 disabled:text-gray-400 text-white py-3 rounded-xl font-semibold text-sm transition-colors">
              {processing ? 'Procesando...' : 'Confirmar venta'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Modal confirmación / variantes ── */}
      {confirmModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h3 className="font-semibold text-gray-900">{confirmModal.titulo}</h3>
                {lastScan && <p className="text-xs text-gray-400">Código: {lastScan}</p>}
              </div>
              <button onClick={() => setConfirmModal(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-2">
              {confirmModal.productos.map(p => (
                <button
                  key={p.id}
                  onClick={() => seleccionarDesdeModal(p)}
                  disabled={p.stock <= 0}
                  className={`w-full flex items-center justify-between px-4 py-3 border rounded-xl transition-all text-left ${
                    p.stock <= 0
                      ? 'border-gray-100 opacity-50 cursor-not-allowed'
                      : 'border-gray-200 hover:border-primary-400 hover:bg-primary-50'
                  }`}
                >
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">{p.nombre}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Talla {p.talla}{p.color && ` · ${p.color}`}{' · '}Stock: {p.stock}
                      {p.stock <= 0 && <span className="text-red-400"> · Sin stock</span>}
                    </p>
                  </div>
                  <div className="text-right ml-3 flex-shrink-0">
                    <p className="font-bold text-primary-600">{fmt(p.precio)}</p>
                    {p.stock > 0 && <p className="text-xs text-primary-400 mt-0.5">Agregar →</p>}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
