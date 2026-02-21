'use client'

import { useState, useEffect, useCallback } from 'react'
import type { DirectConnectionConfig } from './types'

const UPS_SERVICES = [
  { code: '01', name: 'UPS Next Day Air', domestic: true, international: false },
  { code: '02', name: 'UPS 2nd Day Air', domestic: true, international: false },
  { code: '03', name: 'UPS Ground', domestic: true, international: false },
  { code: '12', name: 'UPS 3 Day Select', domestic: true, international: false },
  { code: '13', name: 'UPS Next Day Air Saver', domestic: true, international: false },
  { code: '14', name: 'UPS Next Day Air Early A.M.', domestic: true, international: false },
  { code: '59', name: 'UPS 2nd Day Air A.M.', domestic: true, international: false },
  { code: '92', name: 'UPS SurePost Less than 1 lb', domestic: true, international: false },
  { code: '93', name: 'UPS SurePost 1 lb or Greater', domestic: true, international: false },
  { code: '07', name: 'UPS Worldwide Express', domestic: false, international: true },
  { code: '08', name: 'UPS Worldwide Expedited', domestic: false, international: true },
  { code: '11', name: 'UPS Standard (Canada/Mexico)', domestic: false, international: true },
  { code: '54', name: 'UPS Worldwide Express Plus', domestic: false, international: true },
  { code: '65', name: 'UPS Worldwide Saver', domestic: false, international: true },
]

// ─── Helper types ───────────────────────────────────────────────────────────

interface TestResult {
  success: boolean
  message: string
  details?: {
    tokenAcquired: boolean
    addressValidated: boolean
    residentialIndicator?: string
    validatedAddress?: { street: string; city: string; state: string; postalCode: string; country: string }
  }
  error?: string
}

interface TestLabelResult {
  success: boolean
  trackingNumber?: string
  labelBase64?: string
  labelFormat?: 'GIF' | 'PDF' | 'ZPL'
  totalCharges?: string
  serviceDescription?: string
  error?: string
}

interface RateResult {
  success: boolean
  serviceCode: string
  serviceName: string
  totalCharges?: string
  currencyCode?: string
  transitDays?: string
  error?: string
}

interface AddrValResult {
  success: boolean
  candidates: Array<{ street: string; city: string; state: string; postalCode: string; country: string; classification: string }>
  error?: string
}

const Spinner = ({ className = 'h-4 w-4' }: { className?: string }) => (
  <svg className={`animate-spin ${className}`} viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
  </svg>
)

function statusBadge(status: string | undefined) {
  if (status === 'connected') return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800"><span className="w-2 h-2 rounded-full bg-green-500" /> Connected</span>
  if (status === 'error') return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800"><span className="w-2 h-2 rounded-full bg-red-500" /> Error</span>
  return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800"><span className="w-2 h-2 rounded-full bg-yellow-500" /> Untested</span>
}

async function apiCall(body: Record<string, any>) {
  const res = await fetch('/api/carriers/direct', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ carrier: 'ups', ...body }),
  })
  return res.json()
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function UPSDirectTab() {
  const [loading, setLoading] = useState(true)
  const [connections, setConnections] = useState<DirectConnectionConfig[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [actionStates, setActionStates] = useState<Record<string, {
    saving?: boolean; testing?: boolean; testingLabel?: boolean; deleting?: boolean; savingServices?: boolean
    testResult?: TestResult | null; testLabelResult?: TestLabelResult | null
    saveMessage?: string | null; error?: string | null; servicesSaveMsg?: string | null
  }>>({})

  // Add form
  const [addNickname, setAddNickname] = useState('')
  const [addClientId, setAddClientId] = useState('')
  const [addClientSecret, setAddClientSecret] = useState('')
  const [addAccountNumber, setAddAccountNumber] = useState('')
  const [addSandbox, setAddSandbox] = useState(false)
  const [adding, setAdding] = useState(false)

  // Inline-edit state per connection
  const [editState, setEditState] = useState<Record<string, {
    nickname: string; clientId: string; clientSecret: string; accountNumber: string; sandbox: boolean
  }>>({})

  // Service selection per connection
  const [selectedServices, setSelectedServices] = useState<Record<string, string[]>>({})

  // Test suite state per connection
  const [testSuiteOpen, setTestSuiteOpen] = useState<Record<string, boolean>>({})
  const [avAddress, setAvAddress] = useState({ street: '104 Eastside Drive', city: 'Black Mountain', state: 'NC', postalCode: '28711', country: 'US' })
  const [avResult, setAvResult] = useState<AddrValResult | null>(null)
  const [avLoading, setAvLoading] = useState(false)
  const [rateServiceCode, setRateServiceCode] = useState('03')
  const [rateWeight, setRateWeight] = useState('1')
  const [rateDims, setRateDims] = useState({ length: '10', width: '10', height: '10' })
  const [rateResult, setRateResult] = useState<RateResult | null>(null)
  const [rateLoading, setRateLoading] = useState(false)
  const [shopResults, setShopResults] = useState<RateResult[]>([])
  const [shopLoading, setShopLoading] = useState(false)

  const fetchConfig = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/carriers/direct')
      const data = await res.json()
      const ups: DirectConnectionConfig[] = data.connections?.ups || []
      setConnections(ups)
      const edits: typeof editState = {}
      const svcs: Record<string, string[]> = {}
      for (const c of ups) {
        edits[c.id] = { nickname: c.nickname, clientId: c.clientId, clientSecret: c.clientSecret, accountNumber: c.accountNumber, sandbox: c.sandbox }
        svcs[c.id] = c.enabledServices || []
      }
      setEditState(edits)
      setSelectedServices(svcs)
    } catch (err: any) {
      setError(err.message || 'Failed to load configuration')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchConfig() }, [fetchConfig])

  function setActionState(id: string, patch: Partial<typeof actionStates[string]>) {
    setActionStates(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }

  function applyConnectionsUpdate(upsArr: DirectConnectionConfig[]) {
    setConnections(upsArr)
    const edits: typeof editState = {}
    const svcs: Record<string, string[]> = {}
    for (const c of upsArr) {
      edits[c.id] = { nickname: c.nickname, clientId: c.clientId, clientSecret: c.clientSecret, accountNumber: c.accountNumber, sandbox: c.sandbox }
      svcs[c.id] = c.enabledServices || []
    }
    setEditState(edits)
    setSelectedServices(svcs)
  }

  // ─── Handlers ───────────────────────────────────────────────────────────

  const handleAdd = async () => {
    setAdding(true); setError(null)
    try {
      const data = await apiCall({ action: 'add', config: { nickname: addNickname, clientId: addClientId, clientSecret: addClientSecret, accountNumber: addAccountNumber, sandbox: addSandbox } })
      if (!data.success) throw new Error(data.error || 'Add failed')
      applyConnectionsUpdate(data.connections?.ups || [])
      setShowAddForm(false); setAddNickname(''); setAddClientId(''); setAddClientSecret(''); setAddAccountNumber(''); setAddSandbox(false)
      if (data.connectionId) setExpandedId(data.connectionId)
    } catch (err: any) { setError(err.message) } finally { setAdding(false) }
  }

  const handleSave = async (id: string) => {
    const edit = editState[id]; if (!edit) return
    setActionState(id, { saving: true, error: null, saveMessage: null, testResult: null })
    try {
      const data = await apiCall({ action: 'save', connectionId: id, config: edit })
      if (!data.success) throw new Error(data.error || 'Save failed')
      applyConnectionsUpdate(data.connections?.ups || [])
      setActionState(id, { saving: false, saveMessage: 'Credentials saved' })
    } catch (err: any) { setActionState(id, { saving: false, error: err.message }) }
  }

  const handleTest = async (id: string) => {
    setActionState(id, { testing: true, error: null, testResult: null, saveMessage: null, testLabelResult: null })
    try {
      const data = await apiCall({ action: 'test', connectionId: id })
      setActionState(id, { testing: false, testResult: data.result || { success: false, message: data.error || 'Unknown error' } })
      if (data.connections?.ups) applyConnectionsUpdate(data.connections.ups)
    } catch (err: any) { setActionState(id, { testing: false, testResult: { success: false, message: err.message } }) }
  }

  const handleTestLabel = async (id: string) => {
    setActionState(id, { testingLabel: true, error: null, testLabelResult: null, saveMessage: null })
    try {
      const data = await apiCall({ action: 'test-label', connectionId: id })
      setActionState(id, { testingLabel: false, testLabelResult: data.result || { success: false, error: data.error } })
    } catch (err: any) { setActionState(id, { testingLabel: false, testLabelResult: { success: false, error: err.message } }) }
  }

  const handleDelete = async (id: string) => {
    const conn = connections.find(c => c.id === id)
    if (!confirm(`Remove "${conn?.nickname || 'this connection'}"? This will delete credentials and enabled services.`)) return
    setActionState(id, { deleting: true, error: null })
    try {
      const data = await apiCall({ action: 'delete', connectionId: id })
      if (!data.success) throw new Error(data.error || 'Delete failed')
      applyConnectionsUpdate(data.connections?.ups || [])
      if (expandedId === id) setExpandedId(null)
    } catch (err: any) { setActionState(id, { deleting: false, error: err.message }) }
  }

  const handleSaveServices = async (id: string) => {
    setActionState(id, { savingServices: true, servicesSaveMsg: null, error: null })
    try {
      const data = await apiCall({ action: 'save-services', connectionId: id, serviceCodes: selectedServices[id] || [] })
      if (!data.success) throw new Error(data.error || 'Save failed')
      applyConnectionsUpdate(data.connections?.ups || [])
      setActionState(id, { savingServices: false, servicesSaveMsg: `${(selectedServices[id] || []).length} services saved` })
    } catch (err: any) { setActionState(id, { savingServices: false, error: err.message }) }
  }

  const toggleService = (connId: string, code: string) => {
    setSelectedServices(prev => {
      const cur = prev[connId] || []
      return { ...prev, [connId]: cur.includes(code) ? cur.filter(c => c !== code) : [...cur, code] }
    })
  }

  // ─── Test Suite Handlers ──────────────────────────────────────────────

  const handleValidateAddress = async (connId: string) => {
    setAvLoading(true); setAvResult(null)
    try {
      const data = await apiCall({ action: 'validate-address', connectionId: connId, address: avAddress })
      setAvResult(data.result || { success: false, candidates: [], error: data.error })
    } catch (err: any) { setAvResult({ success: false, candidates: [], error: err.message }) }
    finally { setAvLoading(false) }
  }

  const handleGetRate = async (connId: string) => {
    setRateLoading(true); setRateResult(null)
    try {
      const data = await apiCall({ action: 'get-rate', connectionId: connId, serviceCode: rateServiceCode, weight: rateWeight, dims: rateDims })
      setRateResult(data.result || { success: false, serviceCode: rateServiceCode, serviceName: '', error: data.error })
    } catch (err: any) { setRateResult({ success: false, serviceCode: rateServiceCode, serviceName: '', error: err.message }) }
    finally { setRateLoading(false) }
  }

  const handleRateShop = async (connId: string) => {
    setShopLoading(true); setShopResults([])
    try {
      const codes = UPS_SERVICES.filter(s => s.domestic).map(s => s.code)
      const data = await apiCall({ action: 'rate-shop', connectionId: connId, serviceCodes: codes, weight: rateWeight, dims: rateDims })
      setShopResults(data.results || [])
    } catch (err: any) { setShopResults([{ success: false, serviceCode: '', serviceName: 'Error', error: err.message }]) }
    finally { setShopLoading(false) }
  }

  const openLabel = (base64: string, format?: string) => {
    if (format === 'PDF') {
      const binary = atob(base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      window.open(URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })), '_blank')
      return
    }
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`<!DOCTYPE html><html><head><title>UPS Test Label (4x6)</title><style>@page{size:4in 6in;margin:0}body{margin:0;display:flex;justify-content:center;align-items:center;background:#f3f4f6;min-height:100vh}img{width:4in;height:6in;object-fit:contain}@media print{body{background:white}}</style></head><body><img src="data:image/gif;base64,${base64}"/></body></html>`)
    win.document.close()
  }

  // ─── RENDER ───────────────────────────────────────────────────────────

  if (loading) return <div className="flex items-center justify-center py-16"><Spinner className="h-6 w-6 text-gray-400" /></div>

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-center">
            <span className="text-sm font-bold text-amber-800">UPS</span>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">UPS Direct Connections</h3>
            <p className="text-sm text-gray-500">Connect directly to the UPS REST API</p>
          </div>
        </div>
        <button onClick={() => setShowAddForm(true)} className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 transition-colors flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Add Connection
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>}

      {/* Add Form */}
      {showAddForm && (
        <div className="bg-white border-2 border-amber-300 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">New UPS Connection</h4>
            <button onClick={() => setShowAddForm(false)} className="text-gray-400 hover:text-gray-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Nickname</label>
              <input type="text" value={addNickname} onChange={e => setAddNickname(e.target.value)} placeholder='e.g. "E-COM" or "Wholesale"' className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Client ID</label>
              <input type="text" value={addClientId} onChange={e => setAddClientId(e.target.value)} placeholder="From UPS Developer Portal" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Client Secret</label>
              <input type="password" value={addClientSecret} onChange={e => setAddClientSecret(e.target.value)} placeholder="••••••••" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">UPS Account Number</label>
              <input type="text" value={addAccountNumber} onChange={e => setAddAccountNumber(e.target.value)} placeholder="e.g. A1B2C3" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500" />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer py-2">
                <input type="checkbox" checked={addSandbox} onChange={e => setAddSandbox(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500" />
                <span className="text-sm text-gray-700">Sandbox / Testing Mode</span>
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowAddForm(false)} className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors">Cancel</button>
            <button onClick={handleAdd} disabled={adding || !addClientId || !addClientSecret || !addAccountNumber} className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {adding ? 'Adding...' : 'Add Connection'}
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {connections.length === 0 && !showAddForm && (
        <div className="bg-gray-50 border border-gray-200 border-dashed rounded-xl p-8 text-center">
          <p className="text-gray-500 text-sm">No UPS Direct connections configured.</p>
          <p className="text-gray-400 text-xs mt-1">Click &quot;Add Connection&quot; to get started.</p>
        </div>
      )}

      {/* Connection Cards */}
      {connections.map(conn => {
        const isExpanded = expandedId === conn.id
        const state = actionStates[conn.id] || {}
        const edit = editState[conn.id]
        const hasChanges = edit && (edit.nickname !== conn.nickname || edit.clientId !== conn.clientId || edit.clientSecret !== conn.clientSecret || edit.accountNumber !== conn.accountNumber || edit.sandbox !== conn.sandbox)
        const connSelectedServices = selectedServices[conn.id] || []
        const savedServices = conn.enabledServices || []
        const servicesChanged = JSON.stringify([...connSelectedServices].sort()) !== JSON.stringify([...savedServices].sort())
        const isSuiteOpen = testSuiteOpen[conn.id] || false

        return (
          <div key={conn.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            {/* Card Header */}
            <button onClick={() => setExpandedId(isExpanded ? null : conn.id)} className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors text-left">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-amber-800">UPS</span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900">{conn.nickname}</span>
                    {statusBadge(conn.status)}
                    {savedServices.length > 0 && <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs font-semibold rounded-full">{savedServices.length} services</span>}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    Account: {conn.accountNumber}
                    {conn.sandbox && <span className="ml-2 text-amber-600 font-medium">(Sandbox)</span>}
                    {conn.lastTestedAt && <span className="ml-3 text-gray-400">Tested {new Date(conn.lastTestedAt).toLocaleDateString()} {new Date(conn.lastTestedAt).toLocaleTimeString()}</span>}
                  </div>
                </div>
              </div>
              <svg className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>

            {/* Expanded Content */}
            {isExpanded && edit && (
              <div className="border-t border-gray-200 px-6 py-5 space-y-6">
                {conn.status === 'error' && conn.lastError && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{conn.lastError}</div>}

                {/* ── Credentials ────────────────────────── */}
                <div className="space-y-4">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Credentials</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-gray-600 mb-1">Nickname</label>
                      <input type="text" value={edit.nickname} onChange={e => setEditState(p => ({ ...p, [conn.id]: { ...p[conn.id], nickname: e.target.value } }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Client ID</label>
                      <input type="text" value={edit.clientId} onChange={e => setEditState(p => ({ ...p, [conn.id]: { ...p[conn.id], clientId: e.target.value } }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Client Secret</label>
                      <input type="password" value={edit.clientSecret} onChange={e => setEditState(p => ({ ...p, [conn.id]: { ...p[conn.id], clientSecret: e.target.value } }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">UPS Account Number</label>
                      <input type="text" value={edit.accountNumber} onChange={e => setEditState(p => ({ ...p, [conn.id]: { ...p[conn.id], accountNumber: e.target.value } }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                    </div>
                    <div className="flex items-end">
                      <label className="flex items-center gap-2 cursor-pointer py-2">
                        <input type="checkbox" checked={edit.sandbox} onChange={e => setEditState(p => ({ ...p, [conn.id]: { ...p[conn.id], sandbox: e.target.checked } }))} className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                        <span className="text-sm text-gray-700">Sandbox / Testing Mode</span>
                      </label>
                    </div>
                  </div>
                </div>

                {state.error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{state.error}</div>}
                {state.saveMessage && <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700">{state.saveMessage}</div>}

                {/* ── Action Buttons ─────────────────────── */}
                <div className="flex items-center gap-3 flex-wrap">
                  <button onClick={() => handleSave(conn.id)} disabled={state.saving || !edit.clientId || !edit.clientSecret || !edit.accountNumber} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                    {state.saving ? 'Saving...' : hasChanges ? 'Save Changes' : 'Save'}
                  </button>
                  <button onClick={() => handleTest(conn.id)} disabled={state.testing || !!hasChanges} className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                    {state.testing ? <span className="flex items-center gap-2"><Spinner /> Testing...</span> : 'Test Connection'}
                  </button>
                  <button onClick={() => handleTestLabel(conn.id)} disabled={state.testingLabel || conn.status !== 'connected' || !!hasChanges} title={conn.status !== 'connected' ? 'Test the connection first' : undefined} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                    {state.testingLabel ? <span className="flex items-center gap-2"><Spinner /> Generating...</span> : 'Test Label'}
                  </button>
                  <button onClick={() => handleDelete(conn.id)} disabled={state.deleting} className="px-4 py-2 text-red-600 border border-red-200 rounded-lg text-sm font-medium hover:bg-red-50 disabled:opacity-50 transition-colors ml-auto">
                    {state.deleting ? 'Removing...' : 'Remove'}
                  </button>
                </div>

                {/* ── Test Connection Result ─────────────── */}
                {state.testResult && (
                  <div className={`border rounded-xl p-5 ${state.testResult.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                    <p className={`font-semibold text-sm ${state.testResult.success ? 'text-green-800' : 'text-red-800'}`}>{state.testResult.message}</p>
                    {state.testResult.details?.validatedAddress && (
                      <p className="mt-2 text-xs font-mono text-gray-600 bg-white/50 rounded p-2">
                        {state.testResult.details.validatedAddress.street}, {state.testResult.details.validatedAddress.city}, {state.testResult.details.validatedAddress.state} {state.testResult.details.validatedAddress.postalCode} ({state.testResult.details.residentialIndicator})
                      </p>
                    )}
                    {state.testResult.error && !state.testResult.success && <p className="mt-2 text-xs font-mono text-red-600 bg-white/50 rounded p-2 break-all">{state.testResult.error}</p>}
                  </div>
                )}

                {/* ── Test Label Result ──────────────────── */}
                {state.testLabelResult && (
                  <div className={`border rounded-xl p-5 ${state.testLabelResult.success ? 'bg-blue-50 border-blue-200' : 'bg-red-50 border-red-200'}`}>
                    <p className={`font-semibold text-sm ${state.testLabelResult.success ? 'text-blue-800' : 'text-red-800'}`}>
                      {state.testLabelResult.success ? 'Test label generated' : 'Label generation failed'}
                    </p>
                    {state.testLabelResult.success && (
                      <div className="mt-2 flex items-center gap-4 text-xs">
                        <span>Tracking: <span className="font-mono font-medium">{state.testLabelResult.trackingNumber}</span></span>
                        <span>Charges: <span className="font-medium">{state.testLabelResult.totalCharges || 'N/A'}</span></span>
                        {state.testLabelResult.labelBase64 && (
                          <button onClick={() => openLabel(state.testLabelResult!.labelBase64!, state.testLabelResult!.labelFormat)} className="px-3 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700">View 4x6 Label</button>
                        )}
                      </div>
                    )}
                    {state.testLabelResult.error && <p className="mt-2 text-xs font-mono text-red-600 bg-white/50 rounded p-2 break-all">{state.testLabelResult.error}</p>}
                  </div>
                )}

                {/* ── Services ───────────────────────────── */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Services</h4>
                    <div className="flex items-center gap-2">
                      {state.servicesSaveMsg && <span className="text-xs text-green-600">{state.servicesSaveMsg}</span>}
                      <button onClick={() => handleSaveServices(conn.id)} disabled={state.savingServices || !servicesChanged} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                        {state.savingServices ? 'Saving...' : servicesChanged ? 'Save Services' : 'Saved'}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs text-gray-500 font-medium">Domestic</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {UPS_SERVICES.filter(s => s.domestic).map(svc => (
                        <label key={svc.code} className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 cursor-pointer text-sm transition-colors ${connSelectedServices.includes(svc.code) ? 'border-green-400 bg-green-50' : 'border-gray-200 hover:border-gray-300'}`}>
                          <input type="checkbox" checked={connSelectedServices.includes(svc.code)} onChange={() => toggleService(conn.id, svc.code)} className="w-4 h-4 text-green-600 rounded border-gray-300 focus:ring-green-500" />
                          <span className="truncate">{svc.name}</span>
                        </label>
                      ))}
                    </div>
                    <p className="text-xs text-gray-500 font-medium pt-2">International</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {UPS_SERVICES.filter(s => s.international).map(svc => (
                        <label key={svc.code} className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 cursor-pointer text-sm transition-colors ${connSelectedServices.includes(svc.code) ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                          <input type="checkbox" checked={connSelectedServices.includes(svc.code)} onChange={() => toggleService(conn.id, svc.code)} className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500" />
                          <span className="truncate">{svc.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                {/* ── Test Suite ─────────────────────────── */}
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <button onClick={() => setTestSuiteOpen(p => ({ ...p, [conn.id]: !p[conn.id] }))} className="w-full px-5 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors text-left">
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">API Test Suite</h4>
                    <svg className={`w-4 h-4 text-gray-400 transition-transform ${isSuiteOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </button>

                  {isSuiteOpen && (
                    <div className="border-t border-gray-200 p-5 space-y-6">
                      {/* Address Validation */}
                      <div className="space-y-3">
                        <h5 className="text-sm font-semibold text-gray-700">Address Validation</h5>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                          <input type="text" value={avAddress.street} onChange={e => setAvAddress(p => ({ ...p, street: e.target.value }))} placeholder="Street" className="px-2 py-1.5 border border-gray-300 rounded text-sm col-span-2" />
                          <input type="text" value={avAddress.city} onChange={e => setAvAddress(p => ({ ...p, city: e.target.value }))} placeholder="City" className="px-2 py-1.5 border border-gray-300 rounded text-sm" />
                          <input type="text" value={avAddress.state} onChange={e => setAvAddress(p => ({ ...p, state: e.target.value }))} placeholder="State" className="px-2 py-1.5 border border-gray-300 rounded text-sm" />
                          <input type="text" value={avAddress.postalCode} onChange={e => setAvAddress(p => ({ ...p, postalCode: e.target.value }))} placeholder="Zip" className="px-2 py-1.5 border border-gray-300 rounded text-sm" />
                        </div>
                        <button onClick={() => handleValidateAddress(conn.id)} disabled={avLoading || conn.status !== 'connected'} className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                          {avLoading ? <span className="flex items-center gap-2"><Spinner /> Validating...</span> : 'Validate Address'}
                        </button>
                        {avResult && (
                          <div className={`rounded-lg p-3 text-sm ${avResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                            {avResult.success ? (
                              <div className="space-y-1">
                                {avResult.candidates.map((c, i) => (
                                  <div key={i} className="flex items-center gap-2 text-xs">
                                    <span className={`px-1.5 py-0.5 rounded font-medium ${c.classification === 'Commercial' ? 'bg-blue-100 text-blue-800' : c.classification === 'Residential' ? 'bg-orange-100 text-orange-800' : 'bg-gray-100 text-gray-700'}`}>{c.classification}</span>
                                    <span className="font-mono">{c.street}, {c.city}, {c.state} {c.postalCode}</span>
                                  </div>
                                ))}
                                {avResult.candidates.length === 0 && <span className="text-gray-500 text-xs">No candidates returned</span>}
                              </div>
                            ) : <span className="text-red-700 text-xs">{avResult.error}</span>}
                          </div>
                        )}
                      </div>

                      {/* Single Rate */}
                      <div className="space-y-3">
                        <h5 className="text-sm font-semibold text-gray-700">Rate Check</h5>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                          <select value={rateServiceCode} onChange={e => setRateServiceCode(e.target.value)} className="px-2 py-1.5 border border-gray-300 rounded text-sm col-span-2">
                            {UPS_SERVICES.filter(s => s.domestic).map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                          </select>
                          <input type="text" value={rateWeight} onChange={e => setRateWeight(e.target.value)} placeholder="Weight (lbs)" className="px-2 py-1.5 border border-gray-300 rounded text-sm" />
                          <input type="text" value={rateDims.length} onChange={e => setRateDims(p => ({ ...p, length: e.target.value }))} placeholder="L" className="px-2 py-1.5 border border-gray-300 rounded text-sm" />
                          <div className="flex gap-1">
                            <input type="text" value={rateDims.width} onChange={e => setRateDims(p => ({ ...p, width: e.target.value }))} placeholder="W" className="px-2 py-1.5 border border-gray-300 rounded text-sm w-1/2" />
                            <input type="text" value={rateDims.height} onChange={e => setRateDims(p => ({ ...p, height: e.target.value }))} placeholder="H" className="px-2 py-1.5 border border-gray-300 rounded text-sm w-1/2" />
                          </div>
                        </div>
                        <button onClick={() => handleGetRate(conn.id)} disabled={rateLoading || conn.status !== 'connected'} className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                          {rateLoading ? <span className="flex items-center gap-2"><Spinner /> Getting Rate...</span> : 'Get Rate'}
                        </button>
                        {rateResult && (
                          <div className={`rounded-lg p-3 text-sm ${rateResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                            {rateResult.success ? (
                              <div className="flex items-center gap-4 text-xs">
                                <span className="font-medium">{rateResult.serviceName}</span>
                                <span className="font-mono text-lg font-bold text-green-800">${rateResult.totalCharges} {rateResult.currencyCode}</span>
                                {rateResult.transitDays && <span className="text-gray-600">{rateResult.transitDays} business days</span>}
                              </div>
                            ) : <span className="text-red-700 text-xs">{rateResult.error}</span>}
                          </div>
                        )}
                      </div>

                      {/* Rate Shop */}
                      <div className="space-y-3">
                        <h5 className="text-sm font-semibold text-gray-700">Rate Shop (All Domestic Services)</h5>
                        <p className="text-xs text-gray-500">Uses the weight/dims from Rate Check above. Queries all domestic services in parallel.</p>
                        <button onClick={() => handleRateShop(conn.id)} disabled={shopLoading || conn.status !== 'connected'} className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                          {shopLoading ? <span className="flex items-center gap-2"><Spinner /> Shopping rates...</span> : 'Shop All Services'}
                        </button>
                        {shopResults.length > 0 && (
                          <div className="border border-gray-200 rounded-lg overflow-hidden">
                            <table className="w-full text-xs">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="text-left px-3 py-2 font-medium text-gray-600">Service</th>
                                  <th className="text-right px-3 py-2 font-medium text-gray-600">Rate</th>
                                  <th className="text-right px-3 py-2 font-medium text-gray-600">Transit</th>
                                  <th className="text-center px-3 py-2 font-medium text-gray-600">Status</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {shopResults.map((r, i) => (
                                  <tr key={i} className={r.success ? '' : 'opacity-50'}>
                                    <td className="px-3 py-2 font-medium">{r.serviceName}</td>
                                    <td className="px-3 py-2 text-right font-mono">{r.success ? `$${r.totalCharges}` : '--'}</td>
                                    <td className="px-3 py-2 text-right">{r.transitDays ? `${r.transitDays}d` : '--'}</td>
                                    <td className="px-3 py-2 text-center">
                                      {r.success
                                        ? <span className="text-green-600 font-medium">OK</span>
                                        : <span className="text-red-500" title={r.error}>Failed</span>}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
