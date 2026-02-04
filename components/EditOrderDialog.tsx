'use client'

import { Fragment, useState, useEffect } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { useReferenceData } from '@/lib/use-reference-data'

interface EditOrderDialogProps {
  isOpen: boolean
  onClose: () => void
  orderId: string
  orderNumber: string
  rawPayload: any
  preShoppedRate: any
  shippedWeight: number | null
  rateShopStatus: string | null
  rateShopError: string | null
  onSaved: (updatedOrder: any) => void
}

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN',
  'IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH',
  'NJ','NM','NY','NC','ND','OH','OK','OR','PA','PR','RI','SC','SD','TN','TX',
  'UT','VT','VA','WA','WV','WI','WY',
]

export default function EditOrderDialog({
  isOpen,
  onClose,
  orderId,
  orderNumber,
  rawPayload,
  preShoppedRate,
  shippedWeight,
  rateShopStatus,
  rateShopError,
  onSaved,
}: EditOrderDialogProps) {
  const orderData = Array.isArray(rawPayload) ? rawPayload[0] : rawPayload
  const shipTo = orderData?.shipTo || {}

  // Load only the user's selected carrier services (from Carriers tab config)
  const { carrierServices, loaded: refDataLoaded } = useReferenceData()

  // Address form state
  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [street1, setStreet1] = useState('')
  const [street2, setStreet2] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [country, setCountry] = useState('US')
  const [phone, setPhone] = useState('')

  // Carrier state - single service code since carrierServices is a flat list
  const [selectedServiceCode, setSelectedServiceCode] = useState('')

  // Weight state
  const [weight, setWeight] = useState('')

  // Save state
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Populate form when dialog opens
  useEffect(() => {
    if (isOpen) {
      setName(shipTo.name || '')
      setCompany(shipTo.company || '')
      setStreet1(shipTo.street1 || '')
      setStreet2(shipTo.street2 || '')
      setCity(shipTo.city || '')
      setState(shipTo.state || '')
      setPostalCode(shipTo.postalCode || '')
      setCountry(shipTo.country || 'US')
      setPhone(shipTo.phone || '')
      setWeight(shippedWeight ? String(shippedWeight) : '')
      setSelectedServiceCode(preShoppedRate?.serviceCode || '')
      setSaveError(null)
    }
  }, [isOpen, shipTo, shippedWeight, preShoppedRate])

  const handleSave = async (retryRateShopping: boolean) => {
    setSaving(true)
    setSaveError(null)

    try {
      // Build changed fields
      const body: any = {}

      // Check address changes
      const addressChanged =
        name !== (shipTo.name || '') ||
        company !== (shipTo.company || '') ||
        street1 !== (shipTo.street1 || '') ||
        street2 !== (shipTo.street2 || '') ||
        city !== (shipTo.city || '') ||
        state !== (shipTo.state || '') ||
        postalCode !== (shipTo.postalCode || '') ||
        country !== (shipTo.country || 'US') ||
        phone !== (shipTo.phone || '')

      if (addressChanged) {
        body.address = { name, company, street1, street2, city, state, postalCode, country, phone }
      }

      // Check weight change
      const newWeight = parseFloat(weight)
      if (!isNaN(newWeight) && newWeight !== shippedWeight) {
        body.weight = newWeight
      }

      // Check carrier change
      if (selectedServiceCode) {
        const carrierChanged = selectedServiceCode !== (preShoppedRate?.serviceCode || '')

        if (carrierChanged) {
          const service = carrierServices.find(s => s.serviceCode === selectedServiceCode)
          if (service) {
            body.carrier = {
              carrierId: service.carrierId,
              carrierCode: service.carrierCode,
              carrier: service.carrierName,
              serviceCode: service.serviceCode,
              serviceName: service.serviceName,
            }
          }
        }
      }

      if (retryRateShopping) {
        body.retryRateShopping = true
      }

      // Don't call API if nothing changed and no retry
      if (Object.keys(body).length === 0) {
        onClose()
        return
      }

      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to update order')
      }

      onSaved(data.order)
      onClose()
    } catch (err: any) {
      setSaveError(err.message || 'Failed to save changes')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-25" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-3xl transform overflow-hidden rounded-2xl bg-white text-left align-middle shadow-xl transition-all">
                {/* Header */}
                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4">
                  <div className="flex items-center justify-between">
                    <Dialog.Title as="h3" className="text-xl font-bold text-white">
                      Edit Order #{orderNumber}
                    </Dialog.Title>
                    <button
                      onClick={onClose}
                      className="rounded-full p-1 text-white hover:bg-white/20 transition-colors"
                    >
                      <XMarkIcon className="h-6 w-6" />
                    </button>
                  </div>
                </div>

                {/* Content */}
                <div className="max-h-[calc(100vh-200px)] overflow-y-auto p-6">
                  {/* Error Banner */}
                  {rateShopStatus === 'FAILED' && rateShopError && (
                    <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
                      <h4 className="text-sm font-semibold text-red-800 mb-1">Rate Shopping Error</h4>
                      <p className="text-sm text-red-700">{rateShopError}</p>
                      {rateShopError.toLowerCase().includes('carrier') && (
                        <p className="text-xs text-red-500 mt-2">Hint: Try changing the carrier/service assignment below.</p>
                      )}
                      {(rateShopError.toLowerCase().includes('address') || rateShopError.toLowerCase().includes('postal')) && (
                        <p className="text-xs text-red-500 mt-2">Hint: Check the shipping address fields below for missing or invalid data.</p>
                      )}
                      {rateShopError.toLowerCase().includes('box') && (
                        <p className="text-xs text-red-500 mt-2">Hint: No box suggestion found. Check Products/Box Config.</p>
                      )}
                    </div>
                  )}

                  {/* Save Error */}
                  {saveError && (
                    <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
                      <p className="text-sm text-red-700">{saveError}</p>
                    </div>
                  )}

                  {/* Shipping Address */}
                  <div className="mb-6">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">
                      Shipping Address
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
                        <input
                          type="text"
                          value={name}
                          onChange={e => setName(e.target.value)}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Company</label>
                        <input
                          type="text"
                          value={company}
                          onChange={e => setCompany(e.target.value)}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-medium text-gray-600 mb-1">Street 1</label>
                        <input
                          type="text"
                          value={street1}
                          onChange={e => setStreet1(e.target.value)}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-medium text-gray-600 mb-1">Street 2</label>
                        <input
                          type="text"
                          value={street2}
                          onChange={e => setStreet2(e.target.value)}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">City</label>
                        <input
                          type="text"
                          value={city}
                          onChange={e => setCity(e.target.value)}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">State</label>
                        {country === 'US' ? (
                          <select
                            value={state}
                            onChange={e => setState(e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          >
                            <option value="">Select state...</option>
                            {US_STATES.map(s => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={state}
                            onChange={e => setState(e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        )}
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Postal Code</label>
                        <input
                          type="text"
                          value={postalCode}
                          onChange={e => setPostalCode(e.target.value)}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Country</label>
                        <input
                          type="text"
                          value={country}
                          onChange={e => setCountry(e.target.value)}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          placeholder="US"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
                        <input
                          type="text"
                          value={phone}
                          onChange={e => setPhone(e.target.value)}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Carrier / Service */}
                  <div className="mb-6">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">
                      Carrier & Service
                    </h3>
                    {preShoppedRate && (
                      <p className="text-xs text-gray-500 mb-2">
                        Current: {preShoppedRate.carrier} - {preShoppedRate.serviceName}
                        {preShoppedRate.price > 0 && ` ($${preShoppedRate.price.toFixed(2)})`}
                      </p>
                    )}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Service</label>
                      <select
                        value={selectedServiceCode}
                        onChange={e => setSelectedServiceCode(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        disabled={!refDataLoaded}
                      >
                        <option value="">{!refDataLoaded ? 'Loading services...' : 'Select service...'}</option>
                        {carrierServices.map(s => (
                          <option key={s.serviceCode} value={s.serviceCode}>
                            {s.carrierName} - {s.serviceName}
                          </option>
                        ))}
                      </select>
                      {refDataLoaded && carrierServices.length === 0 && (
                        <p className="text-xs text-amber-600 mt-1">
                          No services configured. Go to the Carriers tab to select services.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Weight */}
                  <div className="mb-6">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">
                      Weight
                    </h3>
                    <div className="max-w-xs">
                      <label className="block text-xs font-medium text-gray-600 mb-1">Weight (lbs)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={weight}
                        onChange={e => setWeight(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="e.g. 1.5"
                      />
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex justify-between items-center">
                  <button
                    onClick={onClose}
                    disabled={saving}
                    className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSave(true)}
                      disabled={saving}
                      className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50"
                    >
                      {saving ? 'Saving...' : 'Save & Re-Shop Rates'}
                    </button>
                    <button
                      onClick={() => handleSave(false)}
                      disabled={saving}
                      className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50"
                    >
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}
