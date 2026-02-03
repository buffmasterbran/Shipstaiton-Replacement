'use client'

import { useState, useEffect } from 'react'

interface Carrier {
  carrier_id: string
  carrier_code: string
  account_number?: string
  nickname?: string
  friendly_name: string
  primary?: boolean
  has_multi_package_supporting_services?: boolean
  supports_label_messages?: boolean
  services?: Array<{
    service_code: string
    name: string
    domestic: boolean
    international: boolean
  }>
  packages?: Array<{
    package_code: string
    name: string
    description?: string
  }>
  options?: Array<{
    name: string
    default_value: string
    description?: string
  }>
}

export default function CarriersPage() {
  const [carriers, setCarriers] = useState<Carrier[]>([])
  const [selectedCarrierIds, setSelectedCarrierIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedCarrier, setExpandedCarrier] = useState<string | null>(null)
  const [hasChanges, setHasChanges] = useState(false)

  useEffect(() => {
    fetchCarriers()
    fetchSelectedCarriers()
  }, [])

  async function fetchCarriers() {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch('/api/shipengine/carriers?includeServices=true')
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch carriers')
      }

      setCarriers(data.carriers || [])
    } catch (err: any) {
      console.error('Error fetching carriers:', err)
      setError(err.message || 'Failed to load carriers')
    } finally {
      setLoading(false)
    }
  }

  async function fetchSelectedCarriers() {
    try {
      const response = await fetch('/api/settings')
      const data = await response.json()

      if (response.ok && data.settings) {
        const selectedSetting = data.settings.find((s: any) => s.key === 'selected_carriers')
        if (selectedSetting?.value?.carrierIds) {
          setSelectedCarrierIds(selectedSetting.value.carrierIds)
        }
      }
    } catch (err) {
      console.error('Error fetching selected carriers:', err)
    }
  }

  async function saveSelectedCarriers() {
    try {
      setSaving(true)

      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: 'selected_carriers',
          value: { carrierIds: selectedCarrierIds },
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to save carrier selection')
      }

      setHasChanges(false)
      alert('Carrier selection saved successfully!')
    } catch (err: any) {
      console.error('Error saving carriers:', err)
      alert(err.message || 'Failed to save carrier selection')
    } finally {
      setSaving(false)
    }
  }

  function toggleCarrierSelection(carrierId: string) {
    setSelectedCarrierIds((prev) => {
      const newSelection = prev.includes(carrierId)
        ? prev.filter((id) => id !== carrierId)
        : [...prev, carrierId]
      setHasChanges(true)
      return newSelection
    })
  }

  function selectAllCarriers() {
    setSelectedCarrierIds(carriers.map((c) => c.carrier_id))
    setHasChanges(true)
  }

  function deselectAllCarriers() {
    setSelectedCarrierIds([])
    setHasChanges(true)
  }

  function toggleExpandCarrier(carrierId: string) {
    setExpandedCarrier(expandedCarrier === carrierId ? null : carrierId)
  }

  if (loading) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold mb-6">Carriers</h1>
        <div className="flex items-center justify-center py-12">
          <div className="text-gray-500">Loading carriers...</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold mb-6">Carriers</h1>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800 font-semibold">Error loading carriers</p>
          <p className="text-red-600 text-sm mt-1">{error}</p>
          <button
            onClick={fetchCarriers}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Carriers</h1>
          <p className="text-gray-600 mt-1">
            Select which carriers to use when getting shipping rates
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchCarriers}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50"
          >
            Refresh
          </button>
          <button
            onClick={saveSelectedCarriers}
            disabled={saving || !hasChanges}
            className={`px-4 py-2 rounded font-medium ${
              hasChanges
                ? 'bg-green-600 text-white hover:bg-green-700'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            {saving ? 'Saving...' : 'Save Selection'}
          </button>
        </div>
      </div>

      {/* Selection Summary */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-blue-900">
              {selectedCarrierIds.length} of {carriers.length} carriers selected
            </p>
            <p className="text-sm text-blue-700 mt-1">
              Only selected carriers will be used when fetching shipping rates
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={selectAllCarriers}
              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Select All
            </button>
            <button
              onClick={deselectAllCarriers}
              className="px-3 py-1.5 text-sm border border-blue-600 text-blue-600 rounded hover:bg-blue-100"
            >
              Deselect All
            </button>
          </div>
        </div>
      </div>

      {carriers.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
          <p className="text-gray-600">No carriers found</p>
        </div>
      ) : (
        <div className="space-y-4">
          {carriers.map((carrier) => {
            const isSelected = selectedCarrierIds.includes(carrier.carrier_id)
            return (
              <div
                key={carrier.carrier_id}
                className={`bg-white border-2 rounded-lg shadow-sm overflow-hidden transition-colors ${
                  isSelected ? 'border-green-500' : 'border-gray-200'
                }`}
              >
                {/* Carrier Header */}
                <div className="p-4 flex items-center gap-4">
                  {/* Checkbox */}
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleCarrierSelection(carrier.carrier_id)}
                      className="w-5 h-5 text-green-600 rounded border-gray-300 focus:ring-green-500 cursor-pointer"
                    />
                  </label>

                  {/* Carrier Info */}
                  <div
                    className="flex-1 cursor-pointer"
                    onClick={() => toggleExpandCarrier(carrier.carrier_id)}
                  >
                    <div className="flex items-center gap-3">
                      <h2 className="text-lg font-semibold">{carrier.friendly_name}</h2>
                      {carrier.primary && (
                        <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-semibold rounded">
                          PRIMARY
                        </span>
                      )}
                      {isSelected && (
                        <span className="px-2 py-1 bg-green-500 text-white text-xs font-semibold rounded">
                          ENABLED
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2 mt-1">
                      <span className="text-sm text-gray-500">Code: {carrier.carrier_code}</span>
                      {carrier.account_number && (
                        <span className="text-sm text-gray-500">
                          | Account: {carrier.account_number}
                        </span>
                      )}
                      {carrier.nickname && (
                        <span className="text-sm text-gray-500">| {carrier.nickname}</span>
                      )}
                    </div>
                  </div>

                  {/* Expand Toggle */}
                  <button
                    onClick={() => toggleExpandCarrier(carrier.carrier_id)}
                    className="text-gray-400 hover:text-gray-600 p-2"
                  >
                    {expandedCarrier === carrier.carrier_id ? '▼' : '▶'}
                  </button>
                </div>

                {/* Expanded Details */}
                {expandedCarrier === carrier.carrier_id && (
                  <div className="border-t border-gray-200 p-4 bg-gray-50 space-y-6">
                    {/* Carrier Features */}
                    <div>
                      <h3 className="font-semibold text-sm text-gray-700 mb-2">Features</h3>
                      <div className="flex flex-wrap gap-2">
                        {carrier.has_multi_package_supporting_services && (
                          <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                            Multi-Package Support
                          </span>
                        )}
                        {carrier.supports_label_messages && (
                          <span className="px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded">
                            Label Messages
                          </span>
                        )}
                        {!carrier.has_multi_package_supporting_services &&
                          !carrier.supports_label_messages && (
                            <span className="text-sm text-gray-500">No special features</span>
                          )}
                      </div>
                    </div>

                    {/* Services */}
                    {carrier.services && carrier.services.length > 0 && (
                      <div>
                        <h3 className="font-semibold text-sm text-gray-700 mb-2">
                          Services ({carrier.services.length})
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {carrier.services.map((service, idx) => (
                            <div
                              key={`${service.service_code}-${idx}`}
                              className="bg-white p-3 rounded border border-gray-200"
                            >
                              <div className="font-medium text-sm">{service.name}</div>
                              <div className="text-xs text-gray-500 mt-1">
                                Code: {service.service_code}
                              </div>
                              <div className="flex gap-2 mt-1">
                                {service.domestic && (
                                  <span className="px-1.5 py-0.5 bg-green-100 text-green-700 text-xs rounded">
                                    Domestic
                                  </span>
                                )}
                                {service.international && (
                                  <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">
                                    International
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Package Types */}
                    {carrier.packages && carrier.packages.length > 0 && (
                      <div>
                        <h3 className="font-semibold text-sm text-gray-700 mb-2">
                          Package Types ({carrier.packages.length})
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {carrier.packages.map((pkg, idx) => (
                            <div
                              key={`${pkg.package_code}-${idx}`}
                              className="bg-white p-3 rounded border border-gray-200"
                            >
                              <div className="font-medium text-sm">{pkg.name}</div>
                              <div className="text-xs text-gray-500 mt-1">
                                Code: {pkg.package_code}
                              </div>
                              {pkg.description && (
                                <div className="text-xs text-gray-600 mt-1">{pkg.description}</div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Options */}
                    {carrier.options && carrier.options.length > 0 && (
                      <div>
                        <h3 className="font-semibold text-sm text-gray-700 mb-2">
                          Options ({carrier.options.length})
                        </h3>
                        <div className="space-y-2">
                          {carrier.options.map((option, idx) => (
                            <div
                              key={`${option.name}-${idx}`}
                              className="bg-white p-3 rounded border border-gray-200"
                            >
                              <div className="flex justify-between items-start">
                                <div className="font-medium text-sm">{option.name}</div>
                                <div className="text-xs bg-gray-100 px-2 py-1 rounded">
                                  Default: {option.default_value}
                                </div>
                              </div>
                              {option.description && (
                                <div className="text-xs text-gray-600 mt-1">{option.description}</div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
