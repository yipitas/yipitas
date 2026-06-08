import { useEffect, useState, useRef, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { useBarcodeScanner } from '../hooks/useBarcodeScanner'
import {
  Plus, Search, Edit2, Trash2, X, AlertTriangle,
  Upload, FileSpreadsheet, CheckCircle, Image, Barcode,
} from 'lucide-react'

const TALLAS = ['0-3m', '3-6m', '6-9m', '9-12m', '1', '2', '3', '4', '5', '6', '7', '8', '10', '12', '14', '16', 'Único']
const CATEGORIAS = ['Remera', 'Pantalón', 'Vestido', 'Camperón', 'Campera', 'Calza', 'Short', 'Enterito', 'Pijama', 'Ropa interior', 'Medias', 'Accesorios', 'Otro']

const emptyForm = { codigo: '', nombre: '', categoria: 'Remera', talla: '4', color: '', precio: '', stock: '', foto_url: '' }

export default function Productos() {
  const [productos, setProductos] = useState([])
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [filterCat, setFilterCat] = useState('Todos')
  const [uploadingImg, setUploadingImg] = useState(false)
  const [imgPreview, setImgPreview] = useState(null)
  const [highlightId, setHighlightId] = useState(null)
  const [scanBanner, setScanBanner] = useState(null) // { type: 'found'|'notfound', msg }
  const imgInputRef = useRef(null)
  const searchRef = useRef(null)
  const rowRefs = useRef({})

  // Excel import
  const [showImport, setShowImport] = useState(false)
  const [excelRows, setExcelRows] = useState([])
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const excelInputRef = useRef(null)

  useEffect(() => { loadProductos() }, [])

  async function loadProductos() {
    const { data } = await supabase.from('productos').select('*').order('nombre')
    setProductos(data || [])
    setLoading(false)
  }

  const filtered = productos.filter(p => {
    const matchSearch = p.nombre.toLowerCase().includes(search.toLowerCase()) ||
      p.color?.toLowerCase().includes(search.toLowerCase()) ||
      p.codigo?.toLowerCase().includes(search.toLowerCase())
    const matchCat = filterCat === 'Todos' || p.categoria === filterCat
    return matchSearch && matchCat
  })

  // ── Detección de código de barras ─────────────────────────────
  const handleBarcodeScan = useCallback(async (code) => {
    // Buscar por código exacto
    const { data } = await supabase
      .from('productos')
      .select('*')
      .eq('codigo', code)

    if (data && data.length > 0) {
      const found = data[0]
      setSearch('')
      setFilterCat('Todos')
      setHighlightId(found.id)
      setScanBanner({ type: 'found', msg: `Producto encontrado: ${found.nombre} (${found.talla})` })
      setTimeout(() => {
        rowRefs.current[found.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 100)
      setTimeout(() => { setHighlightId(null); setScanBanner(null) }, 3000)
    } else {
      setScanBanner({ type: 'notfound', msg: `Código "${code}" no existe. ¿Crear producto?`, code })
      setTimeout(() => setScanBanner(null), 5000)
    }
  }, [])

  useBarcodeScanner(handleBarcodeScan)

  // Enter en campo de búsqueda → buscar por código exacto
  function handleSearchKeyDown(e) {
    if (e.key !== 'Enter') return
    const code = search.trim()
    if (!code) return
    const exact = productos.find(p => p.codigo?.toLowerCase() === code.toLowerCase())
    if (exact) {
      setFilterCat('Todos')
      setHighlightId(exact.id)
      setScanBanner({ type: 'found', msg: `Producto encontrado: ${exact.nombre} (${exact.talla})` })
      setTimeout(() => {
        rowRefs.current[exact.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 100)
      setTimeout(() => { setHighlightId(null); setScanBanner(null) }, 3000)
    } else if (filtered.length === 0) {
      setScanBanner({ type: 'notfound', msg: `Código "${code}" no existe. ¿Crear producto?`, code })
      setTimeout(() => setScanBanner(null), 5000)
    }
  }

  function openNew() {
    setForm(emptyForm)
    setEditId(null)
    setImgPreview(null)
    setShowModal(true)
  }

  function openNewWithCode(code) {
    setForm({ ...emptyForm, codigo: code })
    setEditId(null)
    setImgPreview(null)
    setScanBanner(null)
    setShowModal(true)
  }

  function openEdit(p) {
    setForm({
      codigo: p.codigo || '',
      nombre: p.nombre,
      categoria: p.categoria,
      talla: p.talla,
      color: p.color || '',
      precio: p.precio,
      stock: p.stock,
      foto_url: p.foto_url || '',
    })
    setEditId(p.id)
    setImgPreview(p.foto_url || null)
    setShowModal(true)
  }

  // ── Imagen ────────────────────────────────────────────────────
  async function handleImageChange(e) {
    const file = e.target.files[0]
    if (!file) return
    setImgPreview(URL.createObjectURL(file))
    setUploadingImg(true)
    const ext = file.name.split('.').pop()
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const { error } = await supabase.storage.from('productos').upload(path, file, { upsert: true })
    if (error) { alert('Error al subir la imagen'); setUploadingImg(false); return }
    const { data: { publicUrl } } = supabase.storage.from('productos').getPublicUrl(path)
    setForm(f => ({ ...f, foto_url: publicUrl }))
    setUploadingImg(false)
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    const data = {
      codigo: form.codigo || null,
      nombre: form.nombre,
      categoria: form.categoria,
      talla: form.talla,
      color: form.color || null,
      precio: Number(form.precio),
      stock: Number(form.stock),
      foto_url: form.foto_url || null,
    }
    if (editId) {
      await supabase.from('productos').update(data).eq('id', editId)
    } else {
      await supabase.from('productos').insert(data)
    }
    await loadProductos()
    setShowModal(false)
    setSaving(false)
  }

  async function handleDelete(id) {
    if (!confirm('¿Eliminar este producto?')) return
    await supabase.from('productos').delete().eq('id', id)
    setProductos(prev => prev.filter(p => p.id !== id))
  }

  // ── Excel ─────────────────────────────────────────────────────
  function handleExcelFile(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const wb = XLSX.read(ev.target.result, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })
      const normalized = rows.map(r => {
        const keys = Object.keys(r)
        const find = (candidates) => {
          for (const c of candidates) {
            const k = keys.find(k => k.toLowerCase().replace(/\s/g, '') === c.toLowerCase())
            if (k !== undefined) return r[k]
          }
          return ''
        }
        return {
          codigo: String(find(['codigo', 'código', 'cod', 'code']) || '').trim(),
          nombre: String(find(['nombre', 'name', 'producto', 'descripcion']) || '').trim(),
          categoria: String(find(['categoria', 'categoría', 'category', 'rubro']) || 'Otro').trim() || 'Otro',
          talla: String(find(['talla', 'talle', 'size']) || 'Único').trim() || 'Único',
          color: String(find(['color', 'colour']) || '').trim(),
          precio: Number(find(['precio_venta', 'precioventa', 'precio', 'price', 'pvp']) || 0),
          stock: Number(find(['stock', 'cantidad', 'qty']) || 0),
        }
      }).filter(r => r.nombre)
      setExcelRows(normalized)
      setImportResult(null)
      setShowImport(true)
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  async function confirmarImport() {
    setImporting(true)
    let creados = 0, actualizados = 0
    for (const row of excelRows) {
      if (row.codigo) {
        const { data: existing } = await supabase.from('productos').select('id').eq('codigo', row.codigo).limit(1).maybeSingle()
        if (existing) {
          await supabase.from('productos').update(row).eq('id', existing.id)
          actualizados++
        } else {
          await supabase.from('productos').insert(row)
          creados++
        }
      } else {
        await supabase.from('productos').insert(row)
        creados++
      }
    }
    await loadProductos()
    setImportResult({ creados, actualizados })
    setImporting(false)
  }

  function cerrarImport() { setShowImport(false); setExcelRows([]); setImportResult(null) }

  const fmt = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Productos</h2>
          <p className="text-sm text-gray-500">{productos.length} productos en total</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => excelInputRef.current?.click()} className="flex items-center gap-2 border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors">
            <FileSpreadsheet className="w-4 h-4 text-green-600" />
            Importar Excel
          </button>
          <input ref={excelInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleExcelFile} />
          <button onClick={openNew} className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors">
            <Plus className="w-4 h-4" />
            Nuevo producto
          </button>
        </div>
      </div>

      {/* Banner de código de barras */}
      {scanBanner && (
        <div className={`flex items-center justify-between px-4 py-3 rounded-xl mb-4 text-sm font-medium ${
          scanBanner.type === 'found'
            ? 'bg-green-50 text-green-800 border border-green-200'
            : 'bg-yellow-50 text-yellow-800 border border-yellow-200'
        }`}>
          <div className="flex items-center gap-2">
            <Barcode className="w-4 h-4 flex-shrink-0" />
            {scanBanner.msg}
          </div>
          {scanBanner.type === 'notfound' && scanBanner.code && (
            <button
              onClick={() => openNewWithCode(scanBanner.code)}
              className="ml-4 bg-primary-600 hover:bg-primary-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap"
            >
              + Crear producto
            </button>
          )}
          <button onClick={() => setScanBanner(null)} className="ml-2 opacity-50 hover:opacity-100">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            ref={searchRef}
            type="text"
            placeholder="Buscar por nombre, código o color... (Enter para buscar código exacto)"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
          <option>Todos</option>
          {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-gray-500 font-medium w-16">Foto</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Producto</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Categoría</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Talla</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Color</th>
                <th className="text-right px-4 py-3 text-gray-500 font-medium">Precio</th>
                <th className="text-right px-4 py-3 text-gray-500 font-medium">Stock</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center text-gray-400 py-10">No se encontraron productos</td>
                </tr>
              ) : filtered.map(p => (
                <tr
                  key={p.id}
                  ref={el => rowRefs.current[p.id] = el}
                  className={`transition-colors ${
                    highlightId === p.id
                      ? 'bg-green-50 ring-2 ring-inset ring-green-300'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <td className="px-4 py-2">
                    {p.foto_url ? (
                      <img src={p.foto_url} alt={p.nombre} className="w-10 h-10 rounded-lg object-cover border border-gray-100" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                        <Image className="w-4 h-4 text-gray-300" />
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{p.nombre}</p>
                    {p.codigo && (
                      <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                        <Barcode className="w-3 h-3" />
                        {p.codigo}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{p.categoria}</td>
                  <td className="px-4 py-3">
                    <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-xs font-medium">{p.talla}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{p.color || '-'}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">{fmt(p.precio)}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                      p.stock <= 3 ? 'bg-red-100 text-red-700' : p.stock <= 8 ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'
                    }`}>
                      {p.stock <= 3 && <AlertTriangle className="w-3 h-3" />}
                      {p.stock}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => openEdit(p)} className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(p.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Modal producto ── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white">
              <h3 className="font-semibold text-gray-900">{editId ? 'Editar producto' : 'Nuevo producto'}</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              {/* Foto */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Foto</label>
                <div onClick={() => imgInputRef.current?.click()} className="border-2 border-dashed border-gray-200 rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer hover:border-primary-300 hover:bg-primary-50 transition-colors min-h-[120px]">
                  {imgPreview ? (
                    <img src={imgPreview} alt="preview" className="max-h-32 rounded-lg object-contain" />
                  ) : (
                    <>
                      <Upload className="w-8 h-8 text-gray-300 mb-2" />
                      <p className="text-sm text-gray-400">Clic para subir foto</p>
                      <p className="text-xs text-gray-300 mt-1">JPG, PNG, WEBP · máx 5MB</p>
                    </>
                  )}
                  {uploadingImg && <div className="mt-2 flex items-center gap-2 text-xs text-primary-600"><div className="animate-spin rounded-full h-3 w-3 border-b border-primary-600"></div>Subiendo...</div>}
                </div>
                <input ref={imgInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
                {imgPreview && <button type="button" onClick={() => { setImgPreview(null); setForm(f => ({ ...f, foto_url: '' })) }} className="mt-1 text-xs text-red-500 hover:text-red-700">Quitar foto</button>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Código de barras</label>
                <input type="text" value={form.codigo} onChange={e => setForm(f => ({ ...f, codigo: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" placeholder="Escanear o ingresar código..." />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                <input type="text" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" required placeholder="Ej: Remera manga corta" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Categoría</label>
                  <select value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                    {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Talla</label>
                  <select value={form.talla} onChange={e => setForm(f => ({ ...f, talla: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                    {TALLAS.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
                <input type="text" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" placeholder="Ej: Azul, Rojo..." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Precio ($)</label>
                  <input type="number" value={form.precio} onChange={e => setForm(f => ({ ...f, precio: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" required min="0" placeholder="0" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Stock</label>
                  <input type="number" value={form.stock} onChange={e => setForm(f => ({ ...f, stock: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" required min="0" placeholder="0" />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">Cancelar</button>
                <button type="submit" disabled={saving || uploadingImg} className="flex-1 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 disabled:bg-primary-300 text-white rounded-lg text-sm font-medium transition-colors">{saving ? 'Guardando...' : 'Guardar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal Excel ── */}
      {showImport && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl shadow-xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h3 className="font-semibold text-gray-900">Importar desde Excel</h3>
                <p className="text-xs text-gray-400">{excelRows.length} productos encontrados</p>
              </div>
              <button onClick={cerrarImport} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            {importResult && (
              <div className="mx-6 mt-4 bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                <p className="text-sm text-green-800">Importación completada: <strong>{importResult.creados} creados</strong> y <strong>{importResult.actualizados} actualizados</strong>.</p>
              </div>
            )}
            {!importResult && (
              <div className="overflow-auto flex-1 px-6 py-4">
                <p className="text-xs text-gray-500 mb-3">Revisá los datos antes de confirmar.</p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500 text-xs">
                      <th className="text-left px-3 py-2 font-medium">Código</th>
                      <th className="text-left px-3 py-2 font-medium">Nombre</th>
                      <th className="text-left px-3 py-2 font-medium">Categoría</th>
                      <th className="text-left px-3 py-2 font-medium">Talla</th>
                      <th className="text-left px-3 py-2 font-medium">Color</th>
                      <th className="text-right px-3 py-2 font-medium">Precio</th>
                      <th className="text-right px-3 py-2 font-medium">Stock</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {excelRows.map((r, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-400 text-xs">{r.codigo || '-'}</td>
                        <td className="px-3 py-2 font-medium text-gray-900">{r.nombre}</td>
                        <td className="px-3 py-2 text-gray-600">{r.categoria}</td>
                        <td className="px-3 py-2"><span className="bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded text-xs">{r.talla}</span></td>
                        <td className="px-3 py-2 text-gray-600">{r.color || '-'}</td>
                        <td className="px-3 py-2 text-right font-semibold">{fmt(r.precio)}</td>
                        <td className="px-3 py-2 text-right text-gray-600">{r.stock}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
              <button onClick={cerrarImport} className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">{importResult ? 'Cerrar' : 'Cancelar'}</button>
              {!importResult && (
                <button onClick={confirmarImport} disabled={importing || excelRows.length === 0} className="flex-1 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 disabled:bg-primary-300 text-white rounded-lg text-sm font-medium transition-colors">
                  {importing ? 'Importando...' : `Confirmar (${excelRows.length})`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
