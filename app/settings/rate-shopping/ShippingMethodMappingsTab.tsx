'use client'

import { useState, useEffect } from 'react'
import { Carrier, RateShopper, ShippingMethodMapping } from './types'

export function ShippingMethodMappingsTab() {
  const [mappings, setMappings] = useState<ShippingMethodMapping[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Carriers for the service picker (filtered to selected services only)
  const [carriers, setCarriers] = useState<Carrier[]>([])
  const [loadingCarriers, setLoadingCarriers] = useState(false)
  const [selectedServiceKeys, setSelectedServiceKeys] = useState<Set<string>>(new Set())

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
      const [carriersRes, settingsRes] = await Promise.all([
        fetch('/api/shipengine/carriers?includeServices=true'),
        fetch('/api/settings'),
      ])
      const carriersData = await carriersRes.json()
      const settingsData = await settingsRes.json()

      // Build set of selected service keys
      const keys = new Set<string>()
      const selectedSetting = settingsData.settings?.find((s: { key: string }) => s.key === 'selected_services')
      if (selectedSetting?.value?.services) {
        for (const svc of selectedSetting.value.services) {
          keys.add(`${svc.carrierId}:${svc.serviceCode}`)
        }
      }
      setSelectedServiceKeys(keys)

      if (carriersRes.ok && carriersData.carriers) {
        // Filter carriers to only include selected services
        const filtered = (carriersData.carriers as Carrier[])
          .map((carrier) => ({
            ...carrier,
            services: (carrier.services || []).filter(
              (s) => keys.size === 0 || keys.has(`${carrier.carrier_id}:${s.service_code}`)
            ),
          }))
          .filter((carrier) => carrier.services.length > 0)
        setCarriers(filtered)
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
