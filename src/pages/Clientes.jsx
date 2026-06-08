import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, Search, Edit2, Trash2, X, Phone, Mail, ShoppingBag } from 'lucide-react'

const emptyForm = { nombre: '', telefono: '', email: '' }

export default function Clientes() {
  const [clientes, setClientes] = useState([])
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [showHistorial, setShowHistorial] = useState(null)
  const [historial, setHistorial] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadClientes() }, [])

  async function loadClientes() {
    const { data } = await supabase.from('clientes').select('*').order('nombre')
    setClientes(data || [])
    setLoading(false)
  }

  async function loadHistorial(clienteId) {
    const { data } = await supabase
      .from('ventas')
      .select('id, total, created_at, venta_items(cantidad, precio_unitario, productos(nombre, talla))')
      .eq('cliente_id', clienteId)
      .order('created_at', { ascending: false })
    setHistorial(data || [])
  }

  const filtered = clientes.filter(c =>
    c.nombre.toLowerCase().includes(search.toLowerCase()) ||
    c.telefono?.includes(search) ||
    c.email?.toLowerCase().includes(search.toLowerCase())
  )

  function openNew() {
    setForm(emptyForm)
    setEditId(null)
    setShowModal(true)
  }

  function openEdit(c) {
    setForm({ nombre: c.nombre, telefono: c.telefono || '', email: c.email || '' })
    setEditId(c.id)
    setShowModal(true)
  }

  async function openHistorial(c) {
    setShowHistorial(c)
    await loadHistorial(c.id)
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    if (editId) {
      await supabase.from('clientes').update(form).eq('id', editId)
    } else {
      await supabase.from('clientes').insert(form)
    }
    await loadClientes()
    setShowModal(false)
    setSaving(false)
  }

  async function handleDelete(id) {
    if (!confirm('¿Eliminar este cliente?')) return
    await supabase.from('clientes').delete().eq('id', id)
    setClientes(prev => prev.filter(c => c.id !== id))
  }

  const fmt = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
  const fmtFecha = (d) => new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Clientes</h2>
          <p className="text-sm text-gray-500">{clientes.length} clientes registrados</p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nuevo cliente
        </button>
      </div>

      <div className="relative mb-5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar por nombre, teléfono o email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.length === 0 ? (
            <div className="col-span-3 text-center text-gray-400 py-10">No se encontraron clientes</div>
          ) : filtered.map(c => (
            <div key={c.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-primary-700 font-semibold">{c.nombre[0].toUpperCase()}</span>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openHistorial(c)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Historial">
                    <ShoppingBag className="w-4 h-4" />
                  </button>
                  <button onClick={() => openEdit(c)} className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(c.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <p className="font-semibold text-gray-900 mb-2">{c.nombre}</p>
              {c.telefono && (
                <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                  <Phone className="w-3.5 h-3.5" />{c.telefono}
                </div>
              )}
              {c.email && (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Mail className="w-3.5 h-3.5" />{c.email}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal nuevo/editar */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">{editId ? 'Editar cliente' : 'Nuevo cliente'}</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre completo</label>
                <input
                  type="text"
                  value={form.nombre}
                  onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  required
                  placeholder="Ej: María González"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
                <input
                  type="tel"
                  value={form.telefono}
                  onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Ej: 11 1234-5678"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="correo@ejemplo.com"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={saving} className="flex-1 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 disabled:bg-primary-300 text-white rounded-lg text-sm font-medium transition-colors">
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal historial */}
      {showHistorial && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h3 className="font-semibold text-gray-900">Historial de compras</h3>
                <p className="text-xs text-gray-400">{showHistorial.nombre}</p>
              </div>
              <button onClick={() => setShowHistorial(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-4">
              {historial.length === 0 ? (
                <p className="text-center text-gray-400 py-8 text-sm">Sin compras registradas</p>
              ) : historial.map(v => (
                <div key={v.id} className="border border-gray-100 rounded-xl p-4 mb-3">
                  <div className="flex justify-between mb-2">
                    <span className="text-xs text-gray-400">{fmtFecha(v.created_at)}</span>
                    <span className="font-semibold text-gray-900 text-sm">{fmt(v.total)}</span>
                  </div>
                  <div className="space-y-1">
                    {v.venta_items?.map((item, i) => (
                      <div key={i} className="flex justify-between text-sm text-gray-600">
                        <span>{item.productos?.nombre} ({item.productos?.talla}) x{item.cantidad}</span>
                        <span>{fmt(item.precio_unitario * item.cantidad)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
