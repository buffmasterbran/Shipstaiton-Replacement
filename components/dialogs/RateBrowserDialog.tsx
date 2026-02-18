'use client'

import { Fragment, useState, useEffect, useMemo, useCallback } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { useReferenceData, type ShipLocation } from '@/hooks/useReferenceData'

interface Rate {
  rateId: string
  carrier: string
  carrierCode: string
  carrierId: string
  serviceCode: string
  serviceName: string
  price: number
  currency: string
  deliveryDays: number | null
  estimatedDeliveryDate: string | null
  trackable: boolean
  attributes: string[]
}

interface CarrierGroup {
  carrierId: string
  carrierCode: string
  carrierName: string
  rates: Rate[]
}

interface RateBrowserDialogProps {
  isOpen: boolean
  onClose: () => void
  order: any
  orderLog: any
  onSelectRate: (rate: Rate) => void
}

export default function RateBrowserDialog({ isOpen, onClose, order, orderLog, onSelectRate }: RateBrowserDialogProps) {
  const { locations, boxes, loaded: refLoaded } = useReferenceData()

  // Config state - pre-filled from order
  const [shipFromId, setShipFromId] = useState('')
  const [country, setCountry] = useState('US')
  const [postalCode, setPostalCode] = useState('')
  const [residential, setResidential] = useState(true)
  const [weightLbs, setWeightLbs] = useState('')
  const [weightOz, setWeightOz] = useState('')
  const [length, setLength] = useState('')
  const [width, setWidth] = useState('')
  const [height, setHeight] = useState('')

  // Results state
  const [allRates, setAllRates] = useState<Rate[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fetched, setFetched] = useState(false)
  const [selectedCarrierId, setSelectedCarrierId] = useState<string | null>(null)

  // Pre-fill from order when dialog opens
  useEffect(() => {
    if (!isOpen || !order) return
    const shipTo = order.shipTo || {}
    setCountry(shipTo.country || 'US')
    setPostalCode(shipTo.postalCode || '')
    setResidential(shipTo.residential !== false)

    const box = orderLog?.suggestedBox
    setLength(box?.lengthInches != null ? String(box.lengthInches) : '')
    setWidth(box?.widthInches != null ? String(box.widthInches) : '')
    setHeight(box?.heightInches != null ? String(box.heightInches) : '')

    const totalLbs = orderLog?.shippedWeight || 0
    const wholeLbs = Math.floor(totalLbs)
    const oz = Math.round((totalLbs - wholeLbs) * 16 * 100) / 100
    setWeightLbs(String(wholeLbs))
    setWeightOz(String(oz))

    const fromId = order.shipFrom?.locationId || ''
    setShipFromId(fromId)

    setAllRates([])
    setFetched(false)
    setError(null)
    setSelectedCarrierId(null)
  }, [isOpen, order, orderLog])

  // Set default location when locations load
  useEffect(() => {
    if (!refLoaded || shipFromId) return
    const def = locations.find(l => l.isDefault) || locations[0]
    if (def) setShipFromId(def.id)
  }, [refLoaded, locations, shipFromId])

  const selectedLocation = useMemo(() => locations.find(l => l.id === shipFromId), [locations, shipFromId])

  const totalWeightLbs = useMemo(() => {
    const lbs = parseFloat(weightLbs) || 0
    const oz = parseFloat(weightOz) || 0
    return lbs + oz / 16
  }, [weightLbs, weightOz])

  const carrierGroups = useMemo<CarrierGroup[]>(() => {
    const map = new Map<string, CarrierGroup>()
    for (const rate of allRates) {
      if (!map.has(rate.carrierId)) {
        map.set(rate.carrierId, { carrierId: rate.carrierId, carrierCode: rate.carrierCode, carrierName: rate.carrier, rates: [] })
      }
      map.get(rate.carrierId)!.rates.push(rate)
    }
    const groups = Array.from(map.values())
    groups.forEach(g => g.rates.sort((a, b) => a.price - b.price))
    return groups
  }, [allRates])

  const visibleRates = useMemo(() => {
    if (!selectedCarrierId) return allRates
    return allRates.filter(r => r.carrierId === selectedCarrierId)
  }, [allRates, selectedCarrierId])

  const visibleCarrierName = useMemo(() => {
    if (!selectedCarrierId) return 'All Carriers'
    return carrierGroups.find(g => g.carrierId === selectedCarrierId)?.carrierName || 'Carrier'
  }, [selectedCarrierId, carrierGroups])

  const fetchRates = useCallback(async () => {
    if (!selectedLocation) return
    setLoading(true)
    setError(null)
    setFetched(false)
    setSelectedCarrierId(null)

    try {
      const shipTo = order?.shipTo || {}
      const res = await fetch('/api/shipengine/get-rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shipFrom: {
            name: selectedLocation.name,
            company: selectedLocation.company || selectedLocation.name,
            street1: selectedLocation.addressLine1,
            street2: selectedLocation.addressLine2,
            city: selectedLocation.city,
            state: selectedLocation.state,
            postalCode: selectedLocation.postalCode,
            country: selectedLocation.country,
            phone: selectedLocation.phone,
          },
          shipTo: {
            name: shipTo.name || 'Customer',
            street1: shipTo.street1 || '',
            street2: shipTo.street2,
            city: shipTo.city || '',
            state: shipTo.state || '',
            postalCode,
            country,
            residential,
          },
          packages: [{
            weight: { value: totalWeightLbs || 1, unit: 'pound' },
            dimensions: {
              length: parseFloat(length) || 1,
              width: parseFloat(width) || 1,
              height: parseFloat(height) || 1,
              unit: 'inch',
            },
          }],
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to fetch rates')

      setAllRates(data.rates || [])
      setFetched(true)
    } catch (e: any) {
      setError(e.message || 'Failed to fetch rates')
    } finally {
      setLoading(false)
    }
  }, [selectedLocation, order, postalCode, country, residential, totalWeightLbs, length, width, height])

  const handleSelectRate = useCallback((rate: Rate) => {
    onSelectRate(rate)
    onClose()
  }, [onSelectRate, onClose])

  const inputCls = 'w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none'
  const labelCls = 'block text-xs font-semibold text-gray-600 mb-1'

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-[60]" onClose={onClose}>
        <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0">
          <div className="fixed inset-0 bg-black/50" />
        </Transition.Child>
        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100" leave="ease-in duration-150" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
              <Dialog.Panel className="w-full max-w-5xl max-h-[90vh] rounded-xl bg-white shadow-2xl flex flex-col overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-3 border-b bg-gray-50">
                  <Dialog.Title className="text-lg font-bold text-gray-900">Rate Browser</Dialog.Title>
                  <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                  </button>
                </div>

                {/* 3-panel body */}
                <div className="flex flex-1 min-h-0">

                  {/* LEFT: Configure */}
                  <div className="w-64 flex-shrink-0 border-r overflow-y-auto p-4 space-y-4 bg-white">
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Configure Rates</h3>

                    <div>
                      <label className={labelCls}>Ship From</label>
                      <select value={shipFromId} onChange={e => setShipFromId(e.target.value)} className={inputCls}>
                        <option value="">Select location...</option>
                        {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                      </select>
                    </div>

                    <div>
                      <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Ship To</h4>
                      <div className="space-y-2">
                        <div>
                          <label className={labelCls}>Country</label>
                          <input value={country} onChange={e => setCountry(e.target.value)} className={inputCls} maxLength={2} />
                        </div>
                        <div>
                          <label className={labelCls}>Postal Code</label>
                          <input value={postalCode} onChange={e => setPostalCode(e.target.value)} className={inputCls} />
                        </div>
                        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                          <input type="checkbox" checked={residential} onChange={e => setResidential(e.target.checked)} className="rounded border-gray-300 text-green-600 focus:ring-green-500" />
                          Residential Address
                        </label>
                      </div>
                    </div>

                    <div>
                      <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Shipment Information</h4>
                      <div className="space-y-2">
                        <div>
                          <label className={labelCls}>Weight</label>
                          <div className="flex items-center gap-1.5">
                            <input type="number" min="0" value={weightLbs} onChange={e => setWeightLbs(e.target.value)} className={`w-16 ${inputCls}`} />
                            <span className="text-xs text-gray-500">(lb)</span>
                            <input type="number" min="0" step="0.01" value={weightOz} onChange={e => setWeightOz(e.target.value)} className={`w-16 ${inputCls}`} />
                            <span className="text-xs text-gray-500">(oz)</span>
                          </div>
                        </div>
                        <div>
                          <label className={labelCls}>Size</label>
                          <div className="flex items-center gap-1">
                            <input type="number" min="0" step="0.1" placeholder="L" value={length} onChange={e => setLength(e.target.value)} className={`w-14 ${inputCls}`} />
                            <span className="text-gray-400">x</span>
                            <input type="number" min="0" step="0.1" placeholder="W" value={width} onChange={e => setWidth(e.target.value)} className={`w-14 ${inputCls}`} />
                            <span className="text-gray-400">x</span>
                            <input type="number" min="0" step="0.1" placeholder="H" value={height} onChange={e => setHeight(e.target.value)} className={`w-14 ${inputCls}`} />
                            <span className="text-xs text-gray-500">(in)</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={fetchRates}
                      disabled={loading || !selectedLocation}
                      className="w-full py-2 px-4 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {loading ? 'Loading...' : 'Browse Rates'}
                    </button>
                  </div>

                  {/* MIDDLE: Carrier Accounts */}
                  <div className="w-52 flex-shrink-0 border-r overflow-y-auto bg-gray-50">
                    {fetched && (
                      <>
                        <div className="px-3 py-2 border-b bg-gray-100">
                          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Carrier Accounts</h3>
                          <div className="text-xs text-gray-400 mt-0.5">{carrierGroups.length} of {carrierGroups.length} carriers available</div>
                        </div>
                        <div className="divide-y divide-gray-200">
                          <button
                            onClick={() => setSelectedCarrierId(null)}
                            className={`w-full text-left px-3 py-2.5 flex items-center justify-between transition-colors ${!selectedCarrierId ? 'bg-white border-l-2 border-l-green-600' : 'hover:bg-white'}`}
                          >
                            <span className="text-sm font-medium text-gray-800 truncate">All Carriers</span>
                            <span className="flex-shrink-0 ml-2 bg-blue-100 text-blue-700 text-xs font-bold px-1.5 py-0.5 rounded-full">{allRates.length}</span>
                          </button>
                          {carrierGroups.map(g => (
                            <button
                              key={g.carrierId}
                              onClick={() => setSelectedCarrierId(g.carrierId)}
                              className={`w-full text-left px-3 py-2.5 flex items-center justify-between transition-colors ${selectedCarrierId === g.carrierId ? 'bg-white border-l-2 border-l-green-600' : 'hover:bg-white'}`}
                            >
                              <span className="text-sm font-medium text-gray-800 truncate">{g.carrierName}</span>
                              <span className="flex-shrink-0 ml-2 bg-blue-100 text-blue-700 text-xs font-bold px-1.5 py-0.5 rounded-full">{g.rates.length}</span>
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                    {!fetched && !loading && (
                      <div className="flex items-center justify-center h-full text-sm text-gray-400 p-6 text-center">
                        Configure your shipment and click &quot;Browse Rates&quot;
                      </div>
                    )}
                    {loading && (
                      <div className="flex items-center justify-center h-full text-sm text-gray-400 p-6 animate-pulse">
                        Fetching rates...
                      </div>
                    )}
                  </div>

                  {/* RIGHT: Rates list */}
                  <div className="flex-1 overflow-y-auto">
                    {fetched && (
                      <>
                        <div className="px-4 py-2 border-b bg-gray-100 flex items-center justify-between sticky top-0 z-10">
                          <h3 className="text-sm font-bold text-gray-800">{visibleCarrierName}</h3>
                          <span className="text-xs text-gray-500">Estimated Rates</span>
                        </div>
                        {visibleRates.length > 0 ? (
                          <div className="divide-y divide-gray-100">
                            {visibleRates.map(rate => (
                              <button
                                key={rate.rateId}
                                onClick={() => handleSelectRate(rate)}
                                className="w-full text-left px-4 py-3 hover:bg-green-50 transition-colors group"
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm font-semibold text-gray-900">{rate.serviceName}</span>
                                      {rate.attributes.includes('cheapest') && <span className="px-1.5 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded">CHEAPEST</span>}
                                      {rate.attributes.includes('fastest') && <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-bold rounded">FASTEST</span>}
                                    </div>
                                    <div className="text-xs text-gray-500 mt-0.5">
                                      Package
                                      {rate.deliveryDays && <span className="ml-2">Est. Delivery {rate.deliveryDays} Day{rate.deliveryDays !== 1 ? 's' : ''}</span>}
                                    </div>
                                  </div>
                                  <div className="text-right ml-4">
                                    <div className="text-base font-bold text-gray-900 group-hover:text-green-700">${rate.price.toFixed(2)}</div>
                                  </div>
                                </div>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="flex items-center justify-center h-40 text-sm text-gray-400">No rates available</div>
                        )}
                      </>
                    )}
                    {error && (
                      <div className="p-6">
                        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">{error}</div>
                      </div>
                    )}
                    {!fetched && !loading && !error && (
                      <div className="flex items-center justify-center h-full text-sm text-gray-400 p-6">
                        Rates will appear here
                      </div>
                    )}
                    {loading && (
                      <div className="flex items-center justify-center h-full">
                        <div className="text-sm text-gray-400 animate-pulse">Fetching rates from ShipEngine...</div>
                      </div>
                    )}
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
