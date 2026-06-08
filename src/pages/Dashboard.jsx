import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  ShoppingCart,
  TrendingUp,
  Package,
  AlertTriangle,
  ArrowRight,
  DollarSign,
} from 'lucide-react'

function StatCard({ icon: Icon, label, value, color, sub }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-500">{label}</span>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

export default function Dashboard() {
  const [stats, setStats] = useState({
    ventasHoy: 0,
    totalHoy: 0,
    stockBajo: 0,
    totalProductos: 0,
  })
  const [ventasRecientes, setVentasRecientes] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const hoy = new Date()
    hoy.setHours(0, 0, 0, 0)

    const [ventasRes, productosRes, recentesRes] = await Promise.all([
      supabase
        .from('ventas')
        .select('total')
        .gte('created_at', hoy.toISOString()),
      supabase
        .from('productos')
        .select('id, stock'),
      supabase
        .from('ventas')
        .select('id, total, created_at, clientes(nombre)')
        .order('created_at', { ascending: false })
        .limit(5),
    ])

    const ventas = ventasRes.data || []
    const productos = productosRes.data || []

    setStats({
      ventasHoy: ventas.length,
      totalHoy: ventas.reduce((s, v) => s + (v.total || 0), 0),
      stockBajo: productos.filter(p => p.stock <= 3).length,
      totalProductos: productos.length,
    })
    setVentasRecientes(recentesRes.data || [])
    setLoading(false)
  }

  const fmt = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
  const fmtFecha = (d) => new Date(d).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
    </div>
  )

  return (
    <div className="p-6 max-w-5xl">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900">Panel de control</h2>
        <p className="text-sm text-gray-500">
          {new Date().toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          icon={ShoppingCart}
          label="Ventas hoy"
          value={stats.ventasHoy}
          color="bg-blue-50 text-blue-600"
        />
        <StatCard
          icon={DollarSign}
          label="Total hoy"
          value={fmt(stats.totalHoy)}
          color="bg-green-50 text-green-600"
        />
        <StatCard
          icon={Package}
          label="Productos"
          value={stats.totalProductos}
          color="bg-purple-50 text-purple-600"
        />
        <StatCard
          icon={AlertTriangle}
          label="Stock bajo"
          value={stats.stockBajo}
          color={stats.stockBajo > 0 ? "bg-red-50 text-red-600" : "bg-gray-50 text-gray-400"}
          sub={stats.stockBajo > 0 ? "requieren atención" : "todo en orden"}
        />
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Link
          to="/pos"
          className="flex items-center justify-between bg-primary-600 hover:bg-primary-700 text-white rounded-xl p-5 transition-colors group"
        >
          <div>
            <p className="font-semibold text-lg">Nueva venta</p>
            <p className="text-primary-200 text-sm">Abrir punto de venta</p>
          </div>
          <ArrowRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
        </Link>
        <Link
          to="/productos"
          className="flex items-center justify-between bg-white hover:bg-gray-50 border border-gray-200 rounded-xl p-5 transition-colors group"
        >
          <div>
            <p className="font-semibold text-lg text-gray-900">Agregar producto</p>
            <p className="text-gray-400 text-sm">Gestionar inventario</p>
          </div>
          <ArrowRight className="w-6 h-6 text-gray-400 group-hover:translate-x-1 transition-transform" />
        </Link>
      </div>

      {/* Recent sales */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Últimas ventas</h3>
          <Link to="/reportes" className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1">
            Ver todas <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        {ventasRecientes.length === 0 ? (
          <div className="px-5 py-8 text-center text-gray-400 text-sm">
            Aún no hay ventas registradas
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {ventasRecientes.map(v => (
              <div key={v.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-800">
                    {v.clientes?.nombre || 'Consumidor final'}
                  </p>
                  <p className="text-xs text-gray-400">{fmtFecha(v.created_at)}</p>
                </div>
                <span className="text-sm font-semibold text-gray-900">{fmt(v.total)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
