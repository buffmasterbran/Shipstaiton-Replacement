'use client'

import { useState, useEffect } from 'react'

// ============================================================================
// Types
// ============================================================================

interface CarrierService {
  carrierId: string
  carrierName: string
  serviceCode: string
  serviceName: string
}

interface Carrier {
  carrier_id: string
  carrier_code: string
  friendly_name: string
  services?: Array<{
    service_code: string
    name: string
    domestic: boolean
    international: boolean
  }>
}

interface RateShopper {
  id: string
  name: string
  services: CarrierService[]
  transitTimeRestriction: string | null
  preferenceEnabled: boolean
  preferredServiceCode: string | null
  preferenceType: string | null
  preferenceValue: number | null
  isDefault: boolean
  active: boolean
  createdAt: string
  updatedAt: string
}

interface ShippingMethodMapping {
  id: string
  incomingName: string
  targetType: 'service' | 'weight_rules' | 'rate_shopper'
  carrierId: string | null
  carrierCode: string | null
  serviceCode: string | null
  serviceName: string | null
  rateShopperId: string | null
  rateShopper?: RateShopper | null
  isExpedited: boolean
  isActive: boolean
  createdAt: string
  updatedAt: string
}

// Transit time options for rate shoppers
const TRANSIT_TIME_OPTIONS = [
  { value: 'no_restriction', label: 'No Restriction' },
  { value: '1_day', label: '1 Business Day' },
  { value: '2_days', label: '2 Business Days' },
  { value: '3_days', label: '3 Business Days' },
  { value: '5_days', label: '5 Business Days' },
  { value: '7_days', label: '7 Business Days' },
]

type SubTab = 'mappings' | 'weight-rules' | 'rate-shoppers'

// ============================================================================
// Main Page Component
// ============================================================================

export default function ShippingRulesPage() {
  const [activeTab, setActiveTab] = useState<SubTab>('mappings')

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Shipping Rules</h1>
        <p className="text-gray-600 mt-1">
          Configure how incoming orders are mapped to carriers and services
        </p>
      </div>

      {/* Sub-tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('mappings')}
            className={`py-3 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'mappings'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Shipping Method Mappings
          </button>
          <button
            onClick={() => setActiveTab('weight-rules')}
            className={`py-3 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'weight-rules'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Weight Rules
          </button>
          <button
            onClick={() => setActiveTab('rate-shoppers')}
            className={`py-3 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'rate-shoppers'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Rate Shoppers
          </button>
        </nav>
      </div>

      {activeTab === 'mappings' && <ShippingMethodMappingsTab />}
      {activeTab === 'weight-rules' && <WeightRulesTab />}
      {activeTab === 'rate-shoppers' && <RateShoppersTab />}
    </div>
  )
}

// ============================================================================
// Shipping Method Mappings Tab
// ============================================================================

function ShippingMethodMappingsTab() {
  const [mappings, setMappings] = useState<ShippingMethodMapping[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Carriers for the service picker
  const [carriers, setCarriers] = useState<Carrier[]>([])
  const [loadingCarriers, setLoadingCarriers] = useState(false)

  // Rate shoppers for the rate_shopper target type
  const [rateShoppers, setRateShoppers] = useState<RateShopper[]>([])

  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [editingMapping, setEditingMapping] = useState<ShippingMethodMapping | null>(null)
  const [saving, setSaving] = useState(false)

  // Form fields
  const [formIncomingName, setFormIncomingName] = useState('')
  const [formTargetType, setFormTargetType] = useState<'service' | 'weight_rules' | 'rate_shopper'>('service')
  const [formCarrierId, setFormCarrierId] = useState('')
  const [formCarrierCode, setFormCarrierCode] = useState('')
  const [formServiceCode, setFormServiceCode] = useState('')
  const [formServiceName, setFormServiceName] = useState('')
  const [formRateShopperId, setFormRateShopperId] = useState('')
  const [formIsExpedited, setFormIsExpedited] = useState(false)
  const [formIsActive, setFormIsActive] = useState(true)

  // Unmapped services state
  const [unmappedServices, setUnmappedServices] = useState<Array<{ serviceName: string; orderCount: number }>>([])
  const [loadingUnmapped, setLoadingUnmapped] = useState(false)

  // Recalc state
  const [recalculating, setRecalculating] = useState(false)
  const [recalcResult, setRecalcResult] = useState<any>(null)

  useEffect(() => {
    fetchMappings()
    fetchCarriers()
    fetchUnmapped()
    fetchRateShoppers()
  }, [])

  async function fetchMappings() {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch('/api/shipping-method-mappings')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to fetch')
      setMappings(data.mappings || [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function fetchCarriers() {
    try {
      setLoadingCarriers(true)
      const res = await fetch('/api/shipengine/carriers?includeServices=true')
      const data = await res.json()
      if (res.ok && data.carriers) {
        setCarriers(data.carriers)
      }
    } catch (err) {
      console.error('Error fetching carriers:', err)
    } finally {
      setLoadingCarriers(false)
    }
  }

  async function fetchUnmapped() {
    try {
      setLoadingUnmapped(true)
      const res = await fetch('/api/shipping-method-mappings/unmapped')
      const data = await res.json()
      if (res.ok) {
        setUnmappedServices(data.unmapped || [])
      }
    } catch (err) {
      console.error('Error fetching unmapped services:', err)
    } finally {
      setLoadingUnmapped(false)
    }
  }

  async function fetchRateShoppers() {
    try {
      const res = await fetch('/api/rate-shoppers')
      const data = await res.json()
      if (res.ok && data.rateShoppers) {
        setRateShoppers(data.rateShoppers.filter((rs: RateShopper) => rs.active))
      }
    } catch (err) {
      console.error('Error fetching rate shoppers:', err)
    }
  }

  function openCreateModal(prefillName?: string) {
    setEditingMapping(null)
    setFormIncomingName(prefillName || '')
    setFormTargetType('service')
    setFormCarrierId('')
    setFormCarrierCode('')
    setFormServiceCode('')
    setFormServiceName('')
    setFormRateShopperId('')
    setFormIsExpedited(false)
    setFormIsActive(true)
    setShowModal(true)
  }

  function openEditModal(mapping: ShippingMethodMapping) {
    setEditingMapping(mapping)
    setFormIncomingName(mapping.incomingName)
    setFormTargetType(mapping.targetType || 'service')
    setFormCarrierId(mapping.carrierId || '')
    setFormCarrierCode(mapping.carrierCode || '')
    setFormServiceCode(mapping.serviceCode || '')
    setFormServiceName(mapping.serviceName || '')
    setFormRateShopperId(mapping.rateShopperId || '')
    setFormIsExpedited(mapping.isExpedited)
    setFormIsActive(mapping.isActive)
    setShowModal(true)
  }

  function closeModal() {
    setShowModal(false)
    setEditingMapping(null)
  }

  function handleServiceSelect(carrierId: string, carrierCode: string, serviceCode: string, serviceName: string) {
    setFormCarrierId(carrierId)
    setFormCarrierCode(carrierCode)
    setFormServiceCode(serviceCode)
    setFormServiceName(serviceName)
  }

  async function handleSave() {
    if (!formIncomingName.trim()) {
      alert('Please enter the incoming service name')
      return
    }
    if (formTargetType === 'service' && !formServiceCode) {
      alert('Please select a carrier service')
      return
    }
    if (formTargetType === 'rate_shopper' && !formRateShopperId) {
      alert('Please select a rate shopper')
      return
    }

    try {
      setSaving(true)
      const payload: Record<string, unknown> = {
        incomingName: formIncomingName,
        targetType: formTargetType,
        isExpedited: formIsExpedited,
        isActive: formIsActive,
      }

      if (formTargetType === 'service') {
        payload.carrierId = formCarrierId
        payload.carrierCode = formCarrierCode
        payload.serviceCode = formServiceCode
        payload.serviceName = formServiceName
        payload.rateShopperId = null
      } else if (formTargetType === 'rate_shopper') {
        payload.rateShopperId = formRateShopperId
        payload.carrierId = null
        payload.carrierCode = null
        payload.serviceCode = null
        payload.serviceName = null
      } else {
        // weight_rules
        payload.carrierId = null
        payload.carrierCode = null
        payload.serviceCode = null
        payload.serviceName = null
        payload.rateShopperId = null
      }

      const url = editingMapping
        ? `/api/shipping-method-mappings/${editingMapping.id}`
        : '/api/shipping-method-mappings'

      const res = await fetch(url, {
        method: editingMapping ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')

      await fetchMappings()
      await fetchUnmapped()
      closeModal()
    } catch (err: any) {
      alert(err.message || 'Failed to save mapping')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this mapping?')) return
    try {
      const res = await fetch(`/api/shipping-method-mappings/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to delete')
      }
      await fetchMappings()
      await fetchUnmapped()
    } catch (err: any) {
      alert(err.message)
    }
  }

  async function handleToggleActive(mapping: ShippingMethodMapping) {
    try {
      const res = await fetch(`/api/shipping-method-mappings/${mapping.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !mapping.isActive }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to update')
      }
      await fetchMappings()
    } catch (err: any) {
      alert(err.message)
    }
  }

  async function handleRecalculate() {
    if (!confirm('This will re-evaluate all awaiting orders against current mappings and rate shoppers. Continue?')) return
    try {
      setRecalculating(true)
      setRecalcResult(null)
      const res = await fetch('/api/shipping-method-mappings/recalc', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Recalculation failed')
      setRecalcResult(data)
    } catch (err: any) {
      alert(err.message)
    } finally {
      setRecalculating(false)
    }
  }

  // Build a flat list of all carrier services for the picker
  const allServices = carriers.flatMap((carrier) =>
    (carrier.services || [])
      .filter((s) => s.domestic)
      .map((service) => ({
        carrierId: carrier.carrier_id,
        carrierCode: carrier.carrier_code,
        carrierName: carrier.friendly_name,
        serviceCode: service.service_code,
        serviceName: service.name,
      }))
  )

  return (
    <div>
      {/* Header with Add + Recalc buttons */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm text-gray-600">
            Map incoming shipping service names to a specific carrier, weight rules, or a rate shopper.
            This is the first thing checked when an order comes in.
          </p>
        </div>
        <div className="flex items-center gap-3 ml-4 shrink-0">
          <button
            onClick={handleRecalculate}
            disabled={recalculating}
            className="px-3 py-2 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {recalculating ? 'Recalculating...' : 'Recalculate Orders'}
          </button>
          <button
            onClick={() => openCreateModal()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Mapping
          </button>
        </div>
      </div>

      {/* Recalc Result Banner */}
      {recalcResult && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-green-800">
                Recalculation Complete
              </p>
              <p className="text-sm text-green-700">
                {recalcResult.totalOrders} orders evaluated, {recalcResult.updated} updated, {recalcResult.errors} errors
              </p>
            </div>
            <button
              onClick={() => setRecalcResult(null)}
              className="text-green-600 hover:text-green-800"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          {recalcResult.details && recalcResult.details.length > 0 && (
            <details className="mt-2">
              <summary className="text-sm text-green-700 cursor-pointer hover:text-green-900">
                Show details ({recalcResult.details.length} orders)
              </summary>
              <div className="mt-2 max-h-48 overflow-y-auto text-xs font-mono text-green-800 bg-green-100 p-2 rounded">
                {recalcResult.details.map((d: any, i: number) => (
                  <div key={i}>{d.orderNumber}: {d.action}</div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {/* Unmapped Services Alert */}
      {!loadingUnmapped && unmappedServices.length > 0 && (
        <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <span className="font-semibold text-amber-800">
              {unmappedServices.length} unmapped shipping service{unmappedServices.length !== 1 ? 's' : ''} detected
            </span>
          </div>
          <p className="text-xs text-amber-700 mb-3">
            These services appear on awaiting orders but have no mapping. They will go through weight rules / rate shopping instead.
          </p>
          <div className="space-y-1.5">
            {unmappedServices.map((svc) => (
              <div
                key={svc.serviceName}
                className="flex items-center justify-between bg-white border border-amber-200 rounded px-3 py-2"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-900">{svc.serviceName}</span>
                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                    {svc.orderCount} order{svc.orderCount !== 1 ? 's' : ''}
                  </span>
                </div>
                <button
                  onClick={() => openCreateModal(svc.serviceName)}
                  className="text-xs font-medium text-blue-600 hover:text-blue-800 flex items-center gap-1"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Map
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <p className="text-red-800 font-semibold">Error</p>
          <p className="text-red-600 text-sm">{error}</p>
          <button onClick={fetchMappings} className="mt-2 text-red-600 hover:text-red-800 text-sm underline">
            Try again
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="text-gray-500">Loading mappings...</div>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && mappings.length === 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-12 text-center">
          <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
          <h3 className="text-lg font-semibold text-gray-700 mb-2">No Shipping Method Mappings</h3>
          <p className="text-gray-500 mb-4">
            Add mappings to route specific shipping services (like "UPS Next Day Air") directly to a ShipEngine carrier service.
          </p>
          <button
            onClick={() => openCreateModal()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Add Your First Mapping
          </button>
        </div>
      )}

      {/* Mappings Table */}
      {!loading && mappings.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Incoming Service Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Mapped To</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Expedited</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Active</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {mappings.map((mapping) => (
                <tr key={mapping.id} className={!mapping.isActive ? 'opacity-50' : ''}>
                  <td className="px-4 py-3">
                    <span className="text-sm font-medium text-gray-900">{mapping.incomingName}</span>
                  </td>
                  <td className="px-4 py-3">
                    {mapping.targetType === 'weight_rules' ? (
                      <span className="inline-flex items-center gap-1.5 text-sm text-purple-700">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
                        </svg>
                        Use Weight Rules
                      </span>
                    ) : mapping.targetType === 'rate_shopper' ? (
                      <span className="inline-flex items-center gap-1.5 text-sm text-indigo-700">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                        Rate Shop: {mapping.rateShopper?.name || 'Unknown'}
                      </span>
                    ) : (
                      <>
                        <span className="text-sm text-gray-700">{mapping.serviceName}</span>
                        {mapping.carrierCode && (
                          <span className="text-xs text-gray-400 ml-1">({mapping.carrierCode})</span>
                        )}
                      </>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {mapping.isExpedited ? (
                      <span className="inline-flex px-2 py-0.5 bg-orange-100 text-orange-800 text-xs font-semibold rounded">
                        Expedited
                      </span>
                    ) : (
                      <span className="text-gray-400 text-xs">--</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleToggleActive(mapping)}
                      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                        mapping.isActive ? 'bg-green-500' : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ease-in-out ${
                          mapping.isActive ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => openEditModal(mapping)}
                      className="text-blue-600 hover:text-blue-800 text-sm mr-3"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(mapping.id)}
                      className="text-red-600 hover:text-red-800 text-sm"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity" onClick={closeModal}>
              <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
            </div>

            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              {/* Header */}
              <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">
                  {editingMapping ? 'Edit Mapping' : 'Add Shipping Method Mapping'}
                </h2>
                <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Body */}
              <div className="px-6 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
                {/* Incoming Service Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Incoming Service Name
                  </label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder='e.g. "UPS Next Day Air Saver®"'
                    value={formIncomingName}
                    onChange={(e) => setFormIncomingName(e.target.value)}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Must match exactly what appears in the order&apos;s requestedShippingService field (case-insensitive)
                  </p>
                </div>

                {/* Target Type Selector */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Route To
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { value: 'service' as const, label: 'Specific Service', desc: 'Pick an exact carrier & service', icon: (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                        </svg>
                      )},
                      { value: 'weight_rules' as const, label: 'Weight Rules', desc: 'Let weight-based rules decide', icon: (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
                        </svg>
                      )},
                      { value: 'rate_shopper' as const, label: 'Rate Shopper', desc: 'Shop rates across carriers', icon: (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                      )},
                    ]).map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setFormTargetType(opt.value)}
                        className={`relative p-3 rounded-lg border-2 text-left transition-all ${
                          formTargetType === opt.value
                            ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        <div className={`mb-1 ${formTargetType === opt.value ? 'text-blue-600' : 'text-gray-400'}`}>
                          {opt.icon}
                        </div>
                        <div className={`text-sm font-medium ${formTargetType === opt.value ? 'text-blue-800' : 'text-gray-700'}`}>
                          {opt.label}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">{opt.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Conditional: Carrier Service Picker (only for 'service' target) */}
                {formTargetType === 'service' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Carrier Service
                    </label>
                    {formServiceCode && (
                      <div className="mb-2 p-2 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
                        <div>
                          <span className="text-sm font-medium text-blue-800">{formServiceName}</span>
                          <span className="text-xs text-blue-600 ml-1">({formCarrierCode})</span>
                        </div>
                        <button
                          onClick={() => { setFormCarrierId(''); setFormCarrierCode(''); setFormServiceCode(''); setFormServiceName('') }}
                          className="text-blue-400 hover:text-blue-600"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    )}
                    <div className="border border-gray-300 rounded-lg overflow-hidden">
                      <div className="max-h-48 overflow-y-auto">
                        {loadingCarriers ? (
                          <div className="p-4 text-center text-gray-500 text-sm">Loading services...</div>
                        ) : carriers.length === 0 ? (
                          <div className="p-4 text-center text-gray-500 text-sm">No carriers found</div>
                        ) : (
                          carriers.map((carrier) => (
                            <div key={carrier.carrier_id}>
                              <div className="bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-600 border-b">
                                {carrier.friendly_name}
                              </div>
                              {carrier.services && carrier.services.length > 0 ? (
                                carrier.services
                                  .filter((s) => s.domestic)
                                  .map((service) => {
                                    const isSelected = formCarrierId === carrier.carrier_id && formServiceCode === service.service_code
                                    return (
                                      <div
                                        key={`${carrier.carrier_id}-${service.service_code}`}
                                        className={`px-3 py-2 flex items-center justify-between hover:bg-gray-50 cursor-pointer text-sm ${
                                          isSelected ? 'bg-blue-50' : ''
                                        }`}
                                        onClick={() =>
                                          handleServiceSelect(
                                            carrier.carrier_id,
                                            carrier.carrier_code,
                                            service.service_code,
                                            service.name
                                          )
                                        }
                                      >
                                        <span>{service.name}</span>
                                        {isSelected && (
                                          <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                          </svg>
                                        )}
                                      </div>
                                    )
                                  })
                              ) : (
                                <div className="px-3 py-2 text-sm text-gray-500">No services available</div>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Conditional: Rate Shopper Picker (only for 'rate_shopper' target) */}
                {formTargetType === 'rate_shopper' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Rate Shopper
                    </label>
                    {rateShoppers.length === 0 ? (
                      <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-center">
                        <p className="text-sm text-gray-500">No active rate shoppers configured.</p>
                        <p className="text-xs text-gray-400 mt-1">Create one in the Rate Shoppers tab first.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {rateShoppers.map((rs) => {
                          const isSelected = formRateShopperId === rs.id
                          return (
                            <div
                              key={rs.id}
                              onClick={() => setFormRateShopperId(rs.id)}
                              className={`p-3 border-2 rounded-lg cursor-pointer transition-all ${
                                isSelected
                                  ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500'
                                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <span className={`text-sm font-medium ${isSelected ? 'text-indigo-800' : 'text-gray-700'}`}>
                                    {rs.name}
                                  </span>
                                  {rs.isDefault && (
                                    <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Default</span>
                                  )}
                                </div>
                                {isSelected && (
                                  <svg className="w-5 h-5 text-indigo-600" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                  </svg>
                                )}
                              </div>
                              <p className="text-xs text-gray-500 mt-1">
                                {rs.services?.length || 0} services configured
                                {rs.transitTimeRestriction && rs.transitTimeRestriction !== 'no_restriction'
                                  ? ` · Max ${rs.transitTimeRestriction.replace('_', ' ')}`
                                  : ''}
                              </p>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Conditional: Weight Rules info (only for 'weight_rules' target) */}
                {formTargetType === 'weight_rules' && (
                  <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-purple-600 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div>
                        <p className="text-sm font-medium text-purple-800">
                          Orders with this service will be routed through Weight Rules
                        </p>
                        <p className="text-xs text-purple-600 mt-1">
                          The system will use the order&apos;s weight to determine the carrier/service based on
                          your configured weight rule segments. If no weight rule matches, it will fall through
                          to the default rate shopper.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Expedited Checkbox */}
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="isExpedited"
                    checked={formIsExpedited}
                    onChange={(e) => setFormIsExpedited(e.target.checked)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="isExpedited" className="text-sm font-medium text-gray-700">
                    Mark as Expedited
                  </label>
                  <span className="text-xs text-gray-500">
                    (Orders matching this mapping will appear on the Expedited tab)
                  </span>
                </div>

                {/* Active Toggle */}
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="isActive"
                    checked={formIsActive}
                    onChange={(e) => setFormIsActive(e.target.checked)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="isActive" className="text-sm font-medium text-gray-700">
                    Active
                  </label>
                  <span className="text-xs text-gray-500">
                    (Inactive mappings are ignored during order processing)
                  </span>
                </div>
              </div>

              {/* Footer */}
              <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex items-center justify-between">
                <button onClick={closeModal} className="text-gray-600 hover:text-gray-800 text-sm">
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium text-sm"
                >
                  {saving ? 'Saving...' : editingMapping ? 'Update' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Weight Rules Tab - Segmented Range Bar
// ============================================================================

const MAX_OZ = 400 // 25 lbs
const SEGMENT_COLORS = [
  'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500',
  'bg-teal-500', 'bg-pink-500', 'bg-indigo-500', 'bg-yellow-500',
  'bg-red-400', 'bg-cyan-500',
]

interface WeightRuleLocal {
  id?: string
  minOz: number
  maxOz: number
  targetType: 'service' | 'rate_shopper'
  carrierId?: string
  carrierCode?: string
  serviceCode?: string
  serviceName?: string
  rateShopperId?: string
  rateShopper?: { id: string; name: string; active: boolean } | null
  isActive: boolean
}

function formatWeight(oz: number): string {
  if (oz < 16) return `${oz} oz`
  const lbs = Math.floor(oz / 16)
  const remainOz = Math.round(oz % 16)
  if (remainOz === 0) return `${lbs} lb`
  return `${lbs} lb ${remainOz} oz`
}

function WeightRulesTab() {
  const [rules, setRules] = useState<WeightRuleLocal[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Carriers and rate shoppers for dropdowns
  const [carriers, setCarriers] = useState<Carrier[]>([])
  const [rateShoppers, setRateShoppers] = useState<RateShopper[]>([])
  const [loadingOptions, setLoadingOptions] = useState(false)

  // Editing state
  const [editingIndex, setEditingIndex] = useState<number | null>(null)

  useEffect(() => {
    fetchRules()
    fetchOptions()
  }, [])

  async function fetchRules() {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch('/api/weight-rules')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to fetch')
      // Clamp to current MAX_OZ and drop zero-width segments
      const loaded = (data.rules || [])
        .map((r: any) => ({
          id: r.id,
          minOz: Math.min(r.minOz, MAX_OZ),
          maxOz: Math.min(r.maxOz, MAX_OZ),
          targetType: r.targetType,
          carrierId: r.carrierId,
          carrierCode: r.carrierCode,
          serviceCode: r.serviceCode,
          serviceName: r.serviceName,
          rateShopperId: r.rateShopperId,
          rateShopper: r.rateShopper,
          isActive: r.isActive,
        }))
        .filter((r: any) => r.minOz < r.maxOz)
      setRules(loaded)
      // If any rule was clamped, mark unsaved so user can save the corrected version
      const wasClamped = (data.rules || []).some((r: any) => r.maxOz > MAX_OZ || r.minOz > MAX_OZ)
      setHasChanges(wasClamped)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function fetchOptions() {
    try {
      setLoadingOptions(true)
      const [carriersRes, rateShoppersRes] = await Promise.all([
        fetch('/api/shipengine/carriers?includeServices=true'),
        fetch('/api/rate-shoppers'),
      ])
      const carriersData = await carriersRes.json()
      const rateShoppersData = await rateShoppersRes.json()
      if (carriersRes.ok && carriersData.carriers) setCarriers(carriersData.carriers)
      if (rateShoppersRes.ok && rateShoppersData.rateShoppers) setRateShoppers(rateShoppersData.rateShoppers)
    } catch (err) {
      console.error('Error fetching options:', err)
    } finally {
      setLoadingOptions(false)
    }
  }

  function addBreakpoint() {
    if (rules.length === 0) {
      // First rule: entire range, unassigned
      setRules([{ minOz: 0, maxOz: MAX_OZ, targetType: 'service', isActive: true }])
    } else {
      // Split the last segment in half
      const lastIdx = rules.length - 1
      const last = rules[lastIdx]
      const midpoint = Math.round((last.minOz + last.maxOz) / 2)

      if (midpoint <= last.minOz || midpoint >= last.maxOz) return // Can't split further

      const newRules = [...rules]
      newRules[lastIdx] = { ...last, maxOz: midpoint }
      newRules.push({
        minOz: midpoint,
        maxOz: last.maxOz,
        targetType: 'service',
        isActive: true,
      })
      setRules(newRules)
    }
    setHasChanges(true)
  }

  function splitSegment(index: number) {
    const seg = rules[index]
    const midpoint = Math.round((seg.minOz + seg.maxOz) / 2)
    if (midpoint <= seg.minOz || midpoint >= seg.maxOz) return

    const newRules = [...rules]
    newRules.splice(index, 1,
      { ...seg, maxOz: midpoint },
      { minOz: midpoint, maxOz: seg.maxOz, targetType: 'service', isActive: true }
    )
    setRules(newRules)
    setHasChanges(true)
  }

  function removeSegment(index: number) {
    if (rules.length <= 1) {
      setRules([])
      setHasChanges(true)
      return
    }

    const newRules = [...rules]
    const removed = newRules[index]

    if (index === 0) {
      // Expand next segment down
      newRules[1] = { ...newRules[1], minOz: removed.minOz }
    } else {
      // Expand previous segment up
      newRules[index - 1] = { ...newRules[index - 1], maxOz: removed.maxOz }
    }

    newRules.splice(index, 1)
    setRules(newRules)
    setHasChanges(true)
    if (editingIndex === index) setEditingIndex(null)
  }

  function updateSegmentTarget(index: number, update: Partial<WeightRuleLocal>) {
    const newRules = [...rules]
    newRules[index] = { ...newRules[index], ...update }
    setRules(newRules)
    setHasChanges(true)
  }

  function updateBreakpoint(index: number, newMaxOz: number) {
    // index is the segment whose maxOz we're changing
    // This also changes the next segment's minOz
    if (index >= rules.length - 1) return
    if (newMaxOz <= rules[index].minOz || newMaxOz >= rules[index + 1].maxOz) return

    const newRules = [...rules]
    newRules[index] = { ...newRules[index], maxOz: newMaxOz }
    newRules[index + 1] = { ...newRules[index + 1], minOz: newMaxOz }
    setRules(newRules)
    setHasChanges(true)
  }

  async function handleSave() {
    try {
      setSaving(true)
      const payload = {
        rules: rules.map((r) => ({
          minOz: r.minOz,
          maxOz: r.maxOz,
          targetType: r.targetType,
          carrierId: r.carrierId || null,
          carrierCode: r.carrierCode || null,
          serviceCode: r.serviceCode || null,
          serviceName: r.serviceName || null,
          rateShopperId: r.rateShopperId || null,
          isActive: r.isActive,
        })),
      }

      const res = await fetch('/api/weight-rules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')

      setRules((data.rules || []).map((r: any) => ({
        id: r.id,
        minOz: r.minOz,
        maxOz: r.maxOz,
        targetType: r.targetType,
        carrierId: r.carrierId,
        carrierCode: r.carrierCode,
        serviceCode: r.serviceCode,
        serviceName: r.serviceName,
        rateShopperId: r.rateShopperId,
        rateShopper: r.rateShopper,
        isActive: r.isActive,
      })))
      setHasChanges(false)
      setEditingIndex(null)
    } catch (err: any) {
      alert(err.message || 'Failed to save weight rules')
    } finally {
      setSaving(false)
    }
  }

  function getSegmentLabel(rule: WeightRuleLocal): string {
    if (rule.targetType === 'rate_shopper') {
      return rule.rateShopper?.name || 'Rate Shopper'
    }
    return rule.serviceName || 'Unassigned'
  }

  // Build flat list of carrier services for dropdown
  const allServices = carriers.flatMap((carrier) =>
    (carrier.services || [])
      .filter((s) => s.domestic)
      .map((service) => ({
        carrierId: carrier.carrier_id,
        carrierCode: carrier.carrier_code,
        carrierName: carrier.friendly_name,
        serviceCode: service.service_code,
        serviceName: service.name,
      }))
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm text-gray-600">
            Define weight ranges and assign a carrier service or rate shopper to each.
            Orders are matched by their calculated weight at ingest time.
          </p>
        </div>
        <div className="flex items-center gap-3 ml-4 shrink-0">
          {hasChanges && (
            <button
              onClick={fetchRules}
              className="px-3 py-2 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Discard
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm font-medium"
          >
            {saving ? 'Saving...' : 'Save Rules'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <p className="text-red-800 font-semibold">Error</p>
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-gray-500">Loading weight rules...</div>
        </div>
      ) : (
        <>
          {/* Visual Range Bar */}
          {rules.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                <span>0 oz</span>
                <span>4 oz</span>
                <span>8 oz</span>
                <span>1 lb</span>
                <span>5 lb</span>
                <span>10 lb</span>
                <span>15 lb</span>
                <span>20 lb</span>
                <span>25 lb</span>
              </div>
              <div className="flex h-10 rounded-lg overflow-hidden border border-gray-300">
                {rules.map((rule, i) => {
                  const widthPct = ((rule.maxOz - rule.minOz) / MAX_OZ) * 100
                  const colorClass = SEGMENT_COLORS[i % SEGMENT_COLORS.length]
                  const isUnassigned = rule.targetType === 'service' && !rule.serviceCode

                  return (
                    <div
                      key={i}
                      className={`relative flex items-center justify-center cursor-pointer transition-opacity ${
                        isUnassigned ? 'bg-gray-300' : colorClass
                      } ${!rule.isActive ? 'opacity-40' : ''} ${editingIndex === i ? 'ring-2 ring-offset-1 ring-blue-400' : ''}`}
                      style={{ width: `${widthPct}%`, minWidth: widthPct > 3 ? undefined : '4px' }}
                      onClick={() => setEditingIndex(editingIndex === i ? null : i)}
                      title={`${formatWeight(rule.minOz)} - ${formatWeight(rule.maxOz)}: ${getSegmentLabel(rule)}`}
                    >
                      {widthPct > 8 && (
                        <span className="text-white text-xs font-medium truncate px-1">
                          {getSegmentLabel(rule)}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
              {/* Tick marks at breakpoints */}
              <div className="relative h-2">
                {rules.slice(0, -1).map((rule, i) => {
                  const leftPct = (rule.maxOz / MAX_OZ) * 100
                  return (
                    <div
                      key={i}
                      className="absolute top-0 w-0.5 h-2 bg-gray-400"
                      style={{ left: `${leftPct}%` }}
                    />
                  )
                })}
              </div>
            </div>
          )}

          {/* Empty State */}
          {rules.length === 0 && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-12 text-center mb-6">
              <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
              </svg>
              <h3 className="text-lg font-semibold text-gray-700 mb-2">No Weight Rules</h3>
              <p className="text-gray-500 mb-4">
                Add weight-based routing rules to automatically assign carriers based on package weight.
              </p>
              <button
                onClick={addBreakpoint}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Create Your First Rule
              </button>
            </div>
          )}

          {/* Segments List */}
          {rules.length > 0 && (
            <div className="space-y-2 mb-4">
              {rules.map((rule, i) => {
                const isEditing = editingIndex === i
                const colorClass = SEGMENT_COLORS[i % SEGMENT_COLORS.length]
                const isUnassigned = rule.targetType === 'service' && !rule.serviceCode

                return (
                  <div
                    key={i}
                    className={`border rounded-lg overflow-hidden ${
                      isEditing ? 'border-blue-400 shadow-md' : 'border-gray-200'
                    }`}
                  >
                    {/* Segment Header */}
                    <div
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50"
                      onClick={() => setEditingIndex(isEditing ? null : i)}
                    >
                      <div className={`w-3 h-3 rounded-full ${isUnassigned ? 'bg-gray-300' : colorClass}`} />
                      <div className="flex-1">
                        <span className="text-sm font-medium">
                          {formatWeight(rule.minOz)} &ndash; {formatWeight(rule.maxOz)}
                        </span>
                        <span className="text-sm text-gray-500 ml-3">
                          {isUnassigned ? (
                            <span className="text-amber-600 italic">Unassigned</span>
                          ) : (
                            getSegmentLabel(rule)
                          )}
                        </span>
                        {rule.targetType === 'rate_shopper' && (
                          <span className="ml-2 text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">Rate Shop</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); splitSegment(i) }}
                          className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1"
                          title="Split this segment"
                        >
                          Split
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); removeSegment(i) }}
                          className="text-xs text-red-600 hover:text-red-800 px-2 py-1"
                          title="Remove this segment"
                        >
                          Remove
                        </button>
                        <svg
                          className={`w-4 h-4 text-gray-400 transition-transform ${isEditing ? 'rotate-180' : ''}`}
                          fill="none" stroke="currentColor" viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>

                    {/* Expanded Edit Section */}
                    {isEditing && (
                      <div className="border-t border-gray-200 bg-gray-50 p-4 space-y-4">
                        {/* Breakpoint editor */}
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Min Weight (oz)</label>
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={rule.minOz}
                              disabled={i === 0}
                              className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm disabled:bg-gray-100 disabled:text-gray-500"
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 0
                                if (i > 0) updateBreakpoint(i - 1, val)
                              }}
                            />
                            <span className="text-xs text-gray-400">{formatWeight(rule.minOz)}</span>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Max Weight (oz)</label>
                            <input
                              type="number"
                              min={rule.minOz + 1}
                              max={MAX_OZ}
                              step={1}
                              value={rule.maxOz}
                              disabled={i === rules.length - 1}
                              className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm disabled:bg-gray-100 disabled:text-gray-500"
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 0
                                updateBreakpoint(i, val)
                              }}
                            />
                            <span className="text-xs text-gray-400">{formatWeight(rule.maxOz)}</span>
                          </div>
                        </div>

                        {/* Target Type Selector */}
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Assign To</label>
                          <div className="flex gap-4 mb-3">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name={`targetType-${i}`}
                                checked={rule.targetType === 'service'}
                                onChange={() => updateSegmentTarget(i, {
                                  targetType: 'service',
                                  rateShopperId: undefined,
                                  rateShopper: null,
                                })}
                                className="text-blue-600"
                              />
                              <span className="text-sm">Carrier Service</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name={`targetType-${i}`}
                                checked={rule.targetType === 'rate_shopper'}
                                onChange={() => updateSegmentTarget(i, {
                                  targetType: 'rate_shopper',
                                  carrierId: undefined,
                                  carrierCode: undefined,
                                  serviceCode: undefined,
                                  serviceName: undefined,
                                })}
                                className="text-blue-600"
                              />
                              <span className="text-sm">Rate Shopper</span>
                            </label>
                          </div>

                          {/* Service Picker */}
                          {rule.targetType === 'service' && (
                            <select
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              value={rule.serviceCode || ''}
                              onChange={(e) => {
                                const svc = allServices.find((s) => s.serviceCode === e.target.value)
                                if (svc) {
                                  updateSegmentTarget(i, {
                                    carrierId: svc.carrierId,
                                    carrierCode: svc.carrierCode,
                                    serviceCode: svc.serviceCode,
                                    serviceName: svc.serviceName,
                                  })
                                } else {
                                  updateSegmentTarget(i, {
                                    carrierId: undefined,
                                    carrierCode: undefined,
                                    serviceCode: undefined,
                                    serviceName: undefined,
                                  })
                                }
                              }}
                            >
                              <option value="">-- Select a carrier service --</option>
                              {carriers.map((carrier) => (
                                <optgroup key={carrier.carrier_id} label={carrier.friendly_name}>
                                  {(carrier.services || []).filter((s) => s.domestic).map((service) => (
                                    <option key={`${carrier.carrier_id}-${service.service_code}`} value={service.service_code}>
                                      {service.name}
                                    </option>
                                  ))}
                                </optgroup>
                              ))}
                            </select>
                          )}

                          {/* Rate Shopper Picker */}
                          {rule.targetType === 'rate_shopper' && (
                            <select
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              value={rule.rateShopperId || ''}
                              onChange={(e) => {
                                const rs = rateShoppers.find((r) => r.id === e.target.value)
                                updateSegmentTarget(i, {
                                  rateShopperId: e.target.value || undefined,
                                  rateShopper: rs ? { id: rs.id, name: rs.name, active: rs.active } : null,
                                })
                              }}
                            >
                              <option value="">-- Select a rate shopper --</option>
                              {rateShoppers.filter((rs) => rs.active).map((rs) => (
                                <option key={rs.id} value={rs.id}>
                                  {rs.name} {rs.isDefault ? '(Default)' : ''}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Add Segment / Split Button */}
          {rules.length > 0 && rules[rules.length - 1].maxOz < MAX_OZ && (
            <button
              onClick={addBreakpoint}
              className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Segment
            </button>
          )}

          {rules.length > 0 && (
            <div className="mt-4 flex items-center justify-between">
              <button
                onClick={addBreakpoint}
                className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Split Last Segment
              </button>
              {hasChanges && (
                <span className="text-sm text-amber-600">Unsaved changes</span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ============================================================================
// Rate Shoppers Tab (moved from original page, unchanged logic)
// ============================================================================

function RateShoppersTab() {
  const [rateShoppers, setRateShoppers] = useState<RateShopper[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [carriers, setCarriers] = useState<Carrier[]>([])
  const [loadingCarriers, setLoadingCarriers] = useState(false)

  const [showModal, setShowModal] = useState(false)
  const [editingRateShopper, setEditingRateShopper] = useState<RateShopper | null>(null)
  const [saving, setSaving] = useState(false)

  const [formName, setFormName] = useState('')
  const [formServices, setFormServices] = useState<CarrierService[]>([])
  const [formTransitTime, setFormTransitTime] = useState('no_restriction')
  const [formPreferenceEnabled, setFormPreferenceEnabled] = useState(false)
  const [formPreferredService, setFormPreferredService] = useState('')
  const [formPreferenceType, setFormPreferenceType] = useState<'dollar' | 'percentage'>('dollar')
  const [formPreferenceValue, setFormPreferenceValue] = useState<number>(0)

  useEffect(() => {
    fetchRateShoppers()
    fetchCarriers()
  }, [])

  async function fetchRateShoppers() {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch('/api/rate-shoppers')
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to fetch rate shoppers')
      setRateShoppers(data.rateShoppers || [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function fetchCarriers() {
    try {
      setLoadingCarriers(true)
      const response = await fetch('/api/shipengine/carriers?includeServices=true')
      const data = await response.json()
      if (response.ok && data.carriers) setCarriers(data.carriers)
    } catch (err) {
      console.error('Error fetching carriers:', err)
    } finally {
      setLoadingCarriers(false)
    }
  }

  function openCreateModal() {
    setEditingRateShopper(null)
    setFormName('')
    setFormServices([])
    setFormTransitTime('no_restriction')
    setFormPreferenceEnabled(false)
    setFormPreferredService('')
    setFormPreferenceType('dollar')
    setFormPreferenceValue(0)
    setShowModal(true)
  }

  function openEditModal(rateShopper: RateShopper) {
    setEditingRateShopper(rateShopper)
    setFormName(rateShopper.name)
    setFormServices(rateShopper.services || [])
    setFormTransitTime(rateShopper.transitTimeRestriction || 'no_restriction')
    setFormPreferenceEnabled(rateShopper.preferenceEnabled)
    setFormPreferredService(rateShopper.preferredServiceCode || '')
    setFormPreferenceType((rateShopper.preferenceType as 'dollar' | 'percentage') || 'dollar')
    setFormPreferenceValue(rateShopper.preferenceValue || 0)
    setShowModal(true)
  }

  function closeModal() {
    setShowModal(false)
    setEditingRateShopper(null)
  }

  function addService(carrier: Carrier, service: { service_code: string; name: string }) {
    const newService: CarrierService = {
      carrierId: carrier.carrier_id,
      carrierName: carrier.friendly_name,
      serviceCode: service.service_code,
      serviceName: service.name,
    }
    const exists = formServices.some(
      (s) => s.carrierId === newService.carrierId && s.serviceCode === newService.serviceCode
    )
    if (!exists) setFormServices([...formServices, newService])
  }

  function removeService(carrierId: string, serviceCode: string) {
    setFormServices(formServices.filter((s) => !(s.carrierId === carrierId && s.serviceCode === serviceCode)))
    if (formPreferredService === serviceCode) setFormPreferredService('')
  }

  async function handleSave() {
    if (!formName.trim()) { alert('Please enter a name'); return }
    if (formServices.length === 0) { alert('Please select at least one service'); return }

    try {
      setSaving(true)
      const payload = {
        name: formName,
        services: formServices,
        transitTimeRestriction: formTransitTime === 'no_restriction' ? null : formTransitTime,
        preferenceEnabled: formPreferenceEnabled,
        preferredServiceCode: formPreferenceEnabled ? formPreferredService : null,
        preferenceType: formPreferenceEnabled ? formPreferenceType : null,
        preferenceValue: formPreferenceEnabled ? formPreferenceValue : null,
      }

      const url = editingRateShopper ? `/api/rate-shoppers/${editingRateShopper.id}` : '/api/rate-shoppers'
      const response = await fetch(url, {
        method: editingRateShopper ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to save')
      await fetchRateShoppers()
      closeModal()
    } catch (err: any) {
      alert(err.message || 'Failed to save rate shopper')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this rate shopper?')) return
    try {
      const response = await fetch(`/api/rate-shoppers/${id}`, { method: 'DELETE' })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to delete')
      }
      await fetchRateShoppers()
    } catch (err: any) {
      alert(err.message)
    }
  }

  async function handleSetDefault(id: string) {
    try {
      const response = await fetch(`/api/rate-shoppers/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDefault: true }),
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to set as default')
      }
      await fetchRateShoppers()
    } catch (err: any) {
      alert(err.message)
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-gray-600">
          Create rate shopping rules to automatically select the best shipping rate
        </p>
        <button
          onClick={openCreateModal}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create Rate Shopper
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <p className="text-red-800 font-semibold">Error</p>
          <p className="text-red-600 text-sm">{error}</p>
          <button onClick={fetchRateShoppers} className="mt-2 text-red-600 hover:text-red-800 text-sm underline">Try again</button>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="text-gray-500">Loading rate shoppers...</div>
        </div>
      )}

      {!loading && !error && rateShoppers.length === 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-12 text-center">
          <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
          <h3 className="text-lg font-semibold text-gray-700 mb-2">No Rate Shoppers Yet</h3>
          <p className="text-gray-500 mb-4">Create a rate shopper to automatically compare shipping services and select the best rate.</p>
          <button onClick={openCreateModal} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            Create Your First Rate Shopper
          </button>
        </div>
      )}

      {!loading && rateShoppers.length > 0 && (
        <div className="space-y-4">
          {rateShoppers.map((rateShopper) => (
            <div key={rateShopper.id} className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
              <div className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold">{rateShopper.name}</h3>
                      {rateShopper.isDefault && (
                        <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-semibold rounded">DEFAULT</span>
                      )}
                      {!rateShopper.active && (
                        <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs font-semibold rounded">INACTIVE</span>
                      )}
                    </div>
                    <div className="mt-3">
                      <p className="text-xs text-gray-500 mb-2">1. Compare these services ({rateShopper.services?.length || 0})</p>
                      <div className="flex flex-wrap gap-2">
                        {(rateShopper.services || []).slice(0, 4).map((service, idx) => (
                          <span key={idx} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 border border-blue-200 text-blue-800 text-sm rounded">
                            <svg className="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
                              <path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1v-1h3.05a2.5 2.5 0 014.9 0H19a1 1 0 001-1v-4a1 1 0 00-.2-.6l-3-4A1 1 0 0016 4H3zm13 5h-2V6h1.6l1.4 2v1z" />
                            </svg>
                            {service.serviceName}
                            <span className="text-xs text-blue-600">({service.carrierName})</span>
                          </span>
                        ))}
                        {(rateShopper.services?.length || 0) > 4 && (
                          <span className="px-2.5 py-1 bg-gray-100 text-gray-600 text-sm rounded">+{(rateShopper.services?.length || 0) - 4} more</span>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 text-sm text-gray-600">
                      <p>2. Select the lowest rate</p>
                      {rateShopper.transitTimeRestriction && rateShopper.transitTimeRestriction !== 'no_restriction' && (
                        <p className="text-xs text-gray-500 mt-1">Transit time: {rateShopper.transitTimeRestriction.replace('_', ' ')}</p>
                      )}
                      {rateShopper.preferenceEnabled && rateShopper.preferredServiceCode && (
                        <p className="text-xs text-gray-500 mt-1">
                          Prefer: {rateShopper.preferredServiceCode} if within {rateShopper.preferenceType === 'dollar' ? `$${rateShopper.preferenceValue}` : `${rateShopper.preferenceValue}%`}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    {!rateShopper.isDefault && (
                      <button onClick={() => handleSetDefault(rateShopper.id)} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded" title="Set as default">
                        Set Default
                      </button>
                    )}
                    <button onClick={() => openEditModal(rateShopper)} className="px-3 py-1.5 text-sm text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded">Edit</button>
                    <button onClick={() => handleDelete(rateShopper.id)} className="px-3 py-1.5 text-sm text-red-600 hover:text-red-800 hover:bg-red-50 rounded">Delete</button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Rate Shopper Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity" onClick={closeModal}>
              <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
            </div>
            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full">
              <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900">
                  {editingRateShopper ? 'Edit Rate Shopper' : 'Create Rate Shopper'}
                </h2>
                <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="flex">
                <div className="flex-1 p-6 border-r border-gray-200 max-h-[70vh] overflow-y-auto">
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="e.g., Standard Domestic"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                    />
                  </div>
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Services to Compare</label>
                    <p className="text-xs text-gray-500 mb-2">Automatically choose the cheapest of these services</p>
                    {formServices.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-3">
                        {formServices.map((service, idx) => (
                          <span key={idx} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-50 border border-blue-200 text-blue-800 text-sm rounded">
                            <svg className="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
                              <path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1v-1h3.05a2.5 2.5 0 014.9 0H19a1 1 0 001-1v-4a1 1 0 00-.2-.6l-3-4A1 1 0 0016 4H3zm13 5h-2V6h1.6l1.4 2v1z" />
                            </svg>
                            {service.serviceName}
                            <span className="text-xs text-blue-600">({service.carrierName})</span>
                            <button onClick={() => removeService(service.carrierId, service.serviceCode)} className="ml-1 text-blue-400 hover:text-blue-600">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="border border-gray-300 rounded-lg overflow-hidden">
                      <div className="max-h-48 overflow-y-auto">
                        {loadingCarriers ? (
                          <div className="p-4 text-center text-gray-500">Loading services...</div>
                        ) : carriers.length === 0 ? (
                          <div className="p-4 text-center text-gray-500">No carriers found</div>
                        ) : (
                          carriers.map((carrier) => (
                            <div key={carrier.carrier_id}>
                              <div className="bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700 border-b">{carrier.friendly_name}</div>
                              {carrier.services && carrier.services.length > 0 ? (
                                carrier.services.filter((s) => s.domestic).map((service) => {
                                  const isSelected = formServices.some((s) => s.carrierId === carrier.carrier_id && s.serviceCode === service.service_code)
                                  return (
                                    <div
                                      key={`${carrier.carrier_id}-${service.service_code}`}
                                      className={`px-3 py-2 flex items-center justify-between hover:bg-gray-50 cursor-pointer ${isSelected ? 'bg-blue-50' : ''}`}
                                      onClick={() => isSelected ? removeService(carrier.carrier_id, service.service_code) : addService(carrier, service)}
                                    >
                                      <span className="text-sm">{service.name}</span>
                                      {isSelected && (
                                        <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                        </svg>
                                      )}
                                    </div>
                                  )
                                })
                              ) : (
                                <div className="px-3 py-2 text-sm text-gray-500">No services available</div>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Transit Time</label>
                    <p className="text-xs text-gray-500 mb-2">Restricts eligible services to those that deliver within specified time</p>
                    <select
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      value={formTransitTime}
                      onChange={(e) => setFormTransitTime(e.target.value)}
                    >
                      {TRANSIT_TIME_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="mb-6">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Preference <span className="text-gray-400 font-normal">(optional)</span></label>
                        <p className="text-xs text-gray-500">Override the service selection with &quot;Service Preference&quot;</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFormPreferenceEnabled(!formPreferenceEnabled)}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${formPreferenceEnabled ? 'bg-blue-600' : 'bg-gray-200'}`}
                      >
                        <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${formPreferenceEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                      </button>
                    </div>
                    {formPreferenceEnabled && (
                      <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                        <div className="mb-4">
                          <label className="block text-sm font-medium text-gray-700 mb-1">Use this service</label>
                          <select
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            value={formPreferredService}
                            onChange={(e) => setFormPreferredService(e.target.value)}
                          >
                            <option value="">Select Service</option>
                            {formServices.map((service, idx) => (
                              <option key={idx} value={service.serviceCode}>{service.serviceName} ({service.carrierName})</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">If the cheapest label is within</label>
                          <div className="flex items-center gap-4">
                            <label className="flex items-center gap-2">
                              <input type="radio" name="preferenceType" value="dollar" checked={formPreferenceType === 'dollar'} onChange={() => setFormPreferenceType('dollar')} className="text-blue-600 focus:ring-blue-500" />
                              <span className="text-sm">Dollar Amount</span>
                            </label>
                            <label className="flex items-center gap-2">
                              <input type="radio" name="preferenceType" value="percentage" checked={formPreferenceType === 'percentage'} onChange={() => setFormPreferenceType('percentage')} className="text-blue-600 focus:ring-blue-500" />
                              <span className="text-sm">Percentage Difference</span>
                            </label>
                          </div>
                          <div className="flex gap-2 mt-2">
                            <div className="flex-1 relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">{formPreferenceType === 'dollar' ? '$' : ''}</span>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${formPreferenceType === 'dollar' ? 'pl-7' : ''}`}
                                placeholder={formPreferenceType === 'dollar' ? '0.00' : '0'}
                                value={formPreferenceValue || ''}
                                onChange={(e) => setFormPreferenceValue(parseFloat(e.target.value) || 0)}
                              />
                              {formPreferenceType === 'percentage' && (
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">%</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="w-80 p-6 bg-gray-50">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">{formName || 'Untitled Rate Shopper'}</h3>
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm font-medium text-gray-700 mb-2">1. Compare these services</p>
                      <div className="flex flex-wrap gap-2">
                        {formServices.length === 0 ? (
                          <span className="text-sm text-gray-400">No services selected</span>
                        ) : (
                          formServices.map((service, idx) => (
                            <span key={idx} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 border border-blue-200 text-blue-800 text-xs rounded">
                              <svg className="w-3 h-3 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
                                <path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1v-1h3.05a2.5 2.5 0 014.9 0H19a1 1 0 001-1v-4a1 1 0 00-.2-.6l-3-4A1 1 0 0016 4H3zm13 5h-2V6h1.6l1.4 2v1z" />
                              </svg>
                              {service.serviceName}
                              <span className="text-blue-600">({service.carrierName})</span>
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-700">2. Select the lowest rate</p>
                      {formTransitTime !== 'no_restriction' && (
                        <p className="text-xs text-gray-500 mt-1">Within {formTransitTime.replace('_', ' ')}</p>
                      )}
                    </div>
                    {formPreferenceEnabled && formPreferredService && (
                      <div>
                        <p className="text-sm font-medium text-gray-700">3. Service preference</p>
                        <p className="text-xs text-gray-500 mt-1">
                          Use {formServices.find((s) => s.serviceCode === formPreferredService)?.serviceName || formPreferredService}{' '}
                          if within {formPreferenceType === 'dollar' ? `$${formPreferenceValue}` : `${formPreferenceValue}%`}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex items-center justify-between">
                <button onClick={closeModal} className="text-gray-600 hover:text-gray-800 text-sm">Cancel</button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
                >
                  {saving ? 'Saving...' : editingRateShopper ? 'Update' : 'Publish'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
