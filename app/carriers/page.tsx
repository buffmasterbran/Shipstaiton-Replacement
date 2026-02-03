'use client'

import { useState, useEffect } from 'react'

interface Service {
  service_code: string
  name: string
  domestic: boolean
  international: boolean
}

interface Carrier {
  carrier_id: string
  carrier_code: string
  account_number?: string
  nickname?: string
  friendly_name: string
  primary?: boolean
  has_multi_package_supporting_services?: boolean
  supports_label_messages?: boolean
  services?: Service[]
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

interface SelectedService {
  carrierId: string
  carrierCode: string
  carrierName: string
  serviceCode: string
  serviceName: string
}

export default function CarriersPage() {
  const [carriers, setCarriers] = useState<Carrier[]>([])
  const [selectedServices, setSelectedServices] = useState<SelectedService[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedCarrier, setExpandedCarrier] = useState<string | null>(null)
  const [hasChanges, setHasChanges] = useState(false)

  useEffect(() => {
    fetchCarriers()
    fetchSelectedServices()
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

  async function fetchSelectedServices() {
    try {
      const response = await fetch('/api/settings')
      const data = await response.json()

      if (response.ok && data.settings) {
        const selectedSetting = data.settings.find((s: any) => s.key === 'selected_services')
        if (selectedSetting?.value?.services) {
          setSelectedServices(selectedSetting.value.services)
        }
      }
    } catch (err) {
      console.error('Error fetching selected services:', err)
    }
  }

  async function saveSelectedServices() {
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

      if (!response.ok) {
        throw new Error('Failed to save service selection')
      }

      setHasChanges(false)
      alert('Service selection saved successfully!')
    } catch (err: any) {
      console.error('Error saving services:', err)
      alert(err.message || 'Failed to save service selection')
    } finally {
      setSaving(false)
    }
  }

  function isServiceSelected(carrierId: string, serviceCode: string): boolean {
    return selectedServices.some(
      (s) => s.carrierId === carrierId && s.serviceCode === serviceCode
    )
  }

  function toggleServiceSelection(carrier: Carrier, service: Service) {
    setSelectedServices((prev) => {
      const exists = prev.some(
        (s) => s.carrierId === carrier.carrier_id && s.serviceCode === service.service_code
      )

      let newSelection: SelectedService[]
      if (exists) {
        newSelection = prev.filter(
          (s) => !(s.carrierId === carrier.carrier_id && s.serviceCode === service.service_code)
        )
      } else {
        newSelection = [
          ...prev,
          {
            carrierId: carrier.carrier_id,
            carrierCode: carrier.carrier_code,
            carrierName: carrier.friendly_name,
            serviceCode: service.service_code,
            serviceName: service.name,
          },
        ]
      }

      setHasChanges(true)
      return newSelection
    })
  }

  function selectAllServicesForCarrier(carrier: Carrier) {
    if (!carrier.services) return

    setSelectedServices((prev) => {
      // Remove existing services for this carrier
      const withoutCarrier = prev.filter((s) => s.carrierId !== carrier.carrier_id)

      // Add all services for this carrier
      const carrierServices: SelectedService[] = carrier.services!.map((service) => ({
        carrierId: carrier.carrier_id,
        carrierCode: carrier.carrier_code,
        carrierName: carrier.friendly_name,
        serviceCode: service.service_code,
        serviceName: service.name,
      }))

      setHasChanges(true)
      return [...withoutCarrier, ...carrierServices]
    })
  }

  function deselectAllServicesForCarrier(carrier: Carrier) {
    setSelectedServices((prev) => {
      setHasChanges(true)
      return prev.filter((s) => s.carrierId !== carrier.carrier_id)
    })
  }

  function selectAllServices() {
    const allServices: SelectedService[] = []
    carriers.forEach((carrier) => {
      if (carrier.services) {
        carrier.services.forEach((service) => {
          allServices.push({
            carrierId: carrier.carrier_id,
            carrierCode: carrier.carrier_code,
            carrierName: carrier.friendly_name,
            serviceCode: service.service_code,
            serviceName: service.name,
          })
        })
      }
    })
    setSelectedServices(allServices)
    setHasChanges(true)
  }

  function deselectAllServices() {
    setSelectedServices([])
    setHasChanges(true)
  }

  function toggleExpandCarrier(carrierId: string) {
    setExpandedCarrier(expandedCarrier === carrierId ? null : carrierId)
  }

  function getSelectedCountForCarrier(carrierId: string): number {
    return selectedServices.filter((s) => s.carrierId === carrierId).length
  }

  function getTotalServicesForCarrier(carrier: Carrier): number {
    return carrier.services?.length || 0
  }

  if (loading) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold mb-6">Carriers & Services</h1>
        <div className="flex items-center justify-center py-12">
          <div className="text-gray-500">Loading carriers...</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold mb-6">Carriers & Services</h1>
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

  const totalServices = carriers.reduce((acc, c) => acc + (c.services?.length || 0), 0)

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Carriers & Services</h1>
          <p className="text-gray-600 mt-1">
            Select specific shipping services to use when getting rates
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
            onClick={saveSelectedServices}
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
              {selectedServices.length} of {totalServices} services selected
            </p>
            <p className="text-sm text-blue-700 mt-1">
              Only selected services will be used when fetching shipping rates
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={selectAllServices}
              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Select All
            </button>
            <button
              onClick={deselectAllServices}
              className="px-3 py-1.5 text-sm border border-blue-600 text-blue-600 rounded hover:bg-blue-100"
            >
              Deselect All
            </button>
          </div>
        </div>
      </div>

      {/* Selected Services Summary */}
      {selectedServices.length > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
          <h3 className="font-medium text-green-900 mb-2">Selected Services:</h3>
          <div className="flex flex-wrap gap-2">
            {selectedServices.map((service, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-100 border border-green-300 text-green-800 text-sm rounded"
              >
                {service.serviceName}
                <span className="text-xs text-green-600">({service.carrierName})</span>
                <button
                  onClick={() => {
                    const carrier = carriers.find((c) => c.carrier_id === service.carrierId)
                    const svc = carrier?.services?.find((s) => s.service_code === service.serviceCode)
                    if (carrier && svc) {
                      toggleServiceSelection(carrier, svc)
                    }
                  }}
                  className="ml-1 text-green-500 hover:text-green-700"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {carriers.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
          <p className="text-gray-600">No carriers found</p>
        </div>
      ) : (
        <div className="space-y-4">
          {carriers.map((carrier) => {
            const selectedCount = getSelectedCountForCarrier(carrier.carrier_id)
            const totalCount = getTotalServicesForCarrier(carrier)
            const hasSelectedServices = selectedCount > 0

            return (
              <div
                key={carrier.carrier_id}
                className={`bg-white border-2 rounded-lg shadow-sm overflow-hidden transition-colors ${
                  hasSelectedServices ? 'border-green-500' : 'border-gray-200'
                }`}
              >
                {/* Carrier Header */}
                <div
                  className="p-4 cursor-pointer hover:bg-gray-50 flex items-center justify-between"
                  onClick={() => toggleExpandCarrier(carrier.carrier_id)}
                >
                  <div className="flex items-center gap-4">
                    <div>
                      <div className="flex items-center gap-3">
                        <h2 className="text-lg font-semibold">{carrier.friendly_name}</h2>
                        {carrier.primary && (
                          <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-semibold rounded">
                            PRIMARY
                          </span>
                        )}
                        {hasSelectedServices && (
                          <span className="px-2 py-1 bg-green-500 text-white text-xs font-semibold rounded">
                            {selectedCount}/{totalCount} SELECTED
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
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-500">
                      {totalCount} services
                    </span>
                    <span className="text-gray-400">
                      {expandedCarrier === carrier.carrier_id ? '▼' : '▶'}
                    </span>
                  </div>
                </div>

                {/* Expanded Services */}
                {expandedCarrier === carrier.carrier_id && (
                  <div className="border-t border-gray-200 p-4 bg-gray-50">
                    {/* Carrier-level actions */}
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="font-semibold text-gray-700">
                        Services ({carrier.services?.length || 0})
                      </h3>
                      <div className="flex gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            selectAllServicesForCarrier(carrier)
                          }}
                          className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                        >
                          Select All
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            deselectAllServicesForCarrier(carrier)
                          }}
                          className="px-3 py-1 text-xs border border-gray-400 text-gray-600 rounded hover:bg-gray-100"
                        >
                          Deselect All
                        </button>
                      </div>
                    </div>

                    {/* Services List */}
                    {carrier.services && carrier.services.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {carrier.services.map((service, idx) => {
                          const isSelected = isServiceSelected(carrier.carrier_id, service.service_code)
                          return (
                            <div
                              key={`${service.service_code}-${idx}`}
                              onClick={() => toggleServiceSelection(carrier, service)}
                              className={`p-3 rounded border-2 cursor-pointer transition-colors ${
                                isSelected
                                  ? 'bg-green-50 border-green-500'
                                  : 'bg-white border-gray-200 hover:border-gray-300'
                              }`}
                            >
                              <div className="flex items-start gap-3">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => {}}
                                  className="mt-1 w-4 h-4 text-green-600 rounded border-gray-300 focus:ring-green-500 cursor-pointer"
                                />
                                <div className="flex-1">
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
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">No services available for this carrier</p>
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
