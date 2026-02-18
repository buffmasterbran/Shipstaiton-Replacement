'use client'

import { useState, useEffect } from 'react'
import { ShipEngineCarrier, CarrierTab } from './types'
import {
  classifyCarriers,
  getServiceBreakdown,
  getBillingLabel,
  getCarrierIcon,
} from './helpers'

export default function CarriersPage() {
  const [carriers, setCarriers] = useState<ShipEngineCarrier[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<CarrierTab>('our-accounts')
  const [expandedCarrier, setExpandedCarrier] = useState<string | null>(null)

  useEffect(() => {
    fetchCarriers()
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

  const { own, managed } = classifyCarriers(carriers)
  const displayedCarriers = activeTab === 'our-accounts' ? own : managed

  return (
    <div className="p-8">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-3xl font-bold">Carriers</h1>
          <p className="text-gray-600 mt-1">
            Manage your carrier accounts and ShipEngine-provided services
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchCarriers}
            disabled={loading}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 disabled:opacity-50"
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
          <a
            href="https://app.shipengine.com/#/connections"
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium text-sm"
          >
            + Add Carrier Account
          </a>
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
              activeTab === 'our-accounts'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-gray-100 text-gray-600'
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
              activeTab === 'shipengine'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-gray-100 text-gray-600'
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
            <a
              href="https://app.shipengine.com/#/connections"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium"
            >
              Connect a Carrier Account
            </a>
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
            />
          ))}
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
}: {
  carrier: ShipEngineCarrier
  expanded: boolean
  onToggle: () => void
}) => {
  const breakdown = getServiceBreakdown(carrier.services)
  const billing = getBillingLabel(carrier)
  const icon = getCarrierIcon(carrier.carrier_code)

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
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

          <div className="flex items-center gap-6">
            <div className="text-right">
              <div className="text-sm font-medium text-gray-900">
                {breakdown.total} services
              </div>
              <div className="text-xs text-gray-500">
                {breakdown.domestic} domestic · {breakdown.international} intl
              </div>
            </div>
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

      {/* Expanded service list */}
      {expanded && (
        <div className="border-t border-gray-200 bg-gray-50 px-5 py-4">
          {carrier.services && carrier.services.length > 0 ? (
            <>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-700">
                  Available Services ({breakdown.total})
                </h3>
                <div className="flex gap-4 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-green-400" />
                    Domestic ({breakdown.domestic})
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-blue-400" />
                    International ({breakdown.international})
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                {carrier.services.map((service) => (
                  <div
                    key={service.service_code}
                    className="flex items-center justify-between bg-white rounded border border-gray-200 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">
                        {service.name}
                      </div>
                      <div className="text-xs text-gray-400 font-mono truncate">
                        {service.service_code}
                      </div>
                    </div>
                    <div className="flex gap-1 ml-2 shrink-0">
                      {service.domestic && (
                        <span className="w-2 h-2 rounded-full bg-green-400" title="Domestic" />
                      )}
                      {service.international && (
                        <span className="w-2 h-2 rounded-full bg-blue-400" title="International" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-500 py-2">
              No services loaded for this carrier.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
