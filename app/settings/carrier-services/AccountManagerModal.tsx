'use client'

import { useState, useCallback } from 'react'
import type { UnifiedAccount, DirectConnectionConfig } from '../carriers/types'

// ─── Types ────────────────────────────────────────────────────────────────────

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

interface Props {
  account: UnifiedAccount
  onClose: () => void
  onDirectConnectionUpdated: () => void
  onDisconnectShipEngine?: (carrierId: string, carrierCode: string) => void
}

// ─── Shared UI ────────────────────────────────────────────────────────────────

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

// ─── Component ────────────────────────────────────────────────────────────────

export default function AccountManagerModal({ account, onClose, onDirectConnectionUpdated, onDisconnectShipEngine }: Props) {
  const { direct, shipEngine, services, carrierNetwork } = account
  const carrierApiName = carrierNetwork === 'ups' ? 'ups' : carrierNetwork === 'fedex' ? 'fedex' : null

  // Direct connection management
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
  const [disconnectingSE, setDisconnectingSE] = useState(false)

  // Test suite
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

  const [activeSection, setActiveSection] = useState<'connections' | 'tests'>('connections')

  const directDomesticServices = services.filter(s => s.domestic && s.directCode)

  // API helper
  const apiCall = useCallback(async (body: Record<string, any>) => {
    if (!carrierApiName) throw new Error('Direct API not supported for this carrier')
    const res = await fetch('/api/carriers/direct', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ carrier: carrierApiName, ...body }),
    })
    return res.json()
  }, [carrierApiName])

  // ── Handlers ────────────────────────────────────────────────────────────

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
    if (!confirm(`Remove Direct connection "${direct.nickname}"?`)) return
    setActionState(prev => ({ ...prev, deleting: true, error: null }))
    try {
      const data = await apiCall({ action: 'delete', connectionId: direct.id })
      if (!data.success) throw new Error(data.error || 'Delete failed')
      onDirectConnectionUpdated()
      onClose()
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
      onDirectConnectionUpdated()
    } catch (err: any) {
      setAddError(err.message)
    } finally {
      setAdding(false)
    }
  }

  const handleDisconnectSE = async () => {
    if (!shipEngine || !onDisconnectShipEngine) return
    if (!confirm(`Disconnect "${shipEngine.friendly_name}" from ShipEngine?`)) return
    setDisconnectingSE(true)
    try {
      onDisconnectShipEngine(shipEngine.carrier_id, shipEngine.carrier_code)
      onClose()
    } finally {
      setDisconnectingSE(false)
    }
  }

  // Test suite handlers
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
      const domesticCodes = directDomesticServices.map(s => s.directCode!)
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

  // ── RENDER ──────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-start justify-center min-h-screen px-4 pt-16 pb-8">
        <div className="fixed inset-0 transition-opacity" onClick={onClose}>
          <div className="absolute inset-0 bg-gray-500 opacity-75" />
        </div>

        <div className="relative z-10 bg-white rounded-xl shadow-2xl w-full max-w-3xl">
          {/* Header */}
          <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex items-center justify-between rounded-t-xl">
            <div className="flex items-center gap-3">
              <span className="text-xl">{account.icon}</span>
              <div>
                <h3 className="text-lg font-bold text-gray-900">{account.nickname}</h3>
                {account.accountNumber && (
                  <p className="text-xs font-mono text-gray-500">Account: {account.accountNumber}</p>
                )}
              </div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          {/* Tab selector */}
          <div className="border-b border-gray-200 px-6">
            <nav className="-mb-px flex gap-6">
              {(['connections', 'tests'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveSection(tab)}
                  className={`py-3 border-b-2 text-sm font-medium transition-colors ${
                    activeSection === tab
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {tab === 'connections' ? 'Connections' : 'API Test Suite'}
                </button>
              ))}
            </nav>
          </div>

          <div className="p-6 max-h-[70vh] overflow-y-auto space-y-6">
            {activeSection === 'connections' && (
              <>
                {/* Marketplace info */}
                {account.isMarketplace && account.shipEngineCarriers && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4 space-y-2">
                    <h4 className="text-sm font-semibold text-gray-700">ShipEngine Funded Carriers</h4>
                    <p className="text-xs text-gray-500">These carriers are billed through ShipEngine wallet funding.</p>
                    <div className="grid grid-cols-2 gap-2">
                      {account.shipEngineCarriers.map(se => (
                        <div key={se.carrier_id} className="bg-white rounded border border-blue-200 p-2 text-xs">
                          <span className="font-medium">{se.nickname || se.friendly_name}</span>
                          <span className="text-gray-400 ml-1">{se.carrier_code}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Direct Connection */}
                {!account.isMarketplace && (
                  <div className={`rounded-lg border-2 p-5 ${direct ? 'border-amber-300 bg-amber-50/30' : 'border-dashed border-gray-300 bg-gray-50'}`}>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-amber-500" /> Direct API
                      </h4>
                      {direct && statusBadge(direct.status)}
                    </div>

                    {direct && editState ? (
                      <div className="space-y-4">
                        {direct.status === 'error' && direct.lastError && (
                          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{direct.lastError}</div>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                              <span className="text-sm text-gray-700">Sandbox</span>
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
                            {actionState.deleting ? 'Removing...' : 'Remove'}
                          </button>
                        </div>

                        {actionState.testResult && (
                          <div className={`border rounded-lg p-4 ${actionState.testResult.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                            <p className={`font-semibold text-sm ${actionState.testResult.success ? 'text-green-800' : 'text-red-800'}`}>{actionState.testResult.message}</p>
                            {actionState.testResult.details?.validatedAddress && (
                              <p className="mt-2 text-xs font-mono text-gray-600 bg-white/50 rounded p-2">
                                {actionState.testResult.details.validatedAddress.street}, {actionState.testResult.details.validatedAddress.city}, {actionState.testResult.details.validatedAddress.state} {actionState.testResult.details.validatedAddress.postalCode} ({actionState.testResult.details.residentialIndicator})
                              </p>
                            )}
                            {actionState.testResult.error && !actionState.testResult.success && <p className="mt-2 text-xs font-mono text-red-600 break-all">{actionState.testResult.error}</p>}
                          </div>
                        )}

                        {actionState.testLabelResult && (
                          <div className={`border rounded-lg p-4 ${actionState.testLabelResult.success ? 'bg-blue-50 border-blue-200' : 'bg-red-50 border-red-200'}`}>
                            <p className={`font-semibold text-sm ${actionState.testLabelResult.success ? 'text-blue-800' : 'text-red-800'}`}>
                              {actionState.testLabelResult.success ? 'Test label generated' : 'Label generation failed'}
                            </p>
                            {actionState.testLabelResult.success && (
                              <div className="mt-2 flex items-center gap-4 text-xs">
                                <span>Tracking: <span className="font-mono font-medium">{actionState.testLabelResult.trackingNumber}</span></span>
                                <span>Charges: <span className="font-medium">{actionState.testLabelResult.totalCharges || 'N/A'}</span></span>
                                {actionState.testLabelResult.labelBase64 && (
                                  <button onClick={() => openLabel(actionState.testLabelResult!.labelBase64!, actionState.testLabelResult!.labelFormat)} className="px-3 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700">View Label</button>
                                )}
                              </div>
                            )}
                            {actionState.testLabelResult.error && <p className="mt-2 text-xs font-mono text-red-600 break-all">{actionState.testLabelResult.error}</p>}
                          </div>
                        )}
                      </div>
                    ) : !direct ? (
                      <div className="text-center py-4">
                        <p className="text-sm text-gray-500">No Direct API connection</p>
                        {carrierApiName && !showAddDirect && (
                          <button onClick={() => setShowAddDirect(true)} className="mt-2 px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-medium hover:bg-amber-700 transition-colors">
                            + Add Direct Connection
                          </button>
                        )}
                      </div>
                    ) : null}
                  </div>
                )}

                {/* Add Direct form */}
                {showAddDirect && carrierApiName && !direct && (
                  <div className="bg-white border-2 border-amber-300 rounded-lg p-5 space-y-4">
                    <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">New {carrierNetwork.toUpperCase()} Direct Connection</h4>
                    {addError && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{addError}</div>}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="md:col-span-2">
                        <label className="block text-xs font-medium text-gray-600 mb-1">Nickname</label>
                        <input type="text" value={addNickname} onChange={e => setAddNickname(e.target.value)} placeholder='e.g. "E-COM"' className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Client ID</label>
                        <input type="text" value={addClientId} onChange={e => setAddClientId(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Client Secret</label>
                        <input type="password" value={addClientSecret} onChange={e => setAddClientSecret(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Account Number</label>
                        <input type="text" value={addAccountNumber} onChange={e => setAddAccountNumber(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500" />
                      </div>
                      <div className="flex items-end">
                        <label className="flex items-center gap-2 cursor-pointer py-2">
                          <input type="checkbox" checked={addSandbox} onChange={e => setAddSandbox(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500" />
                          <span className="text-sm text-gray-700">Sandbox</span>
                        </label>
                      </div>
                    </div>
                    <div className="flex justify-end gap-3">
                      <button onClick={() => setShowAddDirect(false)} className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
                      <button onClick={handleAddDirect} disabled={adding || !addClientId || !addClientSecret || !addAccountNumber} className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed">
                        {adding ? 'Adding...' : 'Add Connection'}
                      </button>
                    </div>
                  </div>
                )}

                {/* ShipEngine Connection */}
                {!account.isMarketplace && (
                  <div className={`rounded-lg border-2 p-5 ${shipEngine ? 'border-blue-300 bg-blue-50/30' : 'border-dashed border-gray-300 bg-gray-50'}`}>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-500" /> ShipEngine
                      </h4>
                      {shipEngine && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                          <span className="w-2 h-2 rounded-full bg-green-500" /> Connected
                        </span>
                      )}
                    </div>

                    {shipEngine ? (
                      <div className="space-y-2">
                        <div className="text-sm"><span className="text-gray-500">Carrier ID:</span> <span className="font-mono text-xs text-gray-700">{shipEngine.carrier_id}</span></div>
                        {shipEngine.account_number && (
                          <div className="text-sm"><span className="text-gray-500">Account:</span> <span className="font-mono font-medium">{shipEngine.account_number}</span></div>
                        )}
                        <div className="text-xs text-gray-500">{shipEngine.services?.length || 0} services available</div>
                        {onDisconnectShipEngine && (
                          <button onClick={handleDisconnectSE} disabled={disconnectingSE} className="text-xs text-red-600 hover:text-red-800 font-medium pt-1">
                            {disconnectingSE ? 'Disconnecting...' : 'Disconnect'}
                          </button>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 text-center py-4">Not connected via ShipEngine</p>
                    )}
                  </div>
                )}
              </>
            )}

            {activeSection === 'tests' && (
              <>
                {!direct ? (
                  <div className="text-center py-8 text-gray-500">
                    <p className="text-sm">No Direct API connection for this account.</p>
                    <p className="text-xs mt-1 text-gray-400">API tests require a Direct connection.</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {direct.status !== 'connected' && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                        Connection is untested. <strong>Test Connection</strong> on the Connections tab first.
                      </div>
                    )}

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

                    {/* Rate Check */}
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
                      <h5 className="text-sm font-semibold text-gray-700">Rate Shop (All Domestic)</h5>
                      <p className="text-xs text-gray-500">Uses the weight/dims from Rate Check above.</p>
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
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
