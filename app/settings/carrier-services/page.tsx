'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import type {
  ShipEngineCarrier,
  DirectConnections,
  UnifiedAccount,
  UnifiedService,
  CarrierNetwork,
} from '../carriers/types'
import { unifyAccounts } from '../carriers/unifyAccounts'
import ConnectCarrierModal from '../carriers/ConnectCarrierModal'
import AccountManagerModal from './AccountManagerModal'

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
  identity?: string
  directConnectionId?: string
  directCode?: string
  fallbackCarrierId?: string
  fallbackServiceCode?: string
  fallbackCarrierCode?: string
}

// A row in the service grid: one unique service identity, with per-account availability
interface ServiceRow {
  identity: string
  displayName: string
  domestic: boolean
  international: boolean
  network: CarrierNetwork
  accounts: Map<string, UnifiedService> // accountId → service info for that account
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function networkLabel(n: CarrierNetwork): string {
  switch (n) {
    case 'ups': return 'UPS'
    case 'fedex': return 'FedEx'
    case 'usps': return 'USPS'
    case 'dhl': return 'DHL'
    default: return 'Other'
  }
}

function networkIcon(n: CarrierNetwork): string {
  switch (n) {
    case 'ups': return '🟤'
    case 'fedex': return '🟣'
    case 'usps': return '🔵'
    case 'dhl': return '🟡'
    default: return '📦'
  }
}

function getAccountCarrierIds(account: UnifiedAccount): Set<string> {
  const ids = new Set<string>()
  if (account.direct?.id) ids.add(account.direct.id)
  if (account.shipEngine?.carrier_id) ids.add(account.shipEngine.carrier_id)
  if (account.shipEngineCarriers) {
    for (const se of account.shipEngineCarriers) ids.add(se.carrier_id)
  }
  return ids
}

function buildSelectedService(account: UnifiedAccount, svc: UnifiedService): SelectedService {
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

function belongsToAccount(s: SelectedService, account: UnifiedAccount): boolean {
  const accountIds = getAccountCarrierIds(account)
  return accountIds.has(s.carrierId) || accountIds.has(s.directConnectionId || '')
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function CarrierServicesPage() {
  const [carriers, setCarriers] = useState<ShipEngineCarrier[]>([])
  const [directConnections, setDirectConnections] = useState<DirectConnections>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [accounts, setAccounts] = useState<UnifiedAccount[]>([])

  const [selectedServices, setSelectedServices] = useState<SelectedService[]>([])
  const [savedServices, setSavedServices] = useState<SelectedService[]>([])
  const [saving, setSaving] = useState(false)
  const [showConnectModal, setShowConnectModal] = useState(false)

  const [collapsedNetworks, setCollapsedNetworks] = useState<Set<string>>(new Set())
  const [serviceFilter, setServiceFilter] = useState<'all' | 'domestic' | 'international'>('all')

  const [managingAccount, setManagingAccount] = useState<UnifiedAccount | null>(null)

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
    setLoading(false)
  }, [fetchCarriers, fetchDirectConnections, fetchGlobalEStatus])

  useEffect(() => {
    loadAll()
    fetchSelectedServices()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const unified = unifyAccounts(carriers, directConnections)
    setAccounts(unified)
  }, [carriers, directConnections])

  // ── Build the service-first catalog ──────────────────────────────────────

  const { serviceRows, networkGroups, accountColumns } = useMemo(() => {
    const rowMap = new Map<string, ServiceRow>()
    const networkSet = new Set<CarrierNetwork>()
    const colAccounts = accounts.filter(a => !a.isMarketplace)
    const marketplaceAccounts = accounts.filter(a => a.isMarketplace)
    const allCols = [...colAccounts, ...marketplaceAccounts]

    for (const account of allCols) {
      for (const svc of account.services) {
        networkSet.add(svc.identity.startsWith('ups:') ? 'ups'
          : svc.identity.startsWith('fedex:') ? 'fedex'
          : account.carrierNetwork)

        const existing = rowMap.get(svc.identity)
        if (existing) {
          existing.accounts.set(account.id, svc)
        } else {
          const network = svc.identity.startsWith('ups:') ? 'ups' as CarrierNetwork
            : svc.identity.startsWith('fedex:') ? 'fedex' as CarrierNetwork
            : account.carrierNetwork
          rowMap.set(svc.identity, {
            identity: svc.identity,
            displayName: svc.displayName,
            domestic: svc.domestic,
            international: svc.international,
            network,
            accounts: new Map([[account.id, svc]]),
          })
        }
      }
    }

    const rows = Array.from(rowMap.values())

    const groups = new Map<CarrierNetwork, ServiceRow[]>()
    for (const row of rows) {
      const arr = groups.get(row.network) || []
      arr.push(row)
      groups.set(row.network, arr)
    }

    // Sort within each group: domestic first, then alphabetical
    Array.from(groups.entries()).forEach(([, arr]) => {
      arr.sort((a, b) => {
        if (a.domestic && !b.domestic) return -1
        if (!a.domestic && b.domestic) return 1
        return a.displayName.localeCompare(b.displayName)
      })
    })

    // Sort networks
    const networkOrder: CarrierNetwork[] = ['ups', 'fedex', 'usps', 'dhl', 'other']
    const sortedGroups = new Map<CarrierNetwork, ServiceRow[]>()
    for (const n of networkOrder) {
      const g = groups.get(n)
      if (g && g.length > 0) sortedGroups.set(n, g)
    }

    return { serviceRows: rows, networkGroups: sortedGroups, accountColumns: allCols }
  }, [accounts])

  // ── Is a service+account selected? ──────────────────────────────────────

  const isSelected = useCallback((identity: string, account: UnifiedAccount): boolean => {
    const accountIds = getAccountCarrierIds(account)
    return selectedServices.some(s =>
      s.identity === identity &&
      (accountIds.has(s.carrierId) || accountIds.has(s.directConnectionId || ''))
    )
  }, [selectedServices])

  // ── Toggle ──────────────────────────────────────────────────────────────

  const toggleService = useCallback((account: UnifiedAccount, svc: UnifiedService) => {
    setSelectedServices(prev => {
      const exists = prev.some(s => s.identity === svc.identity && belongsToAccount(s, account))
      if (exists) {
        return prev.filter(s => !(s.identity === svc.identity && belongsToAccount(s, account)))
      }
      return [...prev, buildSelectedService(account, svc)]
    })
  }, [])

  // ── Save ────────────────────────────────────────────────────────────────

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

  // ── Network collapse toggle ─────────────────────────────────────────────

  const toggleNetworkCollapse = (network: CarrierNetwork) => {
    setCollapsedNetworks(prev => {
      const next = new Set(prev)
      if (next.has(network)) next.delete(network)
      else next.add(network)
      return next
    })
  }

  // ── Carrier management callbacks ────────────────────────────────────────

  const handleDirectConnectionUpdated = useCallback(async () => {
    const dConns = await fetchDirectConnections()
    setDirectConnections(dConns)
  }, [fetchDirectConnections])

  const handleDisconnectShipEngine = useCallback(async (carrierId: string, carrierCode: string) => {
    if (!confirm('Are you sure you want to disconnect this carrier?')) return
    try {
      const response = await fetch(
        `/api/shipengine/carriers/connect?carrier_name=${carrierCode}&carrier_id=${carrierId}`,
        { method: 'DELETE' },
      )
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to disconnect')
      setSelectedServices(prev => prev.filter(s => s.carrierId !== carrierId))
      setSavedServices(prev => prev.filter(s => s.carrierId !== carrierId))
      const seCarriers = await fetchCarriers()
      setCarriers(seCarriers)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to disconnect'
      alert(message)
    }
  }, [fetchCarriers])

  // ── Select all / Deselect all for a network section ─────────────────────

  const selectAllNetwork = (network: CarrierNetwork) => {
    const rows = networkGroups.get(network) || []
    const filtered = rows.filter(r => {
      if (serviceFilter === 'domestic') return r.domestic
      if (serviceFilter === 'international') return r.international
      return true
    })
    setSelectedServices(prev => {
      let next = [...prev]
      for (const row of filtered) {
        Array.from(row.accounts.entries()).forEach(([accountId, svc]) => {
          const account = accountColumns.find(a => a.id === accountId)
          if (!account) return
          const already = next.some(s => s.identity === svc.identity && belongsToAccount(s, account))
          if (!already) {
            next.push(buildSelectedService(account, svc))
          }
        })
      }
      return next
    })
  }

  const deselectAllNetwork = (network: CarrierNetwork) => {
    const rows = networkGroups.get(network) || []
    const identities = new Set(rows.map(r => r.identity))
    setSelectedServices(prev => prev.filter(s => !s.identity || !identities.has(s.identity)))
  }

  // ── Path badge ──────────────────────────────────────────────────────────

  const pathBadges = (svc: UnifiedService) => {
    const badges: JSX.Element[] = []
    if (svc.paths.includes('direct')) {
      badges.push(<span key="d" className="px-1 py-0.5 text-[9px] font-bold rounded bg-amber-100 text-amber-800">D</span>)
    }
    if (svc.paths.includes('shipengine')) {
      badges.push(<span key="se" className="px-1 py-0.5 text-[9px] font-bold rounded bg-blue-100 text-blue-800">SE</span>)
    }
    return badges
  }

  // ── RENDER ──────────────────────────────────────────────────────────────

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-3xl font-bold">Carrier Services</h1>
          <p className="text-gray-600 mt-1">
            Select which services to enable across all your carrier accounts
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
                <span>🌍</span> Global-E
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
                      International shipping partner. Handles duties, taxes, and labels for international orders.
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
                  </div>
                </>
              )}
            </div>
          )}
          <button
            onClick={() => loadAll()}
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

      {/* Accounts summary row */}
      {accountColumns.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-gray-500 mr-1">Accounts:</span>
          {accountColumns.map(acct => (
            <button
              key={acct.id}
              onClick={() => setManagingAccount(acct)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-700 hover:border-blue-300 hover:bg-blue-50 transition-colors"
            >
              <span>{acct.icon}</span>
              <span>{acct.nickname}</span>
              {acct.direct && (
                <span className={`w-1.5 h-1.5 rounded-full ${acct.direct.status === 'connected' ? 'bg-green-500' : acct.direct.status === 'error' ? 'bg-red-500' : 'bg-yellow-500'}`} title={`Direct: ${acct.direct.status}`} />
              )}
              {acct.shipEngine && (
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" title="ShipEngine connected" />
              )}
              <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          ))}
        </div>
      )}

      {/* Selection summary bar */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-blue-900">
              {selectedServices.length} service{selectedServices.length !== 1 ? 's' : ''} selected
            </p>
            <p className="text-sm text-blue-700 mt-0.5">
              Only selected services appear in dropdowns throughout the app
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Service filter */}
            <div className="inline-flex rounded-md border border-blue-300 bg-white text-xs">
              {([
                { key: 'all' as const, label: 'All' },
                { key: 'domestic' as const, label: 'Domestic' },
                { key: 'international' as const, label: 'Intl' },
              ]).map(f => (
                <button
                  key={f.key}
                  onClick={() => setServiceFilter(f.key)}
                  className={`px-2.5 py-1 font-medium transition-colors first:rounded-l-md last:rounded-r-md ${
                    serviceFilter === f.key ? 'bg-blue-600 text-white' : 'text-blue-700 hover:bg-blue-100'
                  }`}
                >
                  {f.label}
                </button>
              ))}
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
      </div>

      {/* Main content */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="text-gray-500">Loading carriers...</div>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800 font-semibold">Error loading carriers</p>
          <p className="text-red-600 text-sm mt-1">{error}</p>
          <button onClick={() => loadAll()} className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm">Retry</button>
        </div>
      ) : networkGroups.size === 0 ? (
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
      ) : (
        <div className="space-y-4">
          {Array.from(networkGroups.entries()).map(([network, rows]) => {
            const isCollapsed = collapsedNetworks.has(network)

            const filteredRows = rows.filter(r => {
              if (serviceFilter === 'domestic') return r.domestic
              if (serviceFilter === 'international') return r.international
              return true
            })

            const relevantAccounts = accountColumns.filter(acct =>
              filteredRows.some(r => r.accounts.has(acct.id))
            )

            const totalSelected = filteredRows.reduce((count, row) => {
              Array.from(row.accounts.keys()).forEach(accountId => {
                const account = accountColumns.find(a => a.id === accountId)
                if (account && isSelected(row.identity, account)) count++
              })
              return count
            }, 0)

            const totalCells = filteredRows.reduce((count, row) => count + row.accounts.size, 0)

            return (
              <div key={network} className="border border-gray-200 rounded-xl overflow-hidden">
                {/* Section header */}
                <button
                  onClick={() => toggleNetworkCollapse(network)}
                  className="w-full bg-gray-50 px-5 py-3.5 flex items-center justify-between hover:bg-gray-100 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <svg className={`w-4 h-4 text-gray-400 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                    <span className="text-lg">{networkIcon(network)}</span>
                    <span className="text-base font-bold text-gray-900">{networkLabel(network)}</span>
                    <span className="text-xs text-gray-500">
                      {filteredRows.length} service{filteredRows.length !== 1 ? 's' : ''}
                    </span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      totalSelected === 0 ? 'bg-gray-100 text-gray-500'
                      : totalSelected === totalCells ? 'bg-green-100 text-green-700'
                      : 'bg-blue-100 text-blue-700'
                    }`}>
                      {totalSelected} selected
                    </span>
                  </div>
                  <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => selectAllNetwork(network)}
                      className="text-xs font-medium text-blue-600 hover:text-blue-800 px-2 py-1"
                    >
                      Select All
                    </button>
                    <button
                      onClick={() => deselectAllNetwork(network)}
                      className="text-xs font-medium text-gray-500 hover:text-gray-700 px-2 py-1"
                    >
                      Deselect All
                    </button>
                  </div>
                </button>

                {/* Grid */}
                {!isCollapsed && filteredRows.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-t border-b border-gray-200 bg-gray-50/50">
                          <th className="text-left px-4 py-2.5 font-semibold text-gray-700 sticky left-0 bg-gray-50/50 min-w-[220px]">
                            Service
                          </th>
                          {relevantAccounts.map(acct => (
                            <th key={acct.id} className="text-center px-3 py-2.5 font-medium text-gray-600 min-w-[120px]">
                              <button
                                onClick={() => setManagingAccount(acct)}
                                className="inline-flex items-center gap-1 hover:text-blue-600 transition-colors"
                                title="Manage account"
                              >
                                <span className="text-xs">{acct.icon}</span>
                                <span className="text-xs truncate max-w-[100px]">
                                  {acct.isMarketplace ? 'SE Funded' : (acct.direct?.nickname || acct.shipEngine?.nickname || acct.accountNumber || acct.nickname).replace(` (${network.toUpperCase()})`, '')}
                                </span>
                              </button>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {filteredRows.map(row => (
                          <tr key={row.identity} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-4 py-2 sticky left-0 bg-white">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-gray-900 text-sm">{row.displayName}</span>
                                <div className="flex items-center gap-1 shrink-0">
                                  {row.domestic && <span className="w-1.5 h-1.5 rounded-full bg-green-400" title="Domestic" />}
                                  {row.international && <span className="w-1.5 h-1.5 rounded-full bg-blue-400" title="International" />}
                                </div>
                              </div>
                            </td>
                            {relevantAccounts.map(acct => {
                              const svc = row.accounts.get(acct.id)
                              if (!svc) {
                                return (
                                  <td key={acct.id} className="text-center px-3 py-2">
                                    <span className="text-gray-300 text-xs">---</span>
                                  </td>
                                )
                              }

                              const checked = isSelected(row.identity, acct)

                              return (
                                <td key={acct.id} className="text-center px-3 py-2">
                                  <button
                                    onClick={() => toggleService(acct, svc)}
                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border-2 transition-all text-xs ${
                                      checked
                                        ? 'border-green-400 bg-green-50 text-green-800'
                                        : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      readOnly
                                      className="w-3.5 h-3.5 text-green-600 rounded border-gray-300 focus:ring-green-500 cursor-pointer"
                                    />
                                    <span className="flex items-center gap-0.5">
                                      {pathBadges(svc)}
                                    </span>
                                  </button>
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {!isCollapsed && filteredRows.length === 0 && (
                  <div className="p-6 text-center text-sm text-gray-400">
                    No {serviceFilter !== 'all' ? serviceFilter : ''} services
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Connect Carrier Modal */}
      <ConnectCarrierModal
        open={showConnectModal}
        onClose={() => setShowConnectModal(false)}
        onSuccess={() => { loadAll(); fetchSelectedServices() }}
      />

      {/* Account Manager Modal */}
      {managingAccount && (
        <AccountManagerModal
          account={managingAccount}
          onClose={() => setManagingAccount(null)}
          onDirectConnectionUpdated={handleDirectConnectionUpdated}
          onDisconnectShipEngine={!managingAccount.isMarketplace ? handleDisconnectShipEngine : undefined}
        />
      )}

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
