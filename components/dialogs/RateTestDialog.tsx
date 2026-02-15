'use client'

import { useState } from 'react'
import { Dialog } from '@headlessui/react'
import { useReferenceData } from '@/hooks/useReferenceData'

interface Rate {
  rateId: string
  carrier: string
  carrierCode: string
  serviceCode: string
  serviceName: string
  price: number
  currency: string
  deliveryDays: number | null
  estimatedDeliveryDate: string | null
  trackable: boolean
  attributes: string[]
  validationStatus: string
}

interface RateTestDialogProps {
  isOpen: boolean
  onClose: () => void
  order: any
}

export default function RateTestDialog({ isOpen, onClose, order }: RateTestDialogProps) {
  const ref = useReferenceData()
  const [rates, setRates] = useState<Rate[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fetched, setFetched] = useState(false)
  const [selectedServiceCount, setSelectedServiceCount] = useState<number>(0)
  const [filteredByServices, setFilteredByServices] = useState<boolean>(false)

  async function fetchRates() {
    try {
      setLoading(true)
      setError(null)
      setFetched(false)

      // Use cached location from shared reference data
      const loc = ref.locations.find(l => l.isDefault) || ref.locations[0]

      if (!loc) {
        throw new Error('No ship-from location configured. Please add a location in Settings > Locations.')
      }

      // Extract order data
      const shipTo = order?.shipTo || {}
      const weight = order?.weight || { value: 1, unit: 'pound' }
      const dimensions = order?.dimensions || { length: 12, width: 9, height: 4, unit: 'inch' }

      // Build request
      const requestBody = {
        shipFrom: {
          name: loc.name,
          company: loc.company || loc.name,
          street1: loc.addressLine1,
          street2: loc.addressLine2,
          city: loc.city,
          state: loc.state,
          postalCode: loc.postalCode,
          country: loc.country,
          phone: loc.phone,
        },
        shipTo: {
          name: shipTo.name || 'Customer',
          street1: shipTo.street1 || shipTo.address1 || '',
          street2: shipTo.street2 || shipTo.address2,
          city: shipTo.city || '',
          state: shipTo.state || '',
          postalCode: shipTo.postalCode || shipTo.zip || '',
          country: shipTo.country || 'US',
          residential: true,
        },
        packages: [
          {
            weight: {
              value: weight.value || 1,
              unit: weight.unit || 'pound',
            },
            dimensions: {
              length: dimensions.length || 12,
              width: dimensions.width || 9,
              height: dimensions.height || 4,
              unit: dimensions.unit || 'inch',
            },
          },
        ],
      }

      const response = await fetch('/api/shipengine/get-rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch rates')
      }

      setRates(data.rates || [])
      setFilteredByServices(data.filteredByServices || false)
      setSelectedServiceCount(data.selectedServiceCount || 0)
      setFetched(true)
    } catch (err: any) {
      console.error('Error fetching rates:', err)
      setError(err.message || 'Failed to fetch rates')
    } finally {
      setLoading(false)
    }
  }

  function formatDeliveryDate(dateString: string | null, days: number | null) {
    if (dateString) {
      const date = new Date(dateString)
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    }
    if (days) {
      const date = new Date()
      date.setDate(date.getDate() + days)
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    }
    return 'N/A'
  }

  function handleClose() {
    setRates([])
    setError(null)
    setFetched(false)
    onClose()
  }

  // Extract order info for display
  const shipTo = order?.shipTo || {}
  const weight = order?.weight || { value: 1, unit: 'pound' }
  const dimensions = order?.dimensions || { length: 12, width: 9, height: 4, unit: 'inch' }

  return (
    <Dialog open={isOpen} onClose={handleClose} className="relative z-50">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />

      {/* Dialog Container */}
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="mx-auto max-w-4xl w-full bg-white rounded-lg shadow-xl max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
            <div>
              <Dialog.Title className="text-xl font-bold">
                Get Rates - Order #{order?.orderNumber}
              </Dialog.Title>
              <p className="text-sm text-gray-600 mt-1">
                Destination: {shipTo.city}, {shipTo.state} {shipTo.postalCode}
              </p>
            </div>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
            >
              ×
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {/* Order Details */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
              <h3 className="font-semibold mb-2">Shipment Details</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-600">Ship To:</p>
                  <p className="font-medium">{shipTo.name || 'N/A'}</p>
                  <p className="text-xs text-gray-500">
                    {shipTo.street1 || 'N/A'}
                    <br />
                    {shipTo.city}, {shipTo.state} {shipTo.postalCode}
                  </p>
                </div>
                <div>
                  <p className="text-gray-600">Package:</p>
                  <p className="text-xs text-gray-700">
                    <strong>Weight:</strong> {weight.value} {weight.unit}
                    <br />
                    <strong>Dimensions:</strong> {dimensions.length} × {dimensions.width} ×{' '}
                    {dimensions.height} {dimensions.unit}
                  </p>
                </div>
              </div>
            </div>

            {/* Get Rates Button */}
            {!fetched && (
              <button
                onClick={fetchRates}
                disabled={loading}
                className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold mb-4"
              >
                {loading ? 'Loading Rates...' : 'Get Rates from Selected Services'}
              </button>
            )}

            {/* Error */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                <p className="text-red-800 font-semibold">Error</p>
                <p className="text-red-600 text-sm">{error}</p>
                <button
                  onClick={fetchRates}
                  className="mt-2 px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
                >
                  Retry
                </button>
              </div>
            )}

            {/* Loading */}
            {loading && (
              <div className="flex items-center justify-center py-8">
                <div className="text-gray-500">Fetching rates from ShipEngine...</div>
              </div>
            )}

            {/* Rates Results */}
            {fetched && rates.length > 0 && (
              <div>
                <div className="flex justify-between items-center mb-3">
                  <div>
                    <h3 className="text-lg font-semibold">
                      Available Rates ({rates.length})
                    </h3>
                    {filteredByServices && (
                      <p className="text-xs text-green-600 mt-1">
                        Filtered to {selectedServiceCount} selected service{selectedServiceCount !== 1 ? 's' : ''} from Carriers page
                      </p>
                    )}
                  </div>
                  <button
                    onClick={fetchRates}
                    className="text-sm text-blue-600 hover:text-blue-700"
                  >
                    Refresh
                  </button>
                </div>
                <div className="space-y-2">
                  {rates.map((rate) => (
                    <div
                      key={rate.rateId}
                      className="bg-white border-2 border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-all"
                    >
                      <div className="flex justify-between items-start">
                        {/* Left: Service Info */}
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-semibold text-base">{rate.serviceName}</h4>
                            {/* Badges */}
                            {rate.attributes.includes('best_value') && (
                              <span className="px-2 py-0.5 bg-purple-100 text-purple-800 text-xs font-semibold rounded">
                                BEST VALUE
                              </span>
                            )}
                            {rate.attributes.includes('cheapest') && (
                              <span className="px-2 py-0.5 bg-green-100 text-green-800 text-xs font-semibold rounded">
                                CHEAPEST
                              </span>
                            )}
                            {rate.attributes.includes('fastest') && (
                              <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs font-semibold rounded">
                                FASTEST
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-600 mb-1">{rate.carrier}</p>
                          <div className="flex items-center gap-3 text-sm">
                            <div>
                              <span className="text-gray-500">Delivery:</span>{' '}
                              <span className="font-medium">
                                {formatDeliveryDate(rate.estimatedDeliveryDate, rate.deliveryDays)}
                              </span>
                              {rate.deliveryDays && (
                                <span className="text-gray-500 ml-1">
                                  ({rate.deliveryDays}{' '}
                                  {rate.deliveryDays === 1 ? 'day' : 'days'})
                                </span>
                              )}
                            </div>
                            {rate.trackable && (
                              <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
                                Trackable
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Right: Price */}
                        <div className="text-right ml-4">
                          <div className="text-2xl font-bold text-gray-900">
                            ${rate.price.toFixed(2)}
                          </div>
                          <div className="text-xs text-gray-500">{rate.currency}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {fetched && rates.length === 0 && !error && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
                <p className="text-yellow-800">No rates found for this shipment</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
            <button
              onClick={handleClose}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Close
            </button>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  )
}
