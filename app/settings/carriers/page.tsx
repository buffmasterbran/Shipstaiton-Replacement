'use client'

import { useState, useEffect, useCallback } from 'react'
import { ShipEngineCarrier, CarrierService, CarrierTab } from './types'
import {
  classifyCarriers,
  getServiceBreakdown,
  getBillingLabel,
  getCarrierIcon,
} from './helpers'
import ConnectCarrierModal from './ConnectCarrierModal'
import CarrierSettingsModal from './CarrierSettingsModal'

interface SelectedService {
  carrierId: string
  carrierCode: string
  carrierName: string
  serviceCode: string
  serviceName: string
  domestic?: boolean
  international?: boolean
}

const serviceKey = (carrierId: string, serviceCode: string, domestic: boolean, international: boolean) =>
  `${carrierId}:${serviceCode}:${domestic ? 'd' : ''}${international ? 'i' : ''}`

export default function CarriersPage() {
  const [carriers, setCarriers] = useState<ShipEngineCarrier[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<CarrierTab>('our-accounts')
  const [expandedCarrier, setExpandedCarrier] = useState<string | null>(null)

  const [selectedServices, setSelectedServices] = useState<SelectedService[]>([])
  const [savedServices, setSavedServices] = useState<SelectedService[]>([])
  const [saving, setSaving] = useState(false)
  const [showConnectModal, setShowConnectModal] = useState(false)
  const [settingsCarrier, setSettingsCarrier] = useState<ShipEngineCarrier | null>(null)
  const [disconnecting, setDisconnecting] = useState<string | null>(null)

  const hasChanges = JSON.stringify(selectedServices) !== JSON.stringify(savedServices)

  useEffect(() => {
    fetchCarriers()
    fetchSelectedServices()
  }, [])

  const fetchCarriers = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch('/api/shipengine/carriers?includeServices=true')
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to fetch carriers')
      setCarriers(data.carriers || [])
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load carriers'
      console.error('Error fetching carriers:', err)
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const fetchSelectedServices = async () => {
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
  }

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

  const disconnectCarrier = async (carrierId: string, carrierCode: string) => {
    if (!confirm('Are you sure you want to disconnect this carrier? This cannot be undone.')) return
    try {
      setDisconnecting(carrierId)
      const response = await fetch(
        `/api/shipengine/carriers/connect?carrier_name=${carrierCode}&carrier_id=${carrierId}`,
        { method: 'DELETE' }
      )
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to disconnect')
      // Remove from selected services and refresh
      setSelectedServices((prev) => prev.filter((s) => s.carrierId !== carrierId))
      setSavedServices((prev) => prev.filter((s) => s.carrierId !== carrierId))
      await fetchCarriers()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to disconnect'
      alert(message)
    } finally {
      setDisconnecting(null)
    }
  }

  const isSelected = useCallback(
    (carrierId: string, serviceCode: string, domestic: boolean, international: boolean) => {
      return selectedServices.some((s) => {
        if (s.carrierId !== carrierId || s.serviceCode !== serviceCode) return false
        if (s.domestic !== undefined) return s.domestic === domestic && s.international === international
        return true
      })
    },
    [selectedServices]
  )

  const toggleService = (carrier: ShipEngineCarrier, service: CarrierService) => {
    const key = serviceKey(carrier.carrier_id, service.service_code, service.domestic, service.international)
    setSelectedServices((prev) => {
      const exists = prev.some(
        (s) => serviceKey(s.carrierId, s.serviceCode, !!s.domestic, !!s.international) === key
      )
      if (exists) {
        return prev.filter(
          (s) => serviceKey(s.carrierId, s.serviceCode, !!s.domestic, !!s.international) !== key
        )
      }
      return [
        ...prev,
        {
          carrierId: carrier.carrier_id,
          carrierCode: carrier.carrier_code,
          carrierName: carrier.friendly_name,
          serviceCode: service.service_code,
          serviceName: service.name,
          domestic: service.domestic,
          international: service.international,
        },
      ]
    })
  }

  const selectAllForCarrier = (carrier: ShipEngineCarrier) => {
    if (!carrier.services) return
    setSelectedServices((prev) => {
      const withoutCarrier = prev.filter((s) => s.carrierId !== carrier.carrier_id)
      const all = carrier.services!.map((svc) => ({
        carrierId: carrier.carrier_id,
        carrierCode: carrier.carrier_code,
        carrierName: carrier.friendly_name,
        serviceCode: svc.service_code,
        serviceName: svc.name,
        domestic: svc.domestic,
        international: svc.international,
      }))
      return [...withoutCarrier, ...all]
    })
  }

  const deselectAllForCarrier = (carrierId: string) => {
    setSelectedServices((prev) => prev.filter((s) => s.carrierId !== carrierId))
  }

  const selectedCountForCarrier = (carrierId: string) =>
    selectedServices.filter((s) => s.carrierId === carrierId).length

  const { own, managed } = classifyCarriers(carriers)
  const displayedCarriers = activeTab === 'our-accounts' ? own : managed

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
          <button
            onClick={fetchCarriers}
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

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('our-accounts')}
            className={`py-3 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'our-accounts'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Our Accounts
            <span className={`ml-2 px-2 py-0.5 text-xs rounded-full ${
              activeTab === 'our-accounts' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
            }`}>
              {own.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('shipengine')}
            className={`py-3 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'shipengine'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            ShipEngine
            <span className={`ml-2 px-2 py-0.5 text-xs rounded-full ${
              activeTab === 'shipengine' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
            }`}>
              {managed.length}
            </span>
          </button>
        </nav>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="text-gray-500">Loading carriers from ShipEngine...</div>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800 font-semibold">Error loading carriers</p>
          <p className="text-red-600 text-sm mt-1">{error}</p>
          <button
            onClick={fetchCarriers}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
          >
            Retry
          </button>
        </div>
      ) : displayedCarriers.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-12 text-center">
          <p className="text-gray-500 text-lg">
            {activeTab === 'our-accounts'
              ? 'No direct carrier accounts found'
              : 'No ShipEngine-managed carriers found'}
          </p>
          {activeTab === 'our-accounts' && (
            <button
              onClick={() => setShowConnectModal(true)}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium"
            >
              Connect a Carrier Account
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {displayedCarriers.map((carrier) => (
            <CarrierCard
              key={carrier.carrier_id}
              carrier={carrier}
              expanded={expandedCarrier === carrier.carrier_id}
              onToggle={() =>
                setExpandedCarrier(
                  expandedCarrier === carrier.carrier_id ? null : carrier.carrier_id
                )
              }
              selectedCount={selectedCountForCarrier(carrier.carrier_id)}
              isServiceSelected={isSelected}
              onToggleService={toggleService}
              onSelectAll={selectAllForCarrier}
              onDeselectAll={deselectAllForCarrier}
              onDisconnect={disconnectCarrier}
              isDisconnecting={disconnecting === carrier.carrier_id}
              onOpenSettings={() => setSettingsCarrier(carrier)}
            />
          ))}
        </div>
      )}

      {/* Connect Carrier Modal */}
      <ConnectCarrierModal
        open={showConnectModal}
        onClose={() => setShowConnectModal(false)}
        onSuccess={() => {
          fetchCarriers()
          fetchSelectedServices()
        }}
      />

      {/* Carrier Settings Modal */}
      <CarrierSettingsModal
        carrier={settingsCarrier}
        onClose={() => setSettingsCarrier(null)}
        onSaved={() => fetchCarriers()}
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
                onClick={() => {
                  setSelectedServices([...savedServices])
                }}
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

// ---------------------------------------------------------------------------

const CarrierCard = ({
  carrier,
  expanded,
  onToggle,
  selectedCount,
  isServiceSelected,
  onToggleService,
  onSelectAll,
  onDeselectAll,
  onDisconnect,
  isDisconnecting,
  onOpenSettings,
}: {
  carrier: ShipEngineCarrier
  expanded: boolean
  onToggle: () => void
  selectedCount: number
  isServiceSelected: (carrierId: string, serviceCode: string, domestic: boolean, international: boolean) => boolean
  onToggleService: (carrier: ShipEngineCarrier, service: CarrierService) => void
  onSelectAll: (carrier: ShipEngineCarrier) => void
  onDeselectAll: (carrierId: string) => void
  onDisconnect: (carrierId: string, carrierCode: string) => void
  isDisconnecting: boolean
  onOpenSettings: () => void
}) => {
  const [serviceFilter, setServiceFilter] = useState<'all' | 'domestic' | 'international'>('all')
  const [jsonService, setJsonService] = useState<CarrierService | null>(null)
  const breakdown = getServiceBreakdown(carrier.services)
  const billing = getBillingLabel(carrier)
  const icon = getCarrierIcon(carrier.carrier_code)
  const allSelected = breakdown.total > 0 && selectedCount === breakdown.total

  const filteredServices = (carrier.services || []).filter((s) => {
    if (serviceFilter === 'domestic') return s.domestic
    if (serviceFilter === 'international') return s.international
    return true
  })

  return (
    <div className={`bg-white border-2 rounded-lg shadow-sm overflow-hidden transition-colors ${
      selectedCount > 0 ? 'border-green-400' : 'border-gray-200'
    }`}>
      {/* Header */}
      <div
        className="p-5 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-2xl">{icon}</span>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-gray-900">
                  {carrier.friendly_name}
                </h2>
                {carrier.nickname && carrier.nickname !== carrier.friendly_name && (
                  <span className="text-sm text-gray-500">({carrier.nickname})</span>
                )}
                {selectedCount > 0 && (
                  <span className="px-2 py-0.5 bg-green-100 text-green-800 text-xs font-semibold rounded-full">
                    {selectedCount}/{breakdown.total} selected
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5">
                <span className="text-sm text-gray-500 font-mono">
                  {carrier.carrier_id}
                </span>
                {carrier.account_number && (
                  <span className="text-sm text-gray-500">
                    Acct: <span className="font-mono">{carrier.account_number}</span>
                  </span>
                )}
                <span
                  className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${
                    billing === 'Direct Account'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {billing}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-sm font-medium text-gray-900">
                {breakdown.total} services
              </div>
              <div className="text-xs text-gray-500">
                {breakdown.domestic} domestic · {breakdown.international} intl
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onOpenSettings()
              }}
              className="px-2.5 py-1 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
              title="Carrier settings"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onDisconnect(carrier.carrier_id, carrier.carrier_code)
              }}
              disabled={isDisconnecting}
              className="px-2.5 py-1 text-xs text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
              title="Disconnect this carrier"
            >
              {isDisconnecting ? '...' : 'Disconnect'}
            </button>
            <svg
              className={`w-5 h-5 text-gray-400 transition-transform ${
                expanded ? 'rotate-180' : ''
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </div>

      {/* Expanded service list with checkboxes */}
      {expanded && (
        <div className="border-t border-gray-200 bg-gray-50 px-5 py-4">
          {carrier.services && carrier.services.length > 0 ? (
            <>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-700">
                  Select Services ({selectedCount}/{breakdown.total})
                </h3>
                <div className="flex items-center gap-3">
                  {/* Filter toggle */}
                  <div className="inline-flex rounded-md border border-gray-300 bg-white text-xs">
                    {([
                      { key: 'all' as const, label: 'All', count: breakdown.total },
                      { key: 'domestic' as const, label: 'Domestic', count: breakdown.domestic },
                      { key: 'international' as const, label: 'Intl', count: breakdown.international },
                    ]).map((f) => (
                      <button
                        key={f.key}
                        onClick={(e) => { e.stopPropagation(); setServiceFilter(f.key) }}
                        className={`px-2.5 py-1 font-medium transition-colors first:rounded-l-md last:rounded-r-md ${
                          serviceFilter === f.key
                            ? 'bg-blue-600 text-white'
                            : 'text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        {f.label} ({f.count})
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); allSelected ? onDeselectAll(carrier.carrier_id) : onSelectAll(carrier) }}
                    className="text-xs font-medium text-blue-600 hover:text-blue-800"
                  >
                    {allSelected ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
              </div>
              {filteredServices.length === 0 ? (
                <p className="text-sm text-gray-500 py-4 text-center">
                  No {serviceFilter} services for this carrier.
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                  {filteredServices.map((service) => {
                    const checked = isServiceSelected(carrier.carrier_id, service.service_code, service.domestic, service.international)
                    return (
                      <div
                        key={`${service.service_code}-${service.domestic ? 'dom' : 'intl'}`}
                        onClick={() => onToggleService(carrier, service)}
                        className={`flex items-center gap-3 bg-white rounded border-2 px-3 py-2.5 cursor-pointer transition-colors ${
                          checked
                            ? 'border-green-400 bg-green-50'
                            : 'border-gray-200 hover:border-gray-300'
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
                            {service.name}
                          </div>
                          <div className="text-xs text-gray-400 font-mono truncate">
                            {service.service_code}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {service.domestic && (
                            <span className="w-2 h-2 rounded-full bg-green-400" title="Domestic" />
                          )}
                          {service.international && (
                            <span className="w-2 h-2 rounded-full bg-blue-400" title="International" />
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); setJsonService(service) }}
                            className="ml-1 px-1.5 py-0.5 text-[10px] font-mono text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
                            title="View JSON"
                          >
                            {'{ }'}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-500 py-2">
              No services loaded for this carrier.
            </p>
          )}
        </div>
      )}

      {jsonService && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setJsonService(null)}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
              <h3 className="text-sm font-semibold text-gray-800">{jsonService.name}</h3>
              <button
                onClick={() => setJsonService(null)}
                className="text-gray-400 hover:text-gray-600 text-lg leading-none"
              >
                &times;
              </button>
            </div>
            <pre className="p-4 text-xs font-mono text-gray-700 bg-gray-50 overflow-auto max-h-[60vh]">
              {JSON.stringify(jsonService, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}
