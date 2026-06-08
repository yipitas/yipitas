import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { BarChart3, TrendingUp, ShoppingBag, Calendar, AlertTriangle } from 'lucide-react'

const PERIODOS = [
  { label: 'Hoy', value: 'hoy' },
  { label: 'Esta semana', value: 'semana' },
  { label: 'Este mes', value: 'mes' },
  { label: 'Todo', value: 'todo' },
]

function getDesde(periodo) {
  const d = new Date()
  if (periodo === 'hoy') { d.setHours(0, 0, 0, 0); return d }
  if (periodo === 'semana') { d.setDate(d.getDate() - d.getDay()); d.setHours(0, 0, 0, 0); return d }
  if (periodo === 'mes') { d.setDate(1); d.setHours(0, 0, 0, 0); return d }
  return null
}

export default function Reportes() {
  const [periodo, setPeriodo] = useState('mes')
  const [ventas, setVentas] = useState([])
  const [stockBajo, setStockBajo] = useState([])
  const [masVendidos, setMasVendidos] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadData() }, [periodo])

  async function loadData() {
    setLoading(true)
    const desde = getDesde(periodo)

    let query = supabase
      .from('ventas')
      .select('id, total, metodo_pago, created_at, clientes(nombre), venta_items(cantidad, precio_unitario, productos(nombre, talla, categoria))')
      .order('created_at', { ascending: false })

    if (desde) query = query.gte('created_at', desde.toISOString())

    const [ventasRes, stockRes] = await Promise.all([
      query,
      supabase.from('productos').select('id, nombre, talla, color, stock, categoria').lte('stock', 5).order('stock'),
    ])

    const ventasData = ventasRes.data || []
    setVentas(ventasData)

    // Calcular más vendidos
    const countMap = {}
    ventasData.forEach(v => {
      v.venta_items?.forEach(item => {
        const key = item.productos?.nombre + ' (' + item.productos?.talla + ')'
        countMap[key] = (countMap[key] || 0) + item.cantidad
      })
    })
    const sorted = Object.entries(countMap).sort((a, b) => b[1] - a[1]).slice(0, 5)
    setMasVendidos(sorted)

    setStockBajo(stockRes.data || [])
    setLoading(false)
  }

  const totalVentas = ventas.reduce((s, v) => s + v.total, 0)
  const fmt = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
  const fmtFecha = (d) => new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

  // Ventas por método de pago
  const porMetodo = ventas.reduce((acc, v) => {
    acc[v.metodo_pago] = (acc[v.metodo_pago] || 0) + v.total
    return acc
  }, {})

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900">Reportes</h2>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {PERIODOS.map(p => (
            <button
              key={p.value}
              onClick={() => setPeriodo(p.value)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                periodo === p.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center gap-2 mb-2">
                <ShoppingBag className="w-4 h-4 text-blue-500" />
                <span className="text-sm text-gray-500">Ventas</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{ventas.length}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-green-500" />
                <span className="text-sm text-gray-500">Total recaudado</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{fmt(totalVentas)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center gap-2 mb-2">
                <BarChart3 className="w-4 h-4 text-purple-500" />
                <span className="text-sm text-gray-500">Ticket promedio</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {ventas.length > 0 ? fmt(totalVentas / ventas.length) : fmt(0)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            {/* Por método de pago */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-900 mb-4">Por método de pago</h3>
              {Object.entries(porMetodo).length === 0 ? (
                <p className="text-sm text-gray-400">Sin datos</p>
              ) : (
                <div className="space-y-3">
                  {Object.entries(porMetodo).map(([metodo, monto]) => (
                    <div key={metodo}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-600 capitalize">{metodo}</span>
                        <span className="font-medium text-gray-900">{fmt(monto)}</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary-500 rounded-full"
                          style={{ width: `${(monto / totalVentas) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Más vendidos */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-900 mb-4">Más vendidos</h3>
              {masVendidos.length === 0 ? (
                <p className="text-sm text-gray-400">Sin datos</p>
              ) : (
                <div className="space-y-2">
                  {masVendidos.map(([nombre, qty], i) => (
                    <div key={nombre} className="flex items-center gap-3 text-sm">
                      <span className="w-5 h-5 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">{i + 1}</span>
                      <span className="flex-1 text-gray-700 truncate">{nombre}</span>
                      <span className="font-semibold text-gray-900">{qty} uds</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Stock bajo */}
          {stockBajo.length > 0 && (
            <div className="bg-white rounded-xl border border-red-200 p-5">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                <h3 className="font-semibold text-gray-900">Productos con stock bajo</h3>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                {stockBajo.map(p => (
                  <div key={p.id} className="flex items-center justify-between bg-red-50 rounded-lg px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{p.nombre}</p>
                      <p className="text-xs text-gray-500">{p.talla} {p.color && `· ${p.color}`}</p>
                    </div>
                    <span className={`ml-2 text-sm font-bold flex-shrink-0 ${p.stock === 0 ? 'text-red-600' : 'text-orange-500'}`}>
                      {p.stock === 0 ? 'AGOTADO' : `${p.stock} ud`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Historial de ventas */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">Historial de ventas</h3>
            </div>
            {ventas.length === 0 ? (
              <div className="px-5 py-10 text-center text-gray-400 text-sm">
                No hay ventas en este período
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {ventas.map(v => (
                  <div key={v.id} className="px-5 py-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {v.clientes?.nombre || 'Consumidor final'}
                        </p>
                        <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                          <Calendar className="w-3 h-3" />
                          {fmtFecha(v.created_at)}
                          <span className="capitalize ml-2 bg-gray-100 px-1.5 py-0.5 rounded text-gray-500">{v.metodo_pago}</span>
                        </p>
                      </div>
                      <span className="font-bold text-gray-900">{fmt(v.total)}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {v.venta_items?.map((item, i) => (
                        <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                          {item.productos?.nombre} ({item.productos?.talla}) x{item.cantidad}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
