'use client'

import { useState, useEffect } from 'react'
import { Carrier, CarrierService, RateShopper } from './types'
import { TRANSIT_TIME_OPTIONS, buildCarriersFromSelectedServices } from './helpers'

export function RateShoppersTab() {
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
      const settingsRes = await fetch('/api/settings')
      const settingsData = await settingsRes.json()
      if (settingsRes.ok && settingsData.settings) {
        setCarriers(buildCarriersFromSelectedServices(settingsData.settings))
      }
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
