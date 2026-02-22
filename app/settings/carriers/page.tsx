'use client'

import { useState, useEffect, useCallback } from 'react'
import type {
  ShipEngineCarrier,
  DirectConnections,
  UnifiedAccount,
  UnifiedService,
  CarrierTab,
} from './types'
import { unifyAccounts } from './unifyAccounts'
import AccountTab from './AccountTab'
import ConnectCarrierModal from './ConnectCarrierModal'
import CarrierSettingsModal from './CarrierSettingsModal'

// ─── Selected service format (persisted to AppSetting) ───────────────────────

interface SelectedService {
  carrierId: string
  carrierCode: string
  carrierName: string
  serviceCode: string
  serviceName: string
  accountNickname?: string | null
  domestic?: boolean
  international?: boolean
  // Unified routing fields
  identity?: string
  directConnectionId?: string
  directCode?: string
  fallbackCarrierId?: string
  fallbackServiceCode?: string
  fallbackCarrierCode?: string
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function CarriersPage() {
  const [carriers, setCarriers] = useState<ShipEngineCarrier[]>([])
  const [directConnections, setDirectConnections] = useState<DirectConnections>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [accounts, setAccounts] = useState<UnifiedAccount[]>([])
  const [activeTab, setActiveTab] = useState<CarrierTab>('')

  const [selectedServices, setSelectedServices] = useState<SelectedService[]>([])
  const [savedServices, setSavedServices] = useState<SelectedService[]>([])
  const [saving, setSaving] = useState(false)
  const [showConnectModal, setShowConnectModal] = useState(false)
  const [settingsCarrier, setSettingsCarrier] = useState<ShipEngineCarrier | null>(null)
  const [disconnecting, setDisconnecting] = useState<string | null>(null)

  const [showHelper, setShowHelper] = useState(false)
  const [globalEStatus, setGlobalEStatus] = useState<{ configured: boolean; guidPrefix: string | null } | null>(null)
  const [showGlobalEPopover, setShowGlobalEPopover] = useState(false)

  const hasChanges = JSON.stringify(selectedServices) !== JSON.stringify(savedServices)

  // ── Data loading ─────────────────────────────────────────────────────────

  const fetchCarriers = useCallback(async () => {
    try {
      const response = await fetch('/api/shipengine/carriers?includeServices=true')
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to fetch carriers')
      return data.carriers || []
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load carriers'
      console.error('Error fetching carriers:', err)
      setError(message)
      return []
    }
  }, [])

  const fetchDirectConnections = useCallback(async () => {
    try {
      const response = await fetch('/api/carriers/direct')
      const data = await response.json()
      return data.connections || {}
    } catch (err) {
      console.error('Error fetching direct connections:', err)
      return {}
    }
  }, [])

  const fetchSelectedServices = useCallback(async () => {
    try {
      const response = await fetch('/api/settings')
      const data = await response.json()
      if (response.ok && data.settings) {
        const setting = data.settings.find((s: { key: string }) => s.key === 'selected_services')
        if (setting?.value?.services) {
          setSelectedServices(setting.value.services)
          setSavedServices(setting.value.services)
        }
      }
    } catch (err) {
      console.error('Error fetching selected services:', err)
    }
  }, [])

  const fetchGlobalEStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/carriers/global-e/status')
      const data = await res.json()
      setGlobalEStatus(data)
    } catch {
      setGlobalEStatus({ configured: false, guidPrefix: null })
    }
  }, [])

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [seCarriers, dConns] = await Promise.all([
      fetchCarriers(),
      fetchDirectConnections(),
    ])
    fetchGlobalEStatus()
    setCarriers(seCarriers)
    setDirectConnections(dConns)
    const unified = unifyAccounts(seCarriers, dConns)
    setAccounts(unified)
    if (unified.length > 0 && !activeTab) {
      setActiveTab(unified[0].id)
    }
    setLoading(false)
  }, [fetchCarriers, fetchDirectConnections, activeTab])

  useEffect(() => {
    loadAll()
    fetchSelectedServices()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-unify when carriers or direct connections change
  useEffect(() => {
    const unified = unifyAccounts(carriers, directConnections)
    setAccounts(unified)
    // If active tab was removed, select first
    if (unified.length > 0 && !unified.find(a => a.id === activeTab)) {
      setActiveTab(unified[0].id)
    }
  }, [carriers, directConnections]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Save ───────────────────────────────────────────────────────────────

  const saveSelection = async () => {
    try {
      setSaving(true)
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: 'selected_services',
          value: { services: selectedServices },
        }),
      })
      if (!response.ok) throw new Error('Failed to save')
      setSavedServices([...selectedServices])
    } catch (err) {
      console.error('Error saving services:', err)
      alert('Failed to save service selection')
    } finally {
      setSaving(false)
    }
  }

  // ── Service toggle / select helpers ────────────────────────────────────

  // Build the set of carrierIds that belong to a given account
  const getAccountCarrierIds = (account: UnifiedAccount): Set<string> => {
    const ids = new Set<string>()
    if (account.direct?.id) ids.add(account.direct.id)
    if (account.shipEngine?.carrier_id) ids.add(account.shipEngine.carrier_id)
    if (account.shipEngineCarriers) {
      for (const se of account.shipEngineCarriers) ids.add(se.carrier_id)
    }
    return ids
  }

  const selectedIdentitiesForAccount = useCallback(
    (account: UnifiedAccount): Set<string> => {
      const accountIds = getAccountCarrierIds(account)
      const set = new Set<string>()
      for (const svc of selectedServices) {
        if (!svc.identity) continue
        if (accountIds.has(svc.carrierId) || accountIds.has(svc.directConnectionId || '')) {
          set.add(svc.identity)
        }
      }
      return set
    },
    [selectedServices],
  )

  const buildSelectedService = (account: UnifiedAccount, svc: UnifiedService): SelectedService => {
    const preferDirect = svc.paths.includes('direct') && svc.directConnectionId && svc.directCode
    const carrierNetworkUpper = account.carrierNetwork.toUpperCase()

    if (preferDirect) {
      return {
        carrierId: svc.directConnectionId!,
        carrierCode: `${account.carrierNetwork}-direct`,
        carrierName: `${carrierNetworkUpper} Direct - ${account.direct?.nickname || account.nickname}`,
        serviceCode: `${account.carrierNetwork}-direct:${svc.directCode}`,
        serviceName: svc.displayName,
        accountNickname: account.direct?.nickname || account.nickname,
        domestic: svc.domestic,
        international: svc.international,
        identity: svc.identity,
        directConnectionId: svc.directConnectionId,
        directCode: svc.directCode,
        fallbackCarrierId: svc.shipEngineCarrierId || undefined,
        fallbackServiceCode: svc.shipEngineServiceCode || undefined,
        fallbackCarrierCode: svc.shipEngineCarrierCode || account.shipEngine?.carrier_code || undefined,
      }
    }

    return {
      carrierId: svc.shipEngineCarrierId || '',
      carrierCode: svc.shipEngineCarrierCode || account.shipEngine?.carrier_code || account.carrierNetwork,
      carrierName: svc.shipEngineCarrierName || account.shipEngine?.friendly_name || account.nickname,
      serviceCode: svc.shipEngineServiceCode || '',
      serviceName: svc.displayName,
      accountNickname: svc.shipEngineCarrierName || account.shipEngine?.nickname || account.nickname,
      domestic: svc.domestic,
      international: svc.international,
      identity: svc.identity,
    }
  }

  // Match a selected service to an account by carrierId
  const belongsToAccount = (s: SelectedService, account: UnifiedAccount): boolean => {
    const accountIds = getAccountCarrierIds(account)
    return accountIds.has(s.carrierId) || accountIds.has(s.directConnectionId || '')
  }

  const toggleServiceForAccount = (account: UnifiedAccount, svc: UnifiedService) => {
    setSelectedServices(prev => {
      const exists = prev.some(s => s.identity === svc.identity && belongsToAccount(s, account))
      if (exists) {
        return prev.filter(s => !(s.identity === svc.identity && belongsToAccount(s, account)))
      }
      return [...prev, buildSelectedService(account, svc)]
    })
  }

  const selectAllForAccount = (account: UnifiedAccount) => {
    setSelectedServices(prev => {
      const withoutAccount = prev.filter(s => !belongsToAccount(s, account))
      const allNew = account.services.map(svc => buildSelectedService(account, svc))
      return [...withoutAccount, ...allNew]
    })
  }

  const deselectAllForAccount = (account: UnifiedAccount) => {
    setSelectedServices(prev => prev.filter(s => !belongsToAccount(s, account)))
  }

  const batchSelectForAccount = (account: UnifiedAccount, svcs: UnifiedService[]) => {
    setSelectedServices(prev => {
      const accountIds = getAccountCarrierIds(account)
      const existingForAccount = new Set(
        prev.filter(s => accountIds.has(s.carrierId) || accountIds.has(s.directConnectionId || ''))
            .map(s => s.identity)
            .filter(Boolean)
      )
      const newEntries = svcs
        .filter(svc => !existingForAccount.has(svc.identity))
        .map(svc => buildSelectedService(account, svc))
      return [...prev, ...newEntries]
    })
  }

  const batchDeselectIdentities = (identities: string[]) => {
    const idSet = new Set(identities)
    setSelectedServices(prev => prev.filter(s => !s.identity || !idSet.has(s.identity)))
  }

  // ── Carrier management callbacks ───────────────────────────────────────

  const handleDirectConnectionUpdated = useCallback(async () => {
    const dConns = await fetchDirectConnections()
    setDirectConnections(dConns)
  }, [fetchDirectConnections])

  const handleDisconnectShipEngine = useCallback(async (carrierId: string, carrierCode: string) => {
    if (!confirm('Are you sure you want to disconnect this carrier? This cannot be undone.')) return
    try {
      setDisconnecting(carrierId)
      const response = await fetch(
        `/api/shipengine/carriers/connect?carrier_name=${carrierCode}&carrier_id=${carrierId}`,
        { method: 'DELETE' },
      )
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to disconnect')
      // Remove services for this carrier and refresh
      setSelectedServices(prev => prev.filter(s => s.carrierId !== carrierId))
      setSavedServices(prev => prev.filter(s => s.carrierId !== carrierId))
      const seCarriers = await fetchCarriers()
      setCarriers(seCarriers)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to disconnect'
      alert(message)
    } finally {
      setDisconnecting(null)
    }
  }, [fetchCarriers])

  const handleRefresh = async () => {
    await loadAll()
  }

  // ── Active account ─────────────────────────────────────────────────────

  const activeAccount = accounts.find(a => a.id === activeTab)
  const normalAccounts = accounts.filter(a => !a.isMarketplace)
  const marketplaceAccounts = accounts.filter(a => a.isMarketplace)

  // ── RENDER ─────────────────────────────────────────────────────────────

  return (
    <div className="p-8">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-3xl font-bold">Carriers</h1>
          <p className="text-gray-600 mt-1">
            Manage your carrier accounts and select which services to use across the app
          </p>
        </div>
        <div className="flex items-center gap-3">
          {globalEStatus && (
            <div className="relative">
              <button
                onClick={() => setShowGlobalEPopover(!showGlobalEPopover)}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                  globalEStatus.configured
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                    : 'border-gray-300 bg-gray-50 text-gray-500 hover:bg-gray-100'
                }`}
              >
                <span>🌍</span>
                Global-E
                <span className={`w-1.5 h-1.5 rounded-full ${globalEStatus.configured ? 'bg-emerald-500' : 'bg-gray-400'}`} />
              </button>
              {showGlobalEPopover && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowGlobalEPopover(false)} />
                  <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-xl shadow-lg border border-gray-200 p-4 z-50">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                        <span>🌍</span> Global-E
                      </h4>
                      {globalEStatus.configured ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Configured
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-600">
                          Not Configured
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 leading-relaxed">
                      International shipping partner &amp; merchant of record. Handles duties, taxes, and label generation for international orders.
                    </p>
                    {globalEStatus.configured && globalEStatus.guidPrefix && (
                      <div className="mt-2 flex items-center gap-2 text-xs">
                        <span className="text-gray-500">GUID:</span>
                        <span className="font-mono text-gray-700">{globalEStatus.guidPrefix}</span>
                      </div>
                    )}
                    {!globalEStatus.configured && (
                      <p className="mt-2 text-[10px] text-gray-400">
                        Set <code className="bg-gray-100 px-1 rounded">GLOBAL_E_GUID</code> in environment variables to enable.
                      </p>
                    )}
                    <p className="mt-2 text-[10px] text-amber-600 font-medium">
                      Not yet tested — awaiting first international order
                    </p>
                  </div>
                </>
              )}
            </div>
          )}
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 disabled:opacity-50 text-sm"
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
          <button
            onClick={() => setShowConnectModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium text-sm"
          >
            + Add Carrier Account
          </button>
        </div>
      </div>

      {/* Connection types helper */}
      <div className="mb-4">
        <button
          onClick={() => setShowHelper(!showHelper)}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          {showHelper ? 'Hide' : 'What do'} Direct, ShipEngine Connected, and ShipEngine Funded mean?
        </button>
        {showHelper && (
          <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-amber-100 text-amber-800">Direct</span>
                <span className="text-xs font-semibold text-gray-800">Direct API</span>
              </div>
              <p className="text-xs text-gray-600 leading-relaxed">
                Your carrier credentials hit the carrier API directly (UPS, FedEx). No middleman, no per-label fees.
                Best rates and full control. Requires API credentials from the carrier developer portal.
              </p>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-blue-100 text-blue-800">ShipEngine</span>
                <span className="text-xs font-semibold text-gray-800">Connected Account</span>
              </div>
              <p className="text-xs text-gray-600 leading-relaxed">
                Your own carrier account connected through ShipEngine. Labels bill to your carrier account,
                but ShipEngine charges a small per-label fee (~$0.05). Easy setup, no API credentials needed.
              </p>
            </div>
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-purple-100 text-purple-800">Funded</span>
                <span className="text-xs font-semibold text-gray-800">ShipEngine Funded</span>
              </div>
              <p className="text-xs text-gray-600 leading-relaxed">
                Carrier accounts owned and billed by ShipEngine / ShipStation. Postage is deducted from your
                wallet balance. Typically used for USPS and discounted marketplace rates.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Selection summary bar */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-blue-900">
              {selectedServices.length} service{selectedServices.length !== 1 ? 's' : ''} selected
            </p>
            <p className="text-sm text-blue-700 mt-0.5">
              Only selected services appear in dropdowns throughout the app (shipping rules, rate shoppers, weight rules, etc.)
            </p>
          </div>
          <button
            onClick={saveSelection}
            disabled={saving || !hasChanges}
            className={`px-5 py-2 rounded-lg font-medium text-sm transition-colors ${
              hasChanges
                ? 'bg-green-600 text-white hover:bg-green-700'
                : 'bg-gray-200 text-gray-500 cursor-not-allowed'
            }`}
          >
            {saving ? 'Saving...' : hasChanges ? 'Save Selection' : 'Saved'}
          </button>
        </div>
      </div>

      {/* Account-based Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-6 overflow-x-auto">
          {normalAccounts.map(acct => (
            <button
              key={acct.id}
              onClick={() => setActiveTab(acct.id)}
              className={`py-3 px-1 border-b-2 font-medium text-sm whitespace-nowrap flex items-center gap-2 ${
                activeTab === acct.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <span>{acct.icon}</span>
              <span>{acct.nickname}</span>
              {acct.direct && acct.shipEngine && (
                <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-green-100 text-green-700">2 paths</span>
              )}
            </button>
          ))}
          {marketplaceAccounts.length > 0 && (
            <>
              <div className="border-l border-gray-300 mx-2 self-stretch" />
              {marketplaceAccounts.map(acct => (
                <button
                  key={acct.id}
                  onClick={() => setActiveTab(acct.id)}
                  className={`py-3 px-1 border-b-2 font-medium text-sm whitespace-nowrap flex items-center gap-2 ${
                    activeTab === acct.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <span>{acct.icon}</span>
                  <span>{acct.nickname}</span>
                </button>
              ))}
            </>
          )}
        </nav>
      </div>

      {/* Tab Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="text-gray-500">Loading carriers...</div>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800 font-semibold">Error loading carriers</p>
          <p className="text-red-600 text-sm mt-1">{error}</p>
          <button onClick={handleRefresh} className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm">Retry</button>
        </div>
      ) : accounts.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-12 text-center">
          <p className="text-gray-500 text-lg">No carrier accounts found</p>
          <p className="text-gray-400 text-sm mt-1">Connect a carrier via ShipEngine or add a Direct connection</p>
          <button
            onClick={() => setShowConnectModal(true)}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium"
          >
            Connect a Carrier Account
          </button>
        </div>
      ) : activeAccount ? (
        <AccountTab
          key={activeAccount.id}
          account={activeAccount}
          selectedIdentities={selectedIdentitiesForAccount(activeAccount)}
          onToggleService={(svc) => toggleServiceForAccount(activeAccount, svc)}
          onBatchSelect={(svcs) => batchSelectForAccount(activeAccount, svcs)}
          onBatchDeselect={(ids) => batchDeselectIdentities(ids)}
          onSelectAll={() => selectAllForAccount(activeAccount)}
          onDeselectAll={() => deselectAllForAccount(activeAccount)}
          onDirectConnectionUpdated={handleDirectConnectionUpdated}
          onDisconnectShipEngine={!activeAccount.isMarketplace ? handleDisconnectShipEngine : undefined}
        />
      ) : null}

      {/* Connect Carrier Modal */}
      <ConnectCarrierModal
        open={showConnectModal}
        onClose={() => setShowConnectModal(false)}
        onSuccess={() => { loadAll(); fetchSelectedServices() }}
      />

      {/* Carrier Settings Modal */}
      <CarrierSettingsModal
        carrier={settingsCarrier}
        onClose={() => setSettingsCarrier(null)}
        onSaved={() => loadAll()}
      />

      {/* Sticky save bar */}
      {hasChanges && (
        <div className="fixed bottom-0 left-64 right-0 bg-white border-t border-gray-200 shadow-lg px-8 py-4 z-40">
          <div className="flex items-center justify-between max-w-5xl">
            <span className="text-sm text-amber-600 font-medium">
              You have unsaved changes — {selectedServices.length} service{selectedServices.length !== 1 ? 's' : ''} selected
            </span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSelectedServices([...savedServices])}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Discard
              </button>
              <button
                onClick={saveSelection}
                disabled={saving}
                className="px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium"
              >
                {saving ? 'Saving...' : 'Save Selection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
