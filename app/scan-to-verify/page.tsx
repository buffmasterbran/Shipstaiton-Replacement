'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { isShippingInsurance, getSizeFromSku, getColorFromSku } from '@/lib/order-utils'
import { formatWeight } from '@/lib/weight-utils'
import { useReferenceData, resolveBarcode, resolveWeight } from '@/lib/use-reference-data'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VerifyItem {
  sku: string
  barcode: string | null
  name: string
  color: string
  size: string
  quantity: number
  scanned: number
  weightLbs: number
}

type ScanStatus = 'idle' | 'success' | 'error'

interface OrderData {
  id: string
  orderNumber: string
  status: string
  rawPayload: any
  suggestedBox?: any
  preShoppedRate?: any
}

// ---------------------------------------------------------------------------
// Audio helpers
// ---------------------------------------------------------------------------

function playBeep(frequency: number, duration: number, type: OscillatorType = 'sine') {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.value = frequency
    gain.gain.value = 0.3
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
    osc.stop(ctx.currentTime + duration)
  } catch {
    // Silently fail
  }
}

function playSuccessSound() {
  playBeep(880, 0.1)
  setTimeout(() => playBeep(1320, 0.15), 100)
}

function playErrorSound() {
  playBeep(200, 0.3, 'sawtooth')
  setTimeout(() => playBeep(150, 0.3, 'sawtooth'), 150)
}

function playAllVerifiedSound() {
  playBeep(660, 0.12)
  setTimeout(() => playBeep(880, 0.12), 120)
  setTimeout(() => playBeep(1100, 0.2), 240)
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ScanToVerifyPage() {
  // Shared reference data — single API call, cached in memory
  const ref = useReferenceData()

  const [orderInput, setOrderInput] = useState('')
  const [order, setOrder] = useState<OrderData | null>(null)
  const [items, setItems] = useState<VerifyItem[]>([])
  const [loading, setLoading] = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [scanInput, setScanInput] = useState('')
  const [scanStatus, setScanStatus] = useState<ScanStatus>('idle')
  const [scanMessage, setScanMessage] = useState('')
  const [allVerified, setAllVerified] = useState(false)
  const [lastMatchedIndex, setLastMatchedIndex] = useState<number | null>(null)

  // Box/package state
  const [selectedBoxId, setSelectedBoxId] = useState<string>('')
  const [dimensions, setDimensions] = useState({ length: '', width: '', height: '' })
  const [weight, setWeight] = useState({ lb: '', oz: '' })
  const [productWeight, setProductWeight] = useState(0) // product-only weight in lbs (no box)

  // Ship From & Service state
  const [selectedLocationId, setSelectedLocationId] = useState<string>('')
  const [selectedService, setSelectedService] = useState<string>('')

  const orderInputRef = useRef<HTMLInputElement>(null)
  const scanInputRef = useRef<HTMLInputElement>(null)

  // Auto-select default location when reference data loads
  useEffect(() => {
    if (ref.defaultLocationId && !selectedLocationId) {
      setSelectedLocationId(ref.defaultLocationId)
    }
  }, [ref.defaultLocationId])

  // Update dimensions and weight when selected box changes
  useEffect(() => {
    if (selectedBoxId) {
      const box = ref.boxes.find(b => b.id === selectedBoxId)
      if (box) {
        setDimensions({
          length: String(box.lengthInches || ''),
          width: String(box.widthInches || ''),
          height: String(box.heightInches || ''),
        })
        // Recalculate weight: product weight + this box's weight
        const totalLbs = productWeight + (box.weightLbs || 0)
        const totalOz = totalLbs * 16
        const lb = Math.floor(totalOz / 16)
        const oz = Math.round((totalOz % 16) * 10) / 10
        setWeight({ lb: String(lb), oz: String(oz) })
      }
    }
  }, [selectedBoxId, ref.boxes, productWeight])

  // Focus management
  useEffect(() => { orderInputRef.current?.focus() }, [])
  useEffect(() => {
    if (order && !allVerified) setTimeout(() => scanInputRef.current?.focus(), 50)
  }, [order, allVerified])

  // Check all verified
  useEffect(() => {
    if (items.length > 0 && items.every(i => i.scanned >= i.quantity)) {
      setAllVerified(true)
      playAllVerifiedSound()
    }
  }, [items])

  // Clear highlight
  useEffect(() => {
    if (lastMatchedIndex !== null) {
      const timer = setTimeout(() => setLastMatchedIndex(null), 1500)
      return () => clearTimeout(timer)
    }
  }, [lastMatchedIndex])

  // Order lookup — single DB query, all resolution happens client-side using shared ref data
  const lookupOrder = useCallback(async (orderNumber: string) => {
    const trimmed = orderNumber.trim()
    if (!trimmed) return

    setLoading(true)
    setLookupError(null)
    setOrder(null)
    setItems([])
    setAllVerified(false)
    setScanStatus('idle')
    setScanMessage('')
    setLastMatchedIndex(null)
    setSelectedBoxId('')
    setDimensions({ length: '', width: '', height: '' })
    setWeight({ lb: '', oz: '' })
    setProductWeight(0)

    try {
      const res = await fetch(`/api/orders/lookup?orderNumber=${encodeURIComponent(trimmed)}`)
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Order not found')
      }

      const data = await res.json()
      const orderData = data.order as OrderData

      const payload = orderData.rawPayload
      const orderObj = Array.isArray(payload) ? payload[0] : payload
      const rawItems = orderObj?.items || []

      // All resolution happens client-side using cached reference data
      const verifyItems: VerifyItem[] = rawItems
        .filter((item: any) => !isShippingInsurance(item.sku || '', item.name || ''))
        .map((item: any) => ({
          sku: item.sku || 'UNKNOWN',
          barcode: resolveBarcode(item.sku || '', ref.skuBarcodeMap),
          name: item.name || 'Unnamed Item',
          color: getColorFromSku(item.sku || '', item.name, item.color),
          size: getSizeFromSku(item.sku || ''),
          quantity: item.quantity || 1,
          scanned: 0,
          weightLbs: resolveWeight(item.sku || '', ref.skuWeightMap, ref.skuPatterns),
        }))

      if (verifyItems.length === 0) throw new Error('Order has no scannable items')

      setOrder(orderData)
      setItems(verifyItems)

      // Calculate product-only weight from resolved items
      const prodWeight = verifyItems.reduce((sum, item) => sum + (item.weightLbs * item.quantity), 0)
      setProductWeight(prodWeight)

      // Set default box from order's suggested box
      if (orderData.suggestedBox?.boxId) {
        setSelectedBoxId(orderData.suggestedBox.boxId)
        // Dimensions and weight will auto-populate via useEffect
      } else {
        // No suggested box — just show product weight
        if (prodWeight > 0) {
          const totalOz = prodWeight * 16
          const lb = Math.floor(totalOz / 16)
          const oz = Math.round((totalOz % 16) * 10) / 10
          setWeight({ lb: String(lb), oz: String(oz) })
        }
      }
    } catch (err: any) {
      setLookupError(err.message || 'Failed to look up order')
      playErrorSound()
    } finally {
      setLoading(false)
    }
  }, [ref.skuBarcodeMap, ref.skuWeightMap, ref.skuPatterns])

  const handleOrderSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    lookupOrder(orderInput)
  }

  // Matching
  const findItemMatch = (scannedValue: string) => {
    const upper = scannedValue.toUpperCase()
    const skuIndex = items.findIndex(i => i.sku.toUpperCase() === upper && i.scanned < i.quantity)
    if (skuIndex >= 0) return { index: skuIndex }
    const barcodeIndex = items.findIndex(i => i.barcode && i.barcode === scannedValue && i.scanned < i.quantity)
    if (barcodeIndex >= 0) return { index: barcodeIndex }
    return null
  }

  const isAlreadyFullyScanned = (scannedValue: string): VerifyItem | null => {
    const upper = scannedValue.toUpperCase()
    return items.find(i => i.sku.toUpperCase() === upper && i.scanned >= i.quantity)
      || items.find(i => i.barcode && i.barcode === scannedValue && i.scanned >= i.quantity)
      || null
  }

  // Scan handler
  const handleScanSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const scannedValue = scanInput.trim()
    setScanInput('')
    if (!scannedValue) return

    const match = findItemMatch(scannedValue)

    if (match) {
      const updated = [...items]
      const item = updated[match.index]
      updated[match.index] = { ...item, scanned: item.scanned + 1 }
      setItems(updated)
      setLastMatchedIndex(match.index)
      const remaining = item.quantity - item.scanned - 1
      setScanMessage(remaining === 0 ? `${item.sku} fully verified!` : `${item.sku} scanned (${remaining} remaining)`)
      setScanStatus('success')
      playSuccessSound()
    } else {
      const alreadyDone = isAlreadyFullyScanned(scannedValue)
      if (alreadyDone) {
        setScanMessage(`ERROR: ${alreadyDone.sku} already fully verified! Expected ${alreadyDone.quantity}, already scanned ${alreadyDone.scanned}.`)
      } else {
        setScanMessage(`ERROR: "${scannedValue}" is not in this order!`)
      }
      setScanStatus('error')
      playErrorSound()
    }

    setTimeout(() => scanInputRef.current?.focus(), 10)
  }

  // Reset
  const handleReset = () => {
    setOrder(null)
    setItems([])
    setOrderInput('')
    setLookupError(null)
    setScanStatus('idle')
    setScanMessage('')
    setAllVerified(false)
    setLastMatchedIndex(null)
    setTimeout(() => orderInputRef.current?.focus(), 50)
  }

  // Computed
  const totalRequired = items.reduce((sum, i) => sum + i.quantity, 0)
  const totalScanned = items.reduce((sum, i) => sum + i.scanned, 0)
  const progressPercent = totalRequired > 0 ? Math.round((totalScanned / totalRequired) * 100) : 0

  const shipTo = order ? (() => {
    const payload = order.rawPayload
    const o = Array.isArray(payload) ? payload[0] : payload
    return o?.shipTo || null
  })() : null

  // =====================================================================
  // RENDER — full-screen takeover (no header, fills viewport)
  // =====================================================================
  return (
    <div className="flex flex-col h-screen bg-gray-100">
      {/* ── Top toolbar ── */}
      <div className="flex-shrink-0 bg-white border-b shadow-sm">
        <div className="flex items-center gap-4 px-4 py-2">
          {/* Order input — always visible */}
          <form onSubmit={order ? handleScanSubmit : handleOrderSubmit} className="flex items-center gap-2 flex-1">
            {!order ? (
              <>
                <input
                  ref={orderInputRef}
                  type="text"
                  value={orderInput}
                  onChange={e => setOrderInput(e.target.value)}
                  placeholder="Scan packing slip or type order number..."
                  className="flex-1 max-w-lg px-4 py-2.5 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono"
                  autoFocus
                  disabled={loading}
                />
                <button
                  type="submit"
                  disabled={loading || !orderInput.trim()}
                  className="px-5 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold transition-colors"
                >
                  {loading ? 'Finding...' : 'Find Shipment'}
                </button>
              </>
            ) : (
              <>
                <input
                  ref={scanInputRef}
                  type="text"
                  value={scanInput}
                  onChange={e => setScanInput(e.target.value)}
                  placeholder="Scan item barcode or type SKU..."
                  className="flex-1 max-w-lg px-4 py-2.5 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono"
                  autoComplete="off"
                />
              </>
            )}
          </form>

          {/* Right side info */}
          {order && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500 font-medium">
                Order <span className="font-mono font-bold text-gray-900">#{order.orderNumber}</span>
              </span>
              <button
                onClick={handleReset}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 text-gray-600 transition-colors"
              >
                New Order
              </button>
            </div>
          )}

          {lookupError && (
            <span className="text-red-600 text-sm font-medium">{lookupError}</span>
          )}
        </div>

        {/* Scan feedback bar — sits right below toolbar when active */}
        {order && scanStatus !== 'idle' && (
          <div className={`px-4 py-2 text-sm font-medium flex items-center gap-2 ${
            scanStatus === 'success'
              ? 'bg-green-50 text-green-800 border-t border-green-200'
              : 'bg-red-50 text-red-800 border-t border-red-200'
          }`}>
            {scanStatus === 'success' ? (
              <svg className="w-4 h-4 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-red-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            )}
            {scanMessage}
          </div>
        )}

        {/* Progress bar — thin strip below toolbar */}
        {order && !allVerified && (
          <div className="w-full bg-gray-200 h-1.5">
            <div
              className="h-1.5 bg-blue-500 transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}
        {order && allVerified && (
          <div className="w-full bg-green-500 h-1.5" />
        )}
      </div>

      {/* ── Main content area ── */}
      <div className="flex-1 overflow-auto">
        {/* IDLE STATE — no order loaded */}
        {!order && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <h1 className="text-4xl font-light text-gray-700 mb-3">Scan a packing slip.</h1>
              <p className="text-xl text-gray-400">You can also type in an order number.</p>
            </div>
          </div>
        )}

        {/* ORDER LOADED — two-column layout like ShipStation */}
        {order && (
          <div className="flex h-full">
            {/* LEFT COLUMN — Item verification */}
            <div className="flex-1 flex flex-col border-r border-gray-200">
              {/* All verified banner */}
              {allVerified && (
                <div className="bg-green-500 text-white px-6 py-3 flex items-center gap-3 flex-shrink-0">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <span className="font-bold">All Items Verified!</span>
                    <span className="text-green-100 text-sm ml-2">Ready to print label.</span>
                  </div>
                </div>
              )}

              {/* Items list */}
              <div className="flex-1 overflow-auto bg-white">
                <table className="min-w-full">
                  <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Item
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Verify
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Order Qty
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Scanned
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {items.map((item, idx) => {
                      const isFullyScanned = item.scanned >= item.quantity
                      const isPartial = item.scanned > 0 && item.scanned < item.quantity
                      const isJustMatched = lastMatchedIndex === idx

                      return (
                        <tr
                          key={`${item.sku}-${idx}`}
                          className={`transition-all duration-300 ${
                            isJustMatched
                              ? 'bg-green-100 ring-2 ring-inset ring-green-400'
                              : isFullyScanned
                              ? 'bg-green-50'
                              : isPartial
                              ? 'bg-yellow-50'
                              : ''
                          }`}
                        >
                          {/* Item info */}
                          <td className="px-4 py-3">
                            <div className="flex items-start gap-3">
                              <div className="w-10 h-10 bg-gray-200 rounded flex items-center justify-center flex-shrink-0">
                                <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                                </svg>
                              </div>
                              <div>
                                <div className="font-medium text-gray-900">{item.name}</div>
                                <div className="text-sm text-gray-500">
                                  <span className="font-mono">SKU:</span> {item.sku}
                                </div>
                                {item.barcode && (
                                  <div className="text-sm text-gray-500">
                                    <span className="font-mono">UPC:</span> {item.barcode}
                                  </div>
                                )}
                                <div className="text-sm text-gray-400">
                                  {item.weightLbs > 0 ? formatWeight(item.weightLbs) : 'No weight'}
                                  {item.quantity > 1 && item.weightLbs > 0 && (
                                    <span className="ml-1">({formatWeight(item.weightLbs * item.quantity)} total)</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Verify button */}
                          <td className="px-4 py-3 text-center">
                            {isFullyScanned ? (
                              <span className="text-green-600 font-medium">✓ Verified</span>
                            ) : (
                              <button
                                onClick={() => {
                                  // Manual verify - simulate a scan
                                  const updated = [...items]
                                  updated[idx] = { ...item, scanned: item.scanned + 1 }
                                  setItems(updated)
                                  setLastMatchedIndex(idx)
                                  playSuccessSound()
                                }}
                                className="text-blue-600 hover:text-blue-800 font-medium hover:underline"
                              >
                                Verify
                              </button>
                            )}
                            {!isFullyScanned && item.scanned > 0 && (
                              <span className="text-gray-400 mx-2">|</span>
                            )}
                            {item.scanned > 0 && (
                              <button
                                onClick={() => {
                                  const updated = [...items]
                                  updated[idx] = { ...item, scanned: Math.max(0, item.scanned - 1) }
                                  setItems(updated)
                                }}
                                className="text-gray-400 hover:text-gray-600 text-sm"
                              >
                                Clear
                              </button>
                            )}
                          </td>

                          {/* Order Qty */}
                          <td className="px-4 py-3 text-center">
                            <span className="text-2xl font-bold text-gray-900">{item.quantity}</span>
                          </td>

                          {/* Scanned */}
                          <td className="px-4 py-3 text-center">
                            <span className={`text-2xl font-bold ${
                              isFullyScanned
                                ? 'text-green-600'
                                : isPartial
                                ? 'text-yellow-600'
                                : 'text-gray-300'
                            }`}>
                              {item.scanned}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Bottom status bar */}
              <div className="bg-gray-50 border-t px-6 py-3 flex items-center justify-between flex-shrink-0">
                <div className="text-sm text-gray-500">
                  {totalRequired - totalScanned} Remaining
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN — Create Label panel */}
            <div className="w-72 flex flex-col bg-gray-50 flex-shrink-0">
              <div className="px-3 py-2 border-b bg-white">
                <h3 className="text-base font-semibold text-gray-900">Create Label</h3>
              </div>

              <div className="flex-1 overflow-auto px-3 py-2 space-y-2">
                {/* Weight */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-0.5">Weight</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      placeholder="0"
                      className="w-14 px-2 py-1 text-sm border border-gray-300 rounded text-right"
                      step="1"
                      value={weight.lb}
                      onChange={(e) => setWeight(w => ({ ...w, lb: e.target.value }))}
                    />
                    <span className="text-xs text-gray-500">lb</span>
                    <input
                      type="number"
                      placeholder="0"
                      className="w-14 px-2 py-1 text-sm border border-gray-300 rounded text-right"
                      step="0.1"
                      value={weight.oz}
                      onChange={(e) => setWeight(w => ({ ...w, oz: e.target.value }))}
                    />
                    <span className="text-xs text-gray-500">oz</span>
                  </div>
                </div>

                {/* Package/Box */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-0.5">Package</label>
                  <select 
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                    value={selectedBoxId}
                    onChange={(e) => setSelectedBoxId(e.target.value)}
                  >
                    <option value="">Select a box...</option>
                    {ref.boxes.map((box) => (
                      <option key={box.id} value={box.id}>
                        {box.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Dimensions */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-0.5">Size</label>
                  <div className="flex items-center gap-1">
                    <input 
                      type="number" 
                      placeholder="L" 
                      className="w-12 px-1 py-1 border border-gray-300 rounded text-center text-xs"
                      value={dimensions.length}
                      onChange={(e) => setDimensions(d => ({ ...d, length: e.target.value }))}
                    />
                    <span className="text-gray-400 text-xs">×</span>
                    <input 
                      type="number" 
                      placeholder="W" 
                      className="w-12 px-1 py-1 border border-gray-300 rounded text-center text-xs"
                      value={dimensions.width}
                      onChange={(e) => setDimensions(d => ({ ...d, width: e.target.value }))}
                    />
                    <span className="text-gray-400 text-xs">×</span>
                    <input 
                      type="number" 
                      placeholder="H" 
                      className="w-12 px-1 py-1 border border-gray-300 rounded text-center text-xs"
                      value={dimensions.height}
                      onChange={(e) => setDimensions(d => ({ ...d, height: e.target.value }))}
                    />
                    <span className="text-xs text-gray-500">in</span>
                  </div>
                </div>

                <hr className="border-gray-200 my-1" />

                {/* Ship From */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-0.5">Ship From</label>
                  <select
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                    value={selectedLocationId}
                    onChange={(e) => setSelectedLocationId(e.target.value)}
                  >
                    {ref.locations.length === 0 && <option value="">Loading...</option>}
                    {ref.locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Service */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-0.5">Service</label>
                  <select
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                    value={selectedService}
                    onChange={(e) => setSelectedService(e.target.value)}
                  >
                    <option value="">Select service...</option>
                    {ref.carrierServices.map((svc) => (
                      <option key={`${svc.carrierCode}:${svc.serviceCode}`} value={`${svc.carrierCode}:${svc.serviceCode}`}>
                        {svc.carrierName} - {svc.serviceName}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Confirmation */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-0.5">Confirmation</label>
                  <select className="w-full px-2 py-1 text-sm border border-gray-300 rounded">
                    <option>Online</option>
                    <option>Delivery Confirmation</option>
                    <option>Signature Required</option>
                    <option>Adult Signature</option>
                  </select>
                </div>

                {/* Insurance */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-0.5">Insurance</label>
                  <select className="w-full px-2 py-1 text-sm border border-gray-300 rounded">
                    <option>None</option>
                    <option>Carrier Insurance</option>
                    <option>Shipsurance</option>
                  </select>
                </div>

                <hr className="border-gray-200 my-1" />

                {/* Rate */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-700">Rate</span>
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-semibold text-gray-900">$0.00</span>
                    <button className="text-blue-600 text-xs hover:underline">Cost Review</button>
                  </div>
                </div>

                {/* Ship Date */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-700">Ship Date</span>
                  <span className="text-blue-600 text-sm font-medium">Today</span>
                </div>

                {/* Suggested box info */}
                {order.suggestedBox?.boxName && (
                  <div className="bg-green-50 border border-green-200 rounded p-2">
                    <div className="text-xs text-green-800">
                      <span className="font-medium">Box:</span> {order.suggestedBox.boxName}
                    </div>
                    {order.suggestedBox.lengthInches && (
                      <div className="text-xs text-green-600">
                        {order.suggestedBox.lengthInches}" × {order.suggestedBox.widthInches}" × {order.suggestedBox.heightInches}"
                      </div>
                    )}
                  </div>
                )}

                {/* Ship To info */}
                {shipTo && (
                  <div className="bg-gray-100 rounded p-2">
                    <div className="text-xs font-medium text-gray-900">{shipTo.name}</div>
                    <div className="text-xs text-gray-600">
                      {shipTo.street1}
                      {shipTo.street2 && <>, {shipTo.street2}</>}
                    </div>
                    <div className="text-xs text-gray-600">
                      {shipTo.city}, {shipTo.state} {shipTo.postalCode}
                    </div>
                  </div>
                )}
              </div>

              {/* Print Label button */}
              <div className="px-3 py-2 border-t bg-white">
                <button
                  disabled={!allVerified}
                  className={`w-full py-2 rounded-lg font-semibold text-sm transition-colors ${
                    allVerified
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
                  onClick={() => {
                    alert('Print Label - integration coming soon')
                  }}
                >
                  Print Label (p)
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
