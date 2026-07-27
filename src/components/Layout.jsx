import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Users,
  BarChart3,
  LogOut,
  Shirt,
  PackagePlus,
  Wallet,
  Menu,
  X,
} from 'lucide-react'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Inicio', end: true },
  { to: '/pos', icon: ShoppingCart, label: 'Venta' },
  { to: '/productos', icon: Package, label: 'Productos' },
  { to: '/carga', icon: PackagePlus, label: 'Carga mercadería' },
  { to: '/caja', icon: Wallet, label: 'Caja diaria' },
  { to: '/clientes', icon: Users, label: 'Clientes' },
  { to: '/reportes', icon: BarChart3, label: 'Reportes' },
]

function SidebarContent({ user, onSignOut, onNavigate }) {
  return (
    <>
      {/* Logo */}
      <div className="px-6 py-5 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-primary-600 rounded-lg flex items-center justify-center">
            <Shirt className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Yipitas</h1>
            <p className="text-xs text-gray-400">Ropa de Chicos</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-primary-50 text-primary-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`
            }
          >
            <Icon className="w-5 h-5 flex-shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* User */}
      <div className="p-3 border-t border-gray-100">
        <div className="flex items-center gap-3 px-3 py-2 mb-1">
          <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-primary-700 text-sm font-semibold">
              {user?.email?.[0]?.toUpperCase()}
            </span>
          </div>
          <span className="text-xs text-gray-500 truncate">{user?.email}</span>
        </div>
        <button
          onClick={onSignOut}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Cerrar sesión
        </button>
      </div>
    </>
  )
}

export default function Layout() {
  const { signOut, user } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar (escritorio) */}
      <aside className="hidden lg:flex w-64 bg-white border-r border-gray-200 flex-col flex-shrink-0">
        <SidebarContent user={user} onSignOut={handleSignOut} />
      </aside>

      {/* Drawer (celular) */}
      {menuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMenuOpen(false)} />
          <aside className="relative w-64 max-w-[80%] bg-white border-r border-gray-200 flex flex-col shadow-xl">
            <button
              onClick={() => setMenuOpen(false)}
              className="absolute top-4 right-3 text-gray-400 hover:text-gray-600 z-10"
              aria-label="Cerrar menú"
            >
              <X className="w-5 h-5" />
            </button>
            <SidebarContent user={user} onSignOut={handleSignOut} onNavigate={() => setMenuOpen(false)} />
          </aside>
        </div>
      )}

      {/* Columna principal */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Barra superior (celular) */}
        <header className="lg:hidden flex items-center gap-3 bg-white border-b border-gray-200 px-4 py-3 flex-shrink-0">
          <button
            onClick={() => setMenuOpen(true)}
            className="text-gray-600 -ml-1 p-1"
            aria-label="Abrir menú"
          >
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-primary-600 rounded-lg flex items-center justify-center">
              <Shirt className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-gray-900">Yipitas</span>
          </div>
        </header>

        {/* Main */}
        <main className="flex-1 overflow-auto min-h-0">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
