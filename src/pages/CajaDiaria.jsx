import { useEffect, useState, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import {
  DollarSign, TrendingUp, TrendingDown, Plus, X, Check,
  Clock, CreditCard, Smartphone, Banknote, Wallet,
  ChevronDown, ChevronUp, Calendar, AlertTriangle, History,
} from 'lucide-react'

const sum = (arr, key) => arr.reduce((s, r) => s + (Number(r[key]) || 0), 0)
const fmt = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n || 0)
const fmtHora = (d) => d ? new Date(d).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '-'
const fmtFecha = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }) : '-'
const fmtFechaCorta = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-'

const hoyISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const MEDIO_LABEL = { efectivo: 'Efectivo', 'débito': 'Débito', crédito: 'Crédito', mercadopago: 'Mercado Pago' }
const MEDIO_ICON = {
  efectivo: Banknote,
  'débito': CreditCard,
  crédito: CreditCard,
  mercadopago: Smartphone,
}

// ─────────────────────────────────────────────────────────────────────────────
export default function CajaDiaria() {
  const { user } = useAuth()
  const [tab, setTab] = useState('resumen')
  const [loading, setLoading] = useState(true)

  // Estado de la caja del día
  const [caja, setCaja] = useState(null)
  const [ventas, setVentas] = useState([])
  const [movimientos, setMovimientos] = useState([])

  // Tasas override para el resumen (editable)
  const [tasaCredito, setTasaCredito] = useState('')
  const [cuotasDisplay, setCuotasDisplay] = useState(1)
  const [tasaMP, setTasaMP] = useState('')

  // Apertura
  const [saldoInicial, setSaldoInicial] = useState('')
  const [abriendo, setAbriendo] = useState(false)

  // Movimiento manual
  const [showMovModal, setShowMovModal] = useState(false)
  const [movForm, setMovForm] = useState({ tipo: 'egreso', concepto: '', monto: '' })
  const [savingMov, setSavingMov] = useState(false)

  // Cierre
  const [showCierre, setShowCierre] = useState(false)
  const [saldoReal, setSaldoReal] = useState('')
  const [cerrando, setCerrando] = useState(false)

  // Historial
  const [historial, setHistorial] = useState([])
  const [histFechaDesde, setHistFechaDesde] = useState('')
  const [histFechaHasta, setHistFechaHasta] = useState('')
  const [histDetalle, setHistDetalle] = useState(null)  // { caja, ventas, movimientos }
  const [loadingDetalle, setLoadingDetalle] = useState(false)

  useEffect(() => { loadCajaHoy() }, [])
  useEffect(() => { if (tab === 'historial') loadHistorial() }, [tab])

  // ── Carga de datos ──────────────────────────────────────────────
  async function loadCajaHoy() {
    setLoading(true)
    const hoy = hoyISO()

    const { data: cajaData } = await supabase
      .from('cajas')
      .select('*')
      .eq('fecha', hoy)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    setCaja(cajaData)

    if (cajaData) {
      await Promise.all([loadVentasHoy(hoy), loadMovimientos(cajaData.id)])
    }
    setLoading(false)
  }

  async function loadVentasHoy(fecha) {
    const desde = new Date(fecha + 'T00:00:00')
    const hasta = new Date(fecha + 'T23:59:59')
    const { data } = await supabase
      .from('ventas')
      .select('*, clientes(nombre), venta_items(cantidad, precio_unitario, productos(nombre, talla))')
      .gte('created_at', desde.toISOString())
      .lte('created_at', hasta.toISOString())
      .order('created_at', { ascending: false })
    setVentas(data || [])

    // Setear tasas por defecto desde datos guardados
    const creds = (data || []).filter(v => v.metodo_pago === 'crédito' && v.interes_porcentaje > 0)
    if (creds.length > 0) setTasaCredito(String(creds[0].interes_porcentaje))
    const mps = (data || []).filter(v => v.metodo_pago === 'mercadopago' && v.interes_porcentaje > 0)
    if (mps.length > 0) setTasaMP(String(mps[0].interes_porcentaje))
  }

  async function loadMovimientos(cajaId) {
    const { data } = await supabase
      .from('caja_movimientos')
      .select('*')
      .eq('caja_id', cajaId)
      .order('created_at')
    setMovimientos(data || [])
  }

  async function loadHistorial() {
    const { data } = await supabase
      .from('cajas')
      .select('*')
      .order('fecha', { ascending: false })
      .limit(60)
    setHistorial(data || [])
  }

  async function loadDetalleHistorial(cajaHist) {
    setLoadingDetalle(true)
    const desde = new Date(cajaHist.fecha + 'T00:00:00')
    const hasta = new Date(cajaHist.fecha + 'T23:59:59')
    const [ventasRes, movRes] = await Promise.all([
      supabase.from('ventas')
        .select('*, clientes(nombre), venta_items(cantidad, precio_unitario, productos(nombre, talla))')
        .gte('created_at', desde.toISOString())
        .lte('created_at', hasta.toISOString())
        .order('created_at', { ascending: false }),
      supabase.from('caja_movimientos').select('*').eq('caja_id', cajaHist.id).order('created_at'),
    ])
    setHistDetalle({ caja: cajaHist, ventas: ventasRes.data || [], movimientos: movRes.data || [] })
    setLoadingDetalle(false)
  }

  // ── Cálculos ────────────────────────────────────────────────────
  const { efectivoVentas, debitoVentas, creditoVentas, mpVentas } = useMemo(() => {
    const g = { efectivo: [], débito: [], crédito: [], mercadopago: [] }
    ventas.forEach(v => { if (g[v.metodo_pago]) g[v.metodo_pago].push(v) })
    return {
      efectivoVentas: g['efectivo'],
      debitoVentas: g['débito'],
      creditoVentas: g['crédito'],
      mpVentas: g['mercadopago'],
    }
  }, [ventas])

  const efectivoTotal = sum(efectivoVentas, 'total')
  const debitoTotal = sum(debitoVentas, 'total')

  const creditoBruto = sum(creditoVentas, 'total')
  const creditoInteresGuardado = sum(creditoVentas, 'interes_monto')
  const creditoTasaEfectiva = tasaCredito !== '' ? Number(tasaCredito) : (creditoBruto > 0 ? creditoInteresGuardado / creditoBruto * 100 : 0)
  const creditoInteres = Math.round(creditoBruto * creditoTasaEfectiva / 100)
  const creditoNeto = creditoBruto - creditoInteres

  const mpBruto = sum(mpVentas, 'total')
  const mpInteresGuardado = sum(mpVentas, 'interes_monto')
  const mpTasaEfectiva = tasaMP !== '' ? Number(tasaMP) : (mpBruto > 0 ? mpInteresGuardado / mpBruto * 100 : 0)
  const mpInteres = Math.round(mpBruto * mpTasaEfectiva / 100)
  const mpNeto = mpBruto - mpInteres

  const totalNeto = efectivoTotal + debitoTotal + creditoNeto + mpNeto
  const totalBruto = efectivoTotal + debitoTotal + creditoBruto + mpBruto
  const totalIntereses = creditoInteres + mpInteres

  const ingresosManual = sum(movimientos.filter(m => m.tipo === 'ingreso'), 'monto')
  const egresosManual = sum(movimientos.filter(m => m.tipo === 'egreso'), 'monto')

  const saldoFinalEsperado = (caja?.saldo_inicial || 0) + efectivoTotal + ingresosManual - egresosManual

  // ── Acciones ────────────────────────────────────────────────────
  async function abrirCaja() {
    if (!saldoInicial && saldoInicial !== '0') return
    setAbriendo(true)
    const { data, error } = await supabase.from('cajas').insert({
      fecha: hoyISO(),
      user_id: user.id,
      saldo_inicial: Number(saldoInicial) || 0,
      hora_apertura: new Date().toISOString(),
      estado: 'abierta',
    }).select().single()
    if (error) { alert('Error al abrir la caja: ' + error.message); setAbriendo(false); return }
    setCaja(data)
    setSaldoInicial('')
    setAbriendo(false)
  }

  async function guardarMovimiento(e) {
    e.preventDefault()
    if (!movForm.concepto || !movForm.monto) return
    setSavingMov(true)
    const { data } = await supabase.from('caja_movimientos').insert({
      caja_id: caja.id,
      tipo: movForm.tipo,
      concepto: movForm.concepto,
      monto: Number(movForm.monto),
    }).select().single()
    setMovimientos(prev => [...prev, data])
    setMovForm({ tipo: 'egreso', concepto: '', monto: '' })
    setShowMovModal(false)
    setSavingMov(false)
  }

  async function cerrarCaja() {
    setCerrando(true)
    const realNum = Number(saldoReal) || 0
    const diferencia = realNum - saldoFinalEsperado
    await supabase.from('cajas').update({
      estado: 'cerrada',
      hora_cierre: new Date().toISOString(),
      saldo_final_esperado: saldoFinalEsperado,
      saldo_final_real: realNum,
      diferencia,
    }).eq('id', caja.id)
    setCaja(prev => ({ ...prev, estado: 'cerrada', saldo_final_esperado: saldoFinalEsperado, saldo_final_real: realNum, diferencia }))
    setShowCierre(false)
    setSaldoReal('')
    setCerrando(false)
  }

  // ── Historial filtrado ──────────────────────────────────────────
  const histFiltrado = useMemo(() => historial.filter(c => {
    if (histFechaDesde && c.fecha < histFechaDesde) return false
    if (histFechaHasta && c.fecha > histFechaHasta) return false
    return true
  }), [historial, histFechaDesde, histFechaHasta])

  // ── Render ──────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
    </div>
  )

  return (
    <div className="h-full flex flex-col">
      {/* Header con tabs */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Caja Diaria</h2>
          <p className="text-sm text-gray-400 capitalize">{fmtFecha(hoyISO())}</p>
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          <button onClick={() => setTab('resumen')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === 'resumen' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            Resumen del día
          </button>
          <button onClick={() => setTab('historial')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${tab === 'historial' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            <History className="w-3.5 h-3.5" />Historial
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">

        {/* ═══════════════ TAB: RESUMEN ════════════════ */}
        {tab === 'resumen' && (
          <div className="p-6 max-w-4xl">

            {/* ── Sin caja abierta ── */}
            {!caja && (
              <div className="max-w-sm mx-auto mt-10">
                <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
                  <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Wallet className="w-8 h-8 text-primary-600" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-1">Abrir caja</h3>
                  <p className="text-sm text-gray-400 mb-6">Ingresá el saldo inicial en efectivo</p>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 text-left mb-1">Saldo inicial ($)</label>
                    <input
                      type="number"
                      value={saldoInicial}
                      onChange={e => setSaldoInicial(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && abrirCaja()}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl text-center text-xl font-bold focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="0"
                      min="0"
                      autoFocus
                    />
                  </div>
                  <button onClick={abrirCaja} disabled={abriendo}
                    className="w-full bg-primary-600 hover:bg-primary-700 disabled:bg-primary-300 text-white py-3 rounded-xl font-semibold transition-colors">
                    {abriendo ? 'Abriendo...' : 'Abrir caja'}
                  </button>
                </div>
              </div>
            )}

            {/* ── Caja abierta o cerrada ── */}
            {caja && (
              <>
                {/* Estado de la caja */}
                <div className={`flex items-center gap-3 px-4 py-3 rounded-xl mb-6 text-sm font-medium ${
                  caja.estado === 'abierta' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-gray-100 text-gray-600 border border-gray-200'
                }`}>
                  <Clock className="w-4 h-4 flex-shrink-0" />
                  <span>
                    {caja.estado === 'abierta'
                      ? `Caja abierta desde las ${fmtHora(caja.hora_apertura)} · Saldo inicial: ${fmt(caja.saldo_inicial)}`
                      : `Caja cerrada · Apertura: ${fmtHora(caja.hora_apertura)} · Cierre: ${fmtHora(caja.hora_cierre)}`}
                  </span>
                </div>

                {/* ── Stats tarjetas ── */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                  <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <p className="text-xs text-gray-400 mb-1">Ventas (bruto)</p>
                    <p className="text-xl font-bold text-gray-900">{fmt(totalBruto)}</p>
                    <p className="text-xs text-gray-400 mt-1">{ventas.length} ventas</p>
                  </div>
                  <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <p className="text-xs text-gray-400 mb-1">Intereses / comis.</p>
                    <p className="text-xl font-bold text-red-500">- {fmt(totalIntereses)}</p>
                  </div>
                  <div className="bg-white rounded-xl border border-green-200 bg-green-50 p-4">
                    <p className="text-xs text-green-600 mb-1">Total neto del local</p>
                    <p className="text-xl font-bold text-green-700">{fmt(totalNeto)}</p>
                  </div>
                  <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <p className="text-xs text-gray-400 mb-1">Efectivo esperado</p>
                    <p className="text-xl font-bold text-gray-900">{fmt(saldoFinalEsperado)}</p>
                    <p className="text-xs text-gray-400 mt-1">ini + ventas + mov</p>
                  </div>
                </div>

                {/* ── Desglose por medio de pago ── */}
                <div className="bg-white rounded-xl border border-gray-200 mb-6 overflow-hidden">
                  <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
                    <h3 className="font-semibold text-gray-900 text-sm">Detalle por medio de pago</h3>
                  </div>
                  <div className="divide-y divide-gray-50">

                    {/* Efectivo */}
                    <MedioPagoRow
                      icono={Banknote} label="Efectivo" color="text-green-600" bg="bg-green-50"
                      count={efectivoVentas.length} bruto={efectivoTotal}
                    />

                    {/* Débito */}
                    <MedioPagoRow
                      icono={CreditCard} label="Débito" color="text-blue-600" bg="bg-blue-50"
                      count={debitoVentas.length} bruto={debitoTotal}
                    />

                    {/* Crédito */}
                    <MedioPagoRowInteres
                      icono={CreditCard} label="Crédito" color="text-orange-600" bg="bg-orange-50"
                      count={creditoVentas.length} bruto={creditoBruto}
                      tasa={tasaCredito} onTasaChange={setTasaCredito}
                      interes={creditoInteres} neto={creditoNeto}
                      cuotas={cuotasDisplay} onCuotasChange={setCuotasDisplay}
                      tipoLabel="Interés" showCuotas
                    />

                    {/* Mercado Pago */}
                    <MedioPagoRowInteres
                      icono={Smartphone} label="Mercado Pago" color="text-sky-600" bg="bg-sky-50"
                      count={mpVentas.length} bruto={mpBruto}
                      tasa={tasaMP} onTasaChange={setTasaMP}
                      interes={mpInteres} neto={mpNeto}
                      tipoLabel="Comisión"
                    />
                  </div>

                  {/* Totales */}
                  <div className="px-5 py-3 bg-gray-50 border-t border-gray-200">
                    <div className="flex items-center justify-between">
                      <div className="text-sm">
                        <span className="text-gray-500">Total bruto: </span>
                        <span className="font-semibold text-gray-900">{fmt(totalBruto)}</span>
                        {totalIntereses > 0 && <>
                          <span className="text-gray-400 mx-2">−</span>
                          <span className="text-gray-500">Intereses: </span>
                          <span className="font-semibold text-red-500">{fmt(totalIntereses)}</span>
                        </>}
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-400">Neto total</p>
                        <p className="text-lg font-bold text-green-700">{fmt(totalNeto)}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Movimientos manuales ── */}
                <div className="bg-white rounded-xl border border-gray-200 mb-6">
                  <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
                    <h3 className="font-semibold text-gray-900 text-sm">Movimientos manuales</h3>
                    {caja.estado === 'abierta' && (
                      <button onClick={() => setShowMovModal(true)}
                        className="flex items-center gap-1.5 text-xs text-primary-600 hover:text-primary-700 font-medium">
                        <Plus className="w-3.5 h-3.5" />Agregar
                      </button>
                    )}
                  </div>
                  {movimientos.length === 0 ? (
                    <p className="text-center text-gray-400 text-sm py-6">Sin movimientos</p>
                  ) : (
                    <div className="divide-y divide-gray-50">
                      {movimientos.map(m => (
                        <div key={m.id} className="flex items-center justify-between px-5 py-2.5">
                          <div>
                            <p className="text-sm font-medium text-gray-800">{m.concepto}</p>
                            <p className="text-xs text-gray-400">{fmtHora(m.created_at)}</p>
                          </div>
                          <span className={`text-sm font-bold ${m.tipo === 'ingreso' ? 'text-green-600' : 'text-red-500'}`}>
                            {m.tipo === 'ingreso' ? '+' : '-'} {fmt(m.monto)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {(ingresosManual > 0 || egresosManual > 0) && (
                    <div className="px-5 py-2.5 bg-gray-50 border-t border-gray-100 flex justify-between text-sm">
                      <span className="text-gray-500">Ingresos <span className="text-green-600 font-semibold">{fmt(ingresosManual)}</span> · Egresos <span className="text-red-500 font-semibold">{fmt(egresosManual)}</span></span>
                      <span className="font-semibold text-gray-800">Neto: {fmt(ingresosManual - egresosManual)}</span>
                    </div>
                  )}
                </div>

                {/* ── Listado de ventas ── */}
                <div className="bg-white rounded-xl border border-gray-200 mb-6">
                  <div className="px-5 py-3 border-b border-gray-100">
                    <h3 className="font-semibold text-gray-900 text-sm">Ventas del día ({ventas.length})</h3>
                  </div>
                  {ventas.length === 0 ? (
                    <p className="text-center text-gray-400 text-sm py-6">Sin ventas registradas</p>
                  ) : (
                    <div className="divide-y divide-gray-50">
                      {ventas.map(v => (
                        <VentaRow key={v.id} venta={v} fmt={fmt} fmtHora={fmtHora} />
                      ))}
                    </div>
                  )}
                </div>

                {/* ── Botón cierre ── */}
                {caja.estado === 'abierta' && (
                  <button onClick={() => { setSaldoReal(''); setShowCierre(true) }}
                    className="w-full bg-gray-800 hover:bg-gray-900 text-white py-3.5 rounded-xl font-semibold text-sm transition-colors">
                    Cerrar caja
                  </button>
                )}

                {/* Resumen si está cerrada */}
                {caja.estado === 'cerrada' && (
                  <div className="bg-gray-50 rounded-xl border border-gray-200 p-5">
                    <h3 className="font-semibold text-gray-900 mb-4">Resumen de cierre</h3>
                    <div className="space-y-2 text-sm">
                      <Row label="Saldo inicial" valor={fmt(caja.saldo_inicial)} />
                      <Row label="+ Ventas efectivo" valor={fmt(efectivoTotal)} />
                      <Row label="+ Ingresos manuales" valor={fmt(ingresosManual)} />
                      <Row label="− Egresos manuales" valor={fmt(egresosManual)} cls="text-red-500" />
                      <Row label="= Saldo esperado" valor={fmt(caja.saldo_final_esperado)} bold />
                      <Row label="Efectivo contado" valor={fmt(caja.saldo_final_real)} bold />
                      <div className={`flex justify-between pt-2 border-t border-gray-200 font-bold ${(caja.diferencia || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        <span>Diferencia</span>
                        <span>{(caja.diferencia || 0) >= 0 ? '+' : ''}{fmt(caja.diferencia)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ═══════════════ TAB: HISTORIAL ════════════════ */}
        {tab === 'historial' && (
          <div className="p-6 max-w-4xl">
            {/* Filtros */}
            <div className="flex gap-3 mb-5">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Desde</label>
                <input type="date" value={histFechaDesde} onChange={e => setHistFechaDesde(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Hasta</label>
                <input type="date" value={histFechaHasta} onChange={e => setHistFechaHasta(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              {(histFechaDesde || histFechaHasta) && (
                <div className="flex items-end">
                  <button onClick={() => { setHistFechaDesde(''); setHistFechaHasta('') }}
                    className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-300 rounded-lg">
                    Limpiar
                  </button>
                </div>
              )}
            </div>

            {/* Lista */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {histFiltrado.length === 0 ? (
                <p className="text-center text-gray-400 text-sm py-10">No hay registros</p>
              ) : (
                <div className="divide-y divide-gray-50">
                  {histFiltrado.map(c => (
                    <button key={c.id} onClick={() => { loadDetalleHistorial(c) }}
                      className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors text-left">
                      <div>
                        <p className="font-semibold text-gray-900 text-sm capitalize">{fmtFechaCorta(c.fecha)}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {fmtHora(c.hora_apertura)} → {c.hora_cierre ? fmtHora(c.hora_cierre) : 'Abierta'}
                          {' · '}
                          <span className={`font-medium ${c.estado === 'abierta' ? 'text-green-600' : 'text-gray-500'}`}>
                            {c.estado === 'abierta' ? 'Abierta' : 'Cerrada'}
                          </span>
                        </p>
                      </div>
                      <div className="text-right">
                        {c.saldo_final_real != null && (
                          <p className="text-sm font-bold text-gray-900">{fmt(c.saldo_final_real)}</p>
                        )}
                        {c.diferencia != null && (
                          <p className={`text-xs font-semibold ${c.diferencia >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                            {c.diferencia >= 0 ? '+' : ''}{fmt(c.diferencia)}
                          </p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ═══ Modal movimiento manual ═══ */}
      {showMovModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">Agregar movimiento</h3>
              <button onClick={() => setShowMovModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={guardarMovimiento} className="p-5 space-y-4">
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Tipo</p>
                <div className="grid grid-cols-2 gap-2">
                  {['egreso', 'ingreso'].map(t => (
                    <button type="button" key={t} onClick={() => setMovForm(f => ({ ...f, tipo: t }))}
                      className={`py-2 rounded-lg text-sm font-medium transition-colors capitalize ${movForm.tipo === t
                        ? t === 'egreso' ? 'bg-red-500 text-white' : 'bg-green-500 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                      {t === 'egreso' ? '↓ Egreso / Gasto' : '↑ Ingreso extra'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Concepto</label>
                <input type="text" value={movForm.concepto} onChange={e => setMovForm(f => ({ ...f, concepto: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Ej: Gastos limpieza, Retiro, etc." required autoFocus />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Monto ($)</label>
                <input type="number" value={movForm.monto} onChange={e => setMovForm(f => ({ ...f, monto: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="0" min="0.01" step="0.01" required />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowMovModal(false)} className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">Cancelar</button>
                <button type="submit" disabled={savingMov} className="flex-1 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium transition-colors">
                  {savingMov ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══ Modal cierre de caja ═══ */}
      {showCierre && caja && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h3 className="font-semibold text-gray-900">Cerrar caja</h3>
                <p className="text-xs text-gray-400">{fmtFechaCorta(hoyISO())}</p>
              </div>
              <button onClick={() => setShowCierre(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-5">
              {/* Resumen ventas */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Ventas por medio de pago</p>
                <div className="space-y-1.5 text-sm">
                  {efectivoTotal > 0 && <Row label="Efectivo" valor={fmt(efectivoTotal)} />}
                  {debitoTotal > 0 && <Row label="Débito" valor={fmt(debitoTotal)} />}
                  {creditoBruto > 0 && <>
                    <Row label={`Crédito (bruto)`} valor={fmt(creditoBruto)} />
                    <Row label={`  − Interés (${creditoTasaEfectiva.toFixed(1)}%)`} valor={fmt(creditoInteres)} cls="text-red-500" />
                    <Row label="  = Crédito neto" valor={fmt(creditoNeto)} bold />
                  </>}
                  {mpBruto > 0 && <>
                    <Row label="Mercado Pago (bruto)" valor={fmt(mpBruto)} />
                    <Row label={`  − Comisión (${mpTasaEfectiva.toFixed(1)}%)`} valor={fmt(mpInteres)} cls="text-red-500" />
                    <Row label="  = MP neto" valor={fmt(mpNeto)} bold />
                  </>}
                  <div className="border-t border-gray-200 pt-1.5 mt-1.5">
                    <Row label="Total neto" valor={fmt(totalNeto)} bold />
                  </div>
                </div>
              </div>

              {/* Movimientos */}
              {(ingresosManual > 0 || egresosManual > 0) && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Movimientos manuales</p>
                  <div className="space-y-1 text-sm">
                    {ingresosManual > 0 && <Row label="Ingresos" valor={fmt(ingresosManual)} cls="text-green-600" />}
                    {egresosManual > 0 && <Row label="Egresos" valor={fmt(egresosManual)} cls="text-red-500" />}
                    <Row label="Neto movimientos" valor={fmt(ingresosManual - egresosManual)} bold />
                  </div>
                </div>
              )}

              {/* Efectivo esperado */}
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Efectivo en caja</p>
                <div className="space-y-1 text-sm">
                  <Row label="Saldo inicial" valor={fmt(caja.saldo_inicial)} />
                  <Row label="+ Ventas efectivo" valor={fmt(efectivoTotal)} />
                  {ingresosManual > 0 && <Row label="+ Ingresos" valor={fmt(ingresosManual)} />}
                  {egresosManual > 0 && <Row label="− Egresos" valor={fmt(egresosManual)} />}
                  <div className="border-t border-gray-300 pt-1.5 mt-1.5">
                    <Row label="Saldo esperado" valor={fmt(saldoFinalEsperado)} bold />
                  </div>
                </div>
              </div>

              {/* Efectivo real */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Efectivo real contado ($)</label>
                <input
                  type="number"
                  value={saldoReal}
                  onChange={e => setSaldoReal(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-center text-xl font-bold focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder={String(Math.round(saldoFinalEsperado))}
                  min="0"
                  autoFocus
                />
                {saldoReal !== '' && (
                  <div className={`mt-2 flex items-center justify-between px-4 py-2.5 rounded-lg text-sm font-semibold ${
                    Number(saldoReal) - saldoFinalEsperado >= 0
                      ? 'bg-green-50 text-green-700'
                      : 'bg-red-50 text-red-600'
                  }`}>
                    <span>Diferencia</span>
                    <span>{Number(saldoReal) - saldoFinalEsperado >= 0 ? '+' : ''}{fmt(Number(saldoReal) - saldoFinalEsperado)}</span>
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <button onClick={() => setShowCierre(false)} className="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">
                  Cancelar
                </button>
                <button onClick={cerrarCaja} disabled={cerrando || saldoReal === ''}
                  className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-900 disabled:bg-gray-300 text-white rounded-xl text-sm font-semibold transition-colors">
                  {cerrando ? 'Cerrando...' : 'Confirmar cierre'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Modal detalle historial ═══ */}
      {histDetalle && (
        <DetalleHistorialModal
          data={histDetalle}
          onClose={() => setHistDetalle(null)}
          loadingDetalle={loadingDetalle}
          fmt={fmt}
          fmtHora={fmtHora}
          fmtFecha={fmtFecha}
        />
      )}
    </div>
  )
}

// ── Sub-componentes ───────────────────────────────────────────────

function Row({ label, valor, bold, cls }) {
  return (
    <div className={`flex justify-between ${bold ? 'font-bold text-gray-900' : 'text-gray-600'} ${cls || ''}`}>
      <span>{label}</span><span>{valor}</span>
    </div>
  )
}

function MedioPagoRow({ icono: Icon, label, color, bg, count, bruto }) {
  const fmt = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n || 0)
  if (count === 0) return null
  return (
    <div className="flex items-center px-5 py-4 gap-4">
      <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center flex-shrink-0`}>
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium text-gray-900">{label}</p>
        <p className="text-xs text-gray-400">{count} venta{count !== 1 ? 's' : ''}</p>
      </div>
      <p className="text-base font-bold text-gray-900">{fmt(bruto)}</p>
    </div>
  )
}

function MedioPagoRowInteres({ icono: Icon, label, color, bg, count, bruto, tasa, onTasaChange, interes, neto, cuotas, onCuotasChange, tipoLabel, showCuotas }) {
  const fmt = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n || 0)
  const [expanded, setExpanded] = useState(false)
  if (count === 0) return null
  return (
    <div className="px-5 py-4">
      <div className="flex items-center gap-4">
        <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center flex-shrink-0`}>
          <Icon className={`w-4 h-4 ${color}`} />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-900">{label}</p>
          <p className="text-xs text-gray-400">{count} venta{count !== 1 ? 's' : ''} · bruto {fmt(bruto)}</p>
        </div>
        <div className="text-right">
          <p className="text-base font-bold text-gray-900">{fmt(neto)}</p>
          {interes > 0 && <p className="text-xs text-red-400">- {fmt(interes)}</p>}
        </div>
        <button onClick={() => setExpanded(e => !e)} className="text-gray-300 hover:text-gray-500 ml-1">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>
      {expanded && (
        <div className="mt-3 ml-12 space-y-2">
          {showCuotas && (
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500 w-14">Cuotas</label>
              <div className="flex gap-1 flex-wrap">
                {[1, 3, 6, 12, 18, 24].map(c => (
                  <button key={c} onClick={() => onCuotasChange(c)}
                    className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${cuotas === c ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                    {c === 1 ? 'Cont.' : `${c}c`}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 w-14">{tipoLabel} %</label>
            <input type="number" value={tasa} onChange={e => onTasaChange(e.target.value)} min="0" max="100" step="0.1"
              className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-xs text-center focus:outline-none focus:ring-1 focus:ring-primary-400"
              placeholder="0" />
            {Number(tasa) > 0 && (
              <span className="text-xs text-gray-400">{tipoLabel}: <span className="text-red-500 font-medium">{fmt(interes)}</span> · Neto: <span className="font-medium text-gray-700">{fmt(neto)}</span></span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function VentaRow({ venta: v, fmt, fmtHora }) {
  const [expanded, setExpanded] = useState(false)
  const labelMedio = { efectivo: 'Efectivo', 'débito': 'Débito', crédito: 'Crédito', mercadopago: 'Mercado Pago' }
  return (
    <div>
      <button onClick={() => setExpanded(e => !e)} className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors text-left">
        <div>
          <p className="text-sm font-medium text-gray-900">{v.clientes?.nombre || 'Consumidor final'}</p>
          <p className="text-xs text-gray-400">
            {fmtHora(v.created_at)} · {labelMedio[v.metodo_pago] || v.metodo_pago}
            {v.metodo_pago === 'crédito' && v.cuotas > 1 && ` ${v.cuotas}c`}
            {v.interes_porcentaje > 0 && ` (${v.interes_porcentaje}%)`}
          </p>
        </div>
        <div className="text-right flex items-center gap-2">
          <div>
            <p className="text-sm font-bold text-gray-900">{fmt(v.total)}</p>
            {v.interes_monto > 0 && <p className="text-xs text-green-600">neto {fmt(v.monto_neto)}</p>}
          </div>
          {expanded ? <ChevronUp className="w-4 h-4 text-gray-300" /> : <ChevronDown className="w-4 h-4 text-gray-300" />}
        </div>
      </button>
      {expanded && v.venta_items?.length > 0 && (
        <div className="px-5 pb-3 ml-4 space-y-1">
          {v.venta_items.map((item, i) => (
            <div key={i} className="flex justify-between text-xs text-gray-500">
              <span>{item.productos?.nombre} ({item.productos?.talla}) × {item.cantidad}</span>
              <span>{fmt(item.precio_unitario * item.cantidad)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function DetalleHistorialModal({ data: { caja, ventas, movimientos }, onClose, fmt, fmtHora, fmtFecha }) {
  const sum = (arr, key) => arr.reduce((s, r) => s + (Number(r[key]) || 0), 0)

  const efectivoTotal = sum(ventas.filter(v => v.metodo_pago === 'efectivo'), 'total')
  const debitoTotal = sum(ventas.filter(v => v.metodo_pago === 'débito'), 'total')
  const creditoNeto = sum(ventas.filter(v => v.metodo_pago === 'crédito'), 'monto_neto')
  const mpNeto = sum(ventas.filter(v => v.metodo_pago === 'mercadopago'), 'monto_neto')
  const totalNeto = efectivoTotal + debitoTotal + creditoNeto + mpNeto
  const ingresosManual = sum(movimientos.filter(m => m.tipo === 'ingreso'), 'monto')
  const egresosManual = sum(movimientos.filter(m => m.tipo === 'egreso'), 'monto')

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h3 className="font-semibold text-gray-900">Detalle de caja</h3>
            <p className="text-xs text-gray-400 capitalize">{fmtFecha(caja.fecha)}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="overflow-y-auto flex-1 p-5 space-y-4 text-sm">
          {/* Ventas */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Ventas ({ventas.length})</p>
            <div className="space-y-1">
              {efectivoTotal > 0 && <div className="flex justify-between"><span className="text-gray-600">Efectivo</span><span className="font-medium">{fmt(efectivoTotal)}</span></div>}
              {debitoTotal > 0 && <div className="flex justify-between"><span className="text-gray-600">Débito</span><span className="font-medium">{fmt(debitoTotal)}</span></div>}
              {creditoNeto > 0 && <div className="flex justify-between"><span className="text-gray-600">Crédito (neto)</span><span className="font-medium">{fmt(creditoNeto)}</span></div>}
              {mpNeto > 0 && <div className="flex justify-between"><span className="text-gray-600">Mercado Pago (neto)</span><span className="font-medium">{fmt(mpNeto)}</span></div>}
              <div className="flex justify-between font-bold border-t border-gray-200 pt-1 mt-1"><span>Total neto</span><span>{fmt(totalNeto)}</span></div>
            </div>
          </div>
          {/* Movimientos */}
          {movimientos.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Movimientos</p>
              <div className="space-y-1">
                {movimientos.map(m => (
                  <div key={m.id} className="flex justify-between">
                    <span className="text-gray-600">{m.concepto}</span>
                    <span className={`font-medium ${m.tipo === 'ingreso' ? 'text-green-600' : 'text-red-500'}`}>
                      {m.tipo === 'ingreso' ? '+' : '-'}{fmt(m.monto)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Cierre */}
          {caja.estado === 'cerrada' && (
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Cierre</p>
              <div className="space-y-1">
                <div className="flex justify-between"><span className="text-gray-600">Saldo inicial</span><span>{fmt(caja.saldo_inicial)}</span></div>
                <div className="flex justify-between"><span className="text-gray-600">Saldo esperado</span><span className="font-medium">{fmt(caja.saldo_final_esperado)}</span></div>
                <div className="flex justify-between"><span className="text-gray-600">Efectivo contado</span><span className="font-medium">{fmt(caja.saldo_final_real)}</span></div>
                <div className={`flex justify-between font-bold border-t border-gray-200 pt-1 ${(caja.diferencia || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  <span>Diferencia</span>
                  <span>{(caja.diferencia || 0) >= 0 ? '+' : ''}{fmt(caja.diferencia)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
