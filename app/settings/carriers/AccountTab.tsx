'use client'

import { useState, useCallback } from 'react'
import type { UnifiedAccount, UnifiedService, DirectConnectionConfig } from './types'

// ─── Shared helpers ──────────────────────────────────────────────────────────

interface ActionStates {
  saving?: boolean
  testing?: boolean
  testingLabel?: boolean
  deleting?: boolean
  testResult?: TestResult | null
  testLabelResult?: TestLabelResult | null
  saveMessage?: string | null
  error?: string | null
}

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
  labelFormat?: string
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

// ─── Props ───────────────────────────────────────────────────────────────────

interface AccountTabProps {
  account: UnifiedAccount
  selectedIdentities: Set<string>
  onToggleService: (svc: UnifiedService) => void
  onBatchSelect?: (svcs: UnifiedService[]) => void
  onBatchDeselect?: (identities: string[]) => void
  onSelectAll: () => void
  onDeselectAll: () => void
  onDirectConnectionUpdated: () => void
  onDisconnectShipEngine?: (carrierId: string, carrierCode: string) => void
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function AccountTab({
  account,
  selectedIdentities,
  onToggleService,
  onSelectAll,
  onDeselectAll,
  onDirectConnectionUpdated,
  onDisconnectShipEngine,
  onBatchSelect,
  onBatchDeselect,
}: AccountTabProps) {
  const { direct, shipEngine, services, carrierNetwork, shipEngineCarriers } = account
  const carrierApiName = carrierNetwork === 'ups' ? 'ups' : carrierNetwork === 'fedex' ? 'fedex' : null

  // ── Direct connection management state ──────────────────────────────────
  const [actionState, setActionState] = useState<ActionStates>({})
  const [editState, setEditState] = useState<{
    nickname: string; clientId: string; clientSecret: string; accountNumber: string; sandbox: boolean
  } | null>(direct ? {
    nickname: direct.nickname,
    clientId: direct.clientId,
    clientSecret: direct.clientSecret,
    accountNumber: direct.accountNumber,
    sandbox: direct.sandbox,
  } : null)

  const [showAddDirect, setShowAddDirect] = useState(false)
  const [addNickname, setAddNickname] = useState('')
  const [addClientId, setAddClientId] = useState('')
  const [addClientSecret, setAddClientSecret] = useState('')
  const [addAccountNumber, setAddAccountNumber] = useState(account.accountNumber || '')
  const [addSandbox, setAddSandbox] = useState(false)
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  // ── Test suite state ───────────────────────────────────────────────────
  const [testSuiteOpen, setTestSuiteOpen] = useState(false)
  const [avAddress, setAvAddress] = useState({ street: '104 Eastside Drive', city: 'Black Mountain', state: 'NC', postalCode: '28711', country: 'US' })
  const [avResult, setAvResult] = useState<AddrValResult | null>(null)
  const [avLoading, setAvLoading] = useState(false)
  const [rateServiceCode, setRateServiceCode] = useState('')
  const [rateWeight, setRateWeight] = useState('1')
  const [rateDims, setRateDims] = useState({ length: '10', width: '10', height: '10' })
  const [rateResult, setRateResult] = useState<RateResult | null>(null)
  const [rateLoading, setRateLoading] = useState(false)
  const [shopResults, setShopResults] = useState<RateResult[]>([])
  const [shopLoading, setShopLoading] = useState(false)
  const [disconnectingShipEngine, setDisconnectingShipEngine] = useState(false)
  const [expandCredentials, setExpandCredentials] = useState(false)

  // Collapsible carrier groups (marketplace tab)
  const [collapsedCarriers, setCollapsedCarriers] = useState<Set<string>>(new Set())
  const toggleCarrierCollapse = (carrierId: string) => {
    setCollapsedCarriers(prev => {
      const next = new Set(prev)
      if (next.has(carrierId)) next.delete(carrierId)
      else next.add(carrierId)
      return next
    })
  }

  // Service filter
  const [serviceFilter, setServiceFilter] = useState<'all' | 'domestic' | 'international'>('all')

  const filteredServices = services.filter(s => {
    if (serviceFilter === 'domestic') return s.domestic
    if (serviceFilter === 'international') return s.international
    return true
  })

  const selectedCount = services.filter(s => selectedIdentities.has(s.identity)).length
  const allSelected = services.length > 0 && selectedCount === services.length

  // ── Direct API call helper ─────────────────────────────────────────────

  const apiCall = useCallback(async (body: Record<string, any>) => {
    if (!carrierApiName) throw new Error('Direct API not supported for this carrier')
    const res = await fetch('/api/carriers/direct', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ carrier: carrierApiName, ...body }),
    })
    return res.json()
  }, [carrierApiName])

  // ── Handlers ───────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!direct || !editState) return
    setActionState(prev => ({ ...prev, saving: true, error: null, saveMessage: null }))
    try {
      const data = await apiCall({ action: 'save', connectionId: direct.id, config: editState })
      if (!data.success) throw new Error(data.error || 'Save failed')
      setActionState(prev => ({ ...prev, saving: false, saveMessage: 'Credentials saved' }))
      onDirectConnectionUpdated()
    } catch (err: any) {
      setActionState(prev => ({ ...prev, saving: false, error: err.message }))
    }
  }

  const handleTest = async () => {
    if (!direct) return
    setActionState(prev => ({ ...prev, testing: true, error: null, testResult: null }))
    try {
      const data = await apiCall({ action: 'test', connectionId: direct.id })
      setActionState(prev => ({
        ...prev,
        testing: false,
        testResult: data.result || { success: false, message: data.error || 'Unknown error' },
      }))
      onDirectConnectionUpdated()
    } catch (err: any) {
      setActionState(prev => ({ ...prev, testing: false, testResult: { success: false, message: err.message } }))
    }
  }

  const handleTestLabel = async () => {
    if (!direct) return
    setActionState(prev => ({ ...prev, testingLabel: true, error: null, testLabelResult: null }))
    try {
      const data = await apiCall({ action: 'test-label', connectionId: direct.id })
      setActionState(prev => ({
        ...prev,
        testingLabel: false,
        testLabelResult: data.result || { success: false, error: data.error },
      }))
    } catch (err: any) {
      setActionState(prev => ({ ...prev, testingLabel: false, testLabelResult: { success: false, error: err.message } }))
    }
  }

  const handleDeleteDirect = async () => {
    if (!direct) return
    if (!confirm(`Remove Direct connection "${direct.nickname}"? This will delete credentials.`)) return
    setActionState(prev => ({ ...prev, deleting: true, error: null }))
    try {
      const data = await apiCall({ action: 'delete', connectionId: direct.id })
      if (!data.success) throw new Error(data.error || 'Delete failed')
      onDirectConnectionUpdated()
    } catch (err: any) {
      setActionState(prev => ({ ...prev, deleting: false, error: err.message }))
    }
  }

  const handleAddDirect = async () => {
    setAdding(true)
    setAddError(null)
    try {
      const data = await apiCall({
        action: 'add',
        config: { nickname: addNickname, clientId: addClientId, clientSecret: addClientSecret, accountNumber: addAccountNumber, sandbox: addSandbox },
      })
      if (!data.success) throw new Error(data.error || 'Add failed')
      setShowAddDirect(false)
      setAddNickname('')
      setAddClientId('')
      setAddClientSecret('')
      setAddAccountNumber(account.accountNumber || '')
      setAddSandbox(false)
      onDirectConnectionUpdated()
    } catch (err: any) {
      setAddError(err.message)
    } finally {
      setAdding(false)
    }
  }

  const handleDisconnectShipEngine = async () => {
    if (!shipEngine || !onDisconnectShipEngine) return
    if (!confirm(`Disconnect "${shipEngine.friendly_name}" from ShipEngine? This cannot be undone.`)) return
    setDisconnectingShipEngine(true)
    try {
      onDisconnectShipEngine(shipEngine.carrier_id, shipEngine.carrier_code)
    } finally {
      setDisconnectingShipEngine(false)
    }
  }

  // ── Test suite handlers ────────────────────────────────────────────────

  const handleValidateAddress = async () => {
    if (!direct) return
    setAvLoading(true)
    setAvResult(null)
    try {
      const data = await apiCall({ action: 'validate-address', connectionId: direct.id, address: avAddress })
      setAvResult(data.result || { success: false, candidates: [], error: data.error })
    } catch (err: any) {
      setAvResult({ success: false, candidates: [], error: err.message })
    } finally {
      setAvLoading(false)
    }
  }

  const handleGetRate = async () => {
    if (!direct) return
    setRateLoading(true)
    setRateResult(null)
    try {
      const data = await apiCall({ action: 'get-rate', connectionId: direct.id, serviceCode: rateServiceCode, weight: rateWeight, dims: rateDims })
      setRateResult(data.result || { success: false, serviceCode: rateServiceCode, serviceName: '', error: data.error })
    } catch (err: any) {
      setRateResult({ success: false, serviceCode: rateServiceCode, serviceName: '', error: err.message })
    } finally {
      setRateLoading(false)
    }
  }

  const handleRateShop = async () => {
    if (!direct) return
    setShopLoading(true)
    setShopResults([])
    try {
      const domesticCodes = services.filter(s => s.domestic && s.directCode).map(s => s.directCode!)
      const data = await apiCall({ action: 'rate-shop', connectionId: direct.id, serviceCodes: domesticCodes, weight: rateWeight, dims: rateDims })
      setShopResults(data.results || [])
    } catch (err: any) {
      setShopResults([{ success: false, serviceCode: '', serviceName: 'Error', error: err.message }])
    } finally {
      setShopLoading(false)
    }
  }

  const openLabel = (base64: string, format?: string) => {
    if (format === 'PDF') {
      const binary = atob(base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      window.open(URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })), '_blank')
      return
    }
    const mimeType = format === 'PNG' ? 'image/png' : 'image/gif'
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`<!DOCTYPE html><html><head><title>Test Label (4x6)</title><style>@page{size:4in 6in;margin:0}body{margin:0;display:flex;justify-content:center;align-items:center;background:#f3f4f6;min-height:100vh}img{width:4in;height:6in;object-fit:contain}@media print{body{background:white}}</style></head><body><img src="data:${mimeType};base64,${base64}"/></body></html>`)
    win.document.close()
  }

  const hasCredentialChanges = editState && direct && (
    editState.nickname !== direct.nickname ||
    editState.clientId !== direct.clientId ||
    editState.clientSecret !== direct.clientSecret ||
    editState.accountNumber !== direct.accountNumber ||
    editState.sandbox !== direct.sandbox
  )

  // Get domestic direct services for the test suite rate selector
  const directDomesticServices = services.filter(s => s.domestic && s.directCode)

  // ─── RENDER ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ── Section A: Connection Status ──────────────────────────────────── */}
      {account.isMarketplace && shipEngineCarriers && shipEngineCarriers.length > 0 ? (
        /* Marketplace / funded carriers → show all carriers in a list */
        <div className="rounded-xl border-2 border-blue-300 bg-blue-50/30 p-5 space-y-3">
          <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            ShipEngine Funded Carriers
          </h4>
          <p className="text-xs text-gray-500">
            These carriers are billed through ShipEngine / ShipStation wallet funding.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {shipEngineCarriers.map(se => {
              const icon = se.carrier_code.startsWith('ups') ? '🟤'
                : se.carrier_code.startsWith('fedex') ? '🟣'
                : se.carrier_code.startsWith('usps') || se.carrier_code === 'stamps_com' ? '🔵'
                : se.carrier_code === 'globalpost' ? '🌐' : '📦'
              return (
                <div key={se.carrier_id} className="bg-white rounded-lg border border-blue-200 p-3 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{icon}</span>
                    <span className="text-sm font-semibold text-gray-900">{se.nickname || se.friendly_name}</span>
                  </div>
                  <div className="text-xs text-gray-500">
                    {se.carrier_code} &middot; {se.services?.length || 0} services
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-800">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> Connected
                    </span>
                    {se.requires_funded_amount && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-100 text-purple-800">
                        Wallet
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        /* Standard account → Direct + ShipEngine side-by-side */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Direct Connection Card */}
          <div className={`rounded-xl border-2 p-5 ${direct ? 'border-amber-300 bg-amber-50/30' : 'border-dashed border-gray-300 bg-gray-50'}`}>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                Direct API
              </h4>
              {direct && statusBadge(direct.status)}
            </div>

            {direct ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-500">Account:</span>
                  <span className="font-mono font-medium text-gray-900">{direct.accountNumber}</span>
                  {direct.sandbox && <span className="text-xs text-amber-600 font-medium">(Sandbox)</span>}
                </div>
                {direct.lastTestedAt && (
                  <div className="text-xs text-gray-400">
                    Last tested: {new Date(direct.lastTestedAt).toLocaleDateString()} {new Date(direct.lastTestedAt).toLocaleTimeString()}
                  </div>
                )}
                <div className="flex items-center gap-2 pt-2">
                  <button
                    onClick={() => setExpandCredentials(!expandCredentials)}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                  >
                    {expandCredentials ? 'Hide Credentials' : 'Edit Credentials'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-sm text-gray-500">No Direct API connection</p>
                {carrierApiName && (
                  <button
                    onClick={() => setShowAddDirect(true)}
                    className="mt-2 px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-medium hover:bg-amber-700 transition-colors"
                  >
                    + Add Direct Connection
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ShipEngine Connection Card */}
          <div className={`rounded-xl border-2 p-5 ${shipEngine ? 'border-blue-300 bg-blue-50/30' : 'border-dashed border-gray-300 bg-gray-50'}`}>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                ShipEngine
              </h4>
              {shipEngine && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                  <span className="w-2 h-2 rounded-full bg-green-500" /> Connected
                </span>
              )}
            </div>

            {shipEngine ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-500">Carrier ID:</span>
                  <span className="font-mono text-xs text-gray-700">{shipEngine.carrier_id}</span>
                </div>
                {shipEngine.account_number && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-gray-500">Account:</span>
                    <span className="font-mono font-medium text-gray-900">{shipEngine.account_number}</span>
                  </div>
                )}
                <div className="text-xs text-gray-500">
                  {shipEngine.services?.length || 0} services available
                </div>
                {onDisconnectShipEngine && (
                  <button
                    onClick={handleDisconnectShipEngine}
                    disabled={disconnectingShipEngine}
                    className="text-xs text-red-600 hover:text-red-800 font-medium pt-1"
                  >
                    {disconnectingShipEngine ? 'Disconnecting...' : 'Disconnect'}
                  </button>
                )}
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-sm text-gray-500">Not connected via ShipEngine</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Add Direct Connection Form ───────────────────────────────────── */}
      {showAddDirect && carrierApiName && (
        <div className="bg-white border-2 border-amber-300 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
              New {carrierNetwork.toUpperCase()} Direct Connection
            </h4>
            <button onClick={() => setShowAddDirect(false)} className="text-gray-400 hover:text-gray-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          {addError && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{addError}</div>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Nickname</label>
              <input type="text" value={addNickname} onChange={e => setAddNickname(e.target.value)} placeholder='e.g. "E-COM" or "Wholesale"' className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Client ID</label>
              <input type="text" value={addClientId} onChange={e => setAddClientId(e.target.value)} placeholder="From Developer Portal" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Client Secret</label>
              <input type="password" value={addClientSecret} onChange={e => setAddClientSecret(e.target.value)} placeholder="••••••••" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Account Number</label>
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
            <button onClick={() => setShowAddDirect(false)} className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors">Cancel</button>
            <button onClick={handleAddDirect} disabled={adding || !addClientId || !addClientSecret || !addAccountNumber} className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {adding ? 'Adding...' : 'Add Connection'}
            </button>
          </div>
        </div>
      )}

      {/* ── Credentials Editor (collapsible) ─────────────────────────────── */}
      {expandCredentials && direct && editState && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Direct API Credentials</h4>
          {direct.status === 'error' && direct.lastError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{direct.lastError}</div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Nickname</label>
              <input type="text" value={editState.nickname} onChange={e => setEditState(p => p ? { ...p, nickname: e.target.value } : p)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Client ID</label>
              <input type="text" value={editState.clientId} onChange={e => setEditState(p => p ? { ...p, clientId: e.target.value } : p)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Client Secret</label>
              <input type="password" value={editState.clientSecret} onChange={e => setEditState(p => p ? { ...p, clientSecret: e.target.value } : p)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Account Number</label>
              <input type="text" value={editState.accountNumber} onChange={e => setEditState(p => p ? { ...p, accountNumber: e.target.value } : p)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer py-2">
                <input type="checkbox" checked={editState.sandbox} onChange={e => setEditState(p => p ? { ...p, sandbox: e.target.checked } : p)} className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <span className="text-sm text-gray-700">Sandbox / Testing Mode</span>
              </label>
            </div>
          </div>

          {actionState.error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{actionState.error}</div>}
          {actionState.saveMessage && <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700">{actionState.saveMessage}</div>}

          <div className="flex items-center gap-3 flex-wrap">
            <button onClick={handleSave} disabled={actionState.saving || !editState.clientId || !editState.clientSecret || !editState.accountNumber} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {actionState.saving ? 'Saving...' : hasCredentialChanges ? 'Save Changes' : 'Save'}
            </button>
            <button onClick={handleTest} disabled={actionState.testing || !!hasCredentialChanges} className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {actionState.testing ? <span className="flex items-center gap-2"><Spinner /> Testing...</span> : 'Test Connection'}
            </button>
            <button onClick={handleTestLabel} disabled={actionState.testingLabel || direct.status !== 'connected' || !!hasCredentialChanges} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {actionState.testingLabel ? <span className="flex items-center gap-2"><Spinner /> Generating...</span> : 'Test Label'}
            </button>
            <button onClick={handleDeleteDirect} disabled={actionState.deleting} className="px-4 py-2 text-red-600 border border-red-200 rounded-lg text-sm font-medium hover:bg-red-50 disabled:opacity-50 transition-colors ml-auto">
              {actionState.deleting ? 'Removing...' : 'Remove Connection'}
            </button>
          </div>

          {/* Test result */}
          {actionState.testResult && (
            <div className={`border rounded-xl p-5 ${actionState.testResult.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              <p className={`font-semibold text-sm ${actionState.testResult.success ? 'text-green-800' : 'text-red-800'}`}>{actionState.testResult.message}</p>
              {actionState.testResult.details?.validatedAddress && (
                <p className="mt-2 text-xs font-mono text-gray-600 bg-white/50 rounded p-2">
                  {actionState.testResult.details.validatedAddress.street}, {actionState.testResult.details.validatedAddress.city}, {actionState.testResult.details.validatedAddress.state} {actionState.testResult.details.validatedAddress.postalCode} ({actionState.testResult.details.residentialIndicator})
                </p>
              )}
              {actionState.testResult.error && !actionState.testResult.success && <p className="mt-2 text-xs font-mono text-red-600 bg-white/50 rounded p-2 break-all">{actionState.testResult.error}</p>}
            </div>
          )}

          {/* Test label result */}
          {actionState.testLabelResult && (
            <div className={`border rounded-xl p-5 ${actionState.testLabelResult.success ? 'bg-blue-50 border-blue-200' : 'bg-red-50 border-red-200'}`}>
              <p className={`font-semibold text-sm ${actionState.testLabelResult.success ? 'text-blue-800' : 'text-red-800'}`}>
                {actionState.testLabelResult.success ? 'Test label generated' : 'Label generation failed'}
              </p>
              {actionState.testLabelResult.success && (
                <div className="mt-2 flex items-center gap-4 text-xs">
                  <span>Tracking: <span className="font-mono font-medium">{actionState.testLabelResult.trackingNumber}</span></span>
                  <span>Charges: <span className="font-medium">{actionState.testLabelResult.totalCharges || 'N/A'}</span></span>
                  {actionState.testLabelResult.labelBase64 && (
                    <button onClick={() => openLabel(actionState.testLabelResult!.labelBase64!, actionState.testLabelResult!.labelFormat)} className="px-3 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700">View 4x6 Label</button>
                  )}
                </div>
              )}
              {actionState.testLabelResult.error && <p className="mt-2 text-xs font-mono text-red-600 bg-white/50 rounded p-2 break-all">{actionState.testLabelResult.error}</p>}
            </div>
          )}
        </div>
      )}

      {/* ── Section B: Test Suite (Direct only) ──────────────────────────── */}
      {direct && direct.status === 'connected' && (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <button onClick={() => setTestSuiteOpen(!testSuiteOpen)} className="w-full px-5 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors text-left">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">API Test Suite</h4>
            <svg className={`w-4 h-4 text-gray-400 transition-transform ${testSuiteOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>

          {testSuiteOpen && (
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
                <button onClick={handleValidateAddress} disabled={avLoading} className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
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
                    <option value="">Select service...</option>
                    {directDomesticServices.map(s => <option key={s.identity} value={s.directCode}>{s.displayName}</option>)}
                  </select>
                  <input type="text" value={rateWeight} onChange={e => setRateWeight(e.target.value)} placeholder="Weight (lbs)" className="px-2 py-1.5 border border-gray-300 rounded text-sm" />
                  <input type="text" value={rateDims.length} onChange={e => setRateDims(p => ({ ...p, length: e.target.value }))} placeholder="L" className="px-2 py-1.5 border border-gray-300 rounded text-sm" />
                  <div className="flex gap-1">
                    <input type="text" value={rateDims.width} onChange={e => setRateDims(p => ({ ...p, width: e.target.value }))} placeholder="W" className="px-2 py-1.5 border border-gray-300 rounded text-sm w-1/2" />
                    <input type="text" value={rateDims.height} onChange={e => setRateDims(p => ({ ...p, height: e.target.value }))} placeholder="H" className="px-2 py-1.5 border border-gray-300 rounded text-sm w-1/2" />
                  </div>
                </div>
                <button onClick={handleGetRate} disabled={rateLoading || !rateServiceCode} className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
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
                <button onClick={handleRateShop} disabled={shopLoading} className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
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
                              {r.success ? <span className="text-green-600 font-medium">OK</span> : <span className="text-red-500" title={r.error}>Failed</span>}
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
      )}

      {/* ── Section C: Unified Service List ──────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-gray-700">
            Services ({selectedCount}/{services.length} selected)
          </h4>
          <div className="flex items-center gap-3">
            <div className="inline-flex rounded-md border border-gray-300 bg-white text-xs">
              {([
                { key: 'all' as const, label: 'All', count: services.length },
                { key: 'domestic' as const, label: 'Domestic', count: services.filter(s => s.domestic).length },
                { key: 'international' as const, label: 'Intl', count: services.filter(s => s.international).length },
              ]).map(f => (
                <button
                  key={f.key}
                  onClick={() => setServiceFilter(f.key)}
                  className={`px-2.5 py-1 font-medium transition-colors first:rounded-l-md last:rounded-r-md ${
                    serviceFilter === f.key ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {f.label} ({f.count})
                </button>
              ))}
            </div>
            <button
              onClick={allSelected ? onDeselectAll : onSelectAll}
              className="text-xs font-medium text-blue-600 hover:text-blue-800"
            >
              {allSelected ? 'Deselect All' : 'Select All'}
            </button>
          </div>
        </div>

        {filteredServices.length === 0 ? (
          <p className="text-sm text-gray-500 py-4 text-center">
            No {serviceFilter !== 'all' ? serviceFilter : ''} services available for this account.
          </p>
        ) : account.isMarketplace && shipEngineCarriers && shipEngineCarriers.length > 1 ? (
          /* ── Marketplace: group services by carrier ──────────────────────── */
          <div className="space-y-3">
            {shipEngineCarriers.map(se => {
              const carrierSvcs = filteredServices.filter(s => s.shipEngineCarrierId === se.carrier_id)
              if (carrierSvcs.length === 0) return null
              const carrierSelectedCount = carrierSvcs.filter(s => selectedIdentities.has(s.identity)).length
              const carrierAllSelected = carrierSvcs.length > 0 && carrierSelectedCount === carrierSvcs.length
              const isCollapsed = collapsedCarriers.has(se.carrier_id)
              const icon = se.carrier_code.startsWith('ups') ? '🟤'
                : se.carrier_code.startsWith('fedex') ? '🟣'
                : se.carrier_code.startsWith('usps') || se.carrier_code === 'stamps_com' ? '🔵'
                : se.carrier_code === 'globalpost' ? '🌐' : '📦'

              return (
                <div key={se.carrier_id} className="border border-gray-200 rounded-xl overflow-hidden">
                  <button
                    onClick={() => toggleCarrierCollapse(se.carrier_id)}
                    className="w-full bg-gray-50 px-4 py-2.5 flex items-center justify-between hover:bg-gray-100 transition-colors text-left"
                  >
                    <div className="flex items-center gap-2">
                      <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isCollapsed ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                      <span className="text-base">{icon}</span>
                      <span className="text-sm font-semibold text-gray-800">{se.nickname || se.friendly_name}</span>
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${
                        carrierSelectedCount === 0 ? 'bg-gray-100 text-gray-500' :
                        carrierAllSelected ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {carrierSelectedCount}/{carrierSvcs.length}
                      </span>
                    </div>
                    <span
                      onClick={(e) => {
                        e.stopPropagation()
                        if (carrierAllSelected) {
                          if (onBatchDeselect) {
                            onBatchDeselect(carrierSvcs.map(s => s.identity))
                          } else {
                            for (const svc of carrierSvcs) onToggleService(svc)
                          }
                        } else {
                          const toSelect = carrierSvcs.filter(s => !selectedIdentities.has(s.identity))
                          if (onBatchSelect) {
                            onBatchSelect(toSelect)
                          } else {
                            for (const svc of toSelect) onToggleService(svc)
                          }
                        }
                      }}
                      className="text-xs font-medium text-blue-600 hover:text-blue-800"
                    >
                      {carrierAllSelected ? 'Deselect All' : 'Select All'}
                    </span>
                  </button>
                  {!isCollapsed && (
                    <div className="p-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                      {carrierSvcs.map(svc => {
                        const checked = selectedIdentities.has(svc.identity)
                        return (
                          <div
                            key={svc.identity}
                            onClick={() => onToggleService(svc)}
                            className={`flex items-center gap-3 bg-white rounded border-2 px-3 py-2.5 cursor-pointer transition-colors ${
                              checked ? 'border-green-400 bg-green-50' : 'border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            <input type="checkbox" checked={checked} readOnly className="w-4 h-4 text-green-600 rounded border-gray-300 focus:ring-green-500 cursor-pointer shrink-0" />
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium text-gray-900 truncate">{svc.displayName}</div>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-blue-100 text-blue-800">ShipEngine</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {svc.domestic && <span className="w-2 h-2 rounded-full bg-green-400" title="Domestic" />}
                              {svc.international && <span className="w-2 h-2 rounded-full bg-blue-400" title="International" />}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          /* ── Standard flat service grid ──────────────────────────────────── */
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            {filteredServices.map(svc => {
              const checked = selectedIdentities.has(svc.identity)
              return (
                <div
                  key={svc.identity}
                  onClick={() => onToggleService(svc)}
                  className={`flex items-center gap-3 bg-white rounded border-2 px-3 py-2.5 cursor-pointer transition-colors ${
                    checked ? 'border-green-400 bg-green-50' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    readOnly
                    className="w-4 h-4 text-green-600 rounded border-gray-300 focus:ring-green-500 cursor-pointer shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {svc.displayName}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {svc.paths.includes('direct') && (
                        <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-amber-100 text-amber-800">
                          Direct
                        </span>
                      )}
                      {svc.paths.includes('shipengine') && (
                        <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-blue-100 text-blue-800">
                          ShipEngine
                        </span>
                      )}
                      {svc.paths.length === 2 && (
                        <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-green-100 text-green-800">
                          Fallback
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {svc.domestic && <span className="w-2 h-2 rounded-full bg-green-400" title="Domestic" />}
                    {svc.international && <span className="w-2 h-2 rounded-full bg-blue-400" title="International" />}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
