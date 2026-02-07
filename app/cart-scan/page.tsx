'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'

// ============================================================================
// Types
// ============================================================================

interface PickCart {
  id: string
  name: string
  color: string | null
  status: string
}

interface ChunkOrder {
  id: string
  orderNumber: string
  binNumber: number | null
  rawPayload: any
  status: string
}

interface BulkSkuLayoutEntry {
  sku: string
  binQty: number
  masterUnitIndex: number
}

interface PickChunk {
  id: string
  batchId: string
  chunkNumber: number
  status: string
  pickingMode?: string
  isPersonalized?: boolean
  cartId: string
  batch: {
    id: string
    name: string
    type?: string
    isPersonalized?: boolean
  }
  orders: ChunkOrder[]
  bulkBatchAssignments?: Array<{
    shelfNumber: number
    bulkBatch: {
      id: string
      skuLayout: BulkSkuLayoutEntry[]
      orderCount: number
    }
  }>
}

interface CartWithChunks extends PickCart {
  chunks: PickChunk[]
}

interface OrderItem {
  sku: string
  name: string
  quantity: number
}

type ShipStep = 'cart-select' | 'shipping' | 'complete'
type PickingMode = 'SINGLES' | 'BULK' | 'ORDER_BY_SIZE' | 'UNKNOWN'

// ============================================================================
// Helpers
// ============================================================================

function getOrderItems(rawPayload: any): OrderItem[] {
  const order = Array.isArray(rawPayload) ? rawPayload[0] : rawPayload
  const items = order?.items || []
  return items
    .filter((item: any) => {
      const sku = (item.sku || '').toUpperCase()
      const name = (item.name || '').toUpperCase()
      return !sku.includes('INSURANCE') && !sku.includes('SHIPPING') && !name.includes('INSURANCE')
    })
    .map((item: any) => ({
      sku: item.sku || 'N/A',
      name: item.name || 'Unknown',
      quantity: item.quantity || 1,
    }))
}

function getModeBadge(mode: PickingMode, isPersonalized?: boolean) {
  if (isPersonalized) return { label: 'PERSONALIZED', bg: 'bg-purple-600 text-white' }
  switch (mode) {
    case 'SINGLES': return { label: 'SINGLES', bg: 'bg-blue-600 text-white' }
    case 'BULK': return { label: 'BULK', bg: 'bg-orange-600 text-white' }
    case 'ORDER_BY_SIZE': return { label: 'ORDER BY SIZE', bg: 'bg-teal-600 text-white' }
    default: return { label: 'STANDARD', bg: 'bg-gray-600 text-white' }
  }
}

// ============================================================================
// Order Verification (Standard: full scan per order)
// ============================================================================

function StandardVerification({
  order,
  binNumber,
  isEmpty,
  onComplete,
  onNext,
}: {
  order: ChunkOrder | null
  binNumber: number
  isEmpty: boolean
  onComplete: () => void
  onNext: () => void
}) {
  const [items, setItems] = useState<OrderItem[]>([])
  const [scannedCounts, setScannedCounts] = useState<Map<string, number>>(new Map())
  const [scanInput, setScanInput] = useState('')
  const [scanError, setScanError] = useState<string | null>(null)
  const [allVerified, setAllVerified] = useState(false)
  const [labelPrinted, setLabelPrinted] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (order) {
      setItems(getOrderItems(order.rawPayload))
      setScannedCounts(new Map())
      setScanError(null)
      setAllVerified(false)
      setLabelPrinted(false)
    }
  }, [order])

  useEffect(() => {
    if (inputRef.current && !isEmpty) inputRef.current.focus()
  }, [order, isEmpty])

  useEffect(() => {
    if (items.length === 0) return
    const allDone = items.every(item => (scannedCounts.get(item.sku.toUpperCase()) || 0) >= item.quantity)
    setAllVerified(allDone)
  }, [items, scannedCounts])

  const handleScan = useCallback((value: string) => {
    if (!value.trim()) return
    const scannedValue = value.trim().toUpperCase()
    setScanInput('')
    setScanError(null)

    const matched = items.find(i => i.sku.toUpperCase() === scannedValue)
    if (!matched) { setScanError('Not in this order'); return }

    const current = scannedCounts.get(scannedValue) || 0
    if (current >= matched.quantity) setScanError(`Already scanned ${current}/${matched.quantity}`)

    setScannedCounts(prev => {
      const m = new Map(prev)
      m.set(scannedValue, (prev.get(scannedValue) || 0) + 1)
      return m
    })
  }, [items, scannedCounts])

  const handlePrintLabel = async () => {
    setLabelPrinted(true)
    onComplete()
    // TODO: Call ShipEngine to generate actual label
  }

  if (isEmpty) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <h2 className="text-2xl font-bold text-gray-500 mb-2">Bin {binNumber} is Empty</h2>
        <button onClick={onNext} className="px-8 py-4 bg-blue-600 text-white text-xl font-bold rounded-xl hover:bg-blue-700">
          Continue →
        </button>
      </div>
    )
  }
  if (!order) return null

  return (
    <div className="flex-1 flex flex-col">
      <div className="bg-white shadow p-4 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-500">Order</div>
            <div className="text-2xl font-bold">#{order.orderNumber}</div>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-500">Bin</div>
            <div className="text-4xl font-bold text-blue-600">{binNumber}</div>
          </div>
        </div>
      </div>

      <div className="px-4 mb-4">
        <input
          ref={inputRef}
          type="text"
          value={scanInput}
          onChange={(e) => setScanInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleScan(scanInput)}
          placeholder="Scan item barcode..."
          className="w-full px-4 py-3 text-lg border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none"
          disabled={allVerified}
        />
        {scanError && (
          <div className="mt-2 p-2 rounded-lg text-center font-medium bg-red-100 text-red-700">{scanError}</div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
        {items.map((item, idx) => {
          const scanned = scannedCounts.get(item.sku.toUpperCase()) || 0
          const isComplete = scanned >= item.quantity
          return (
            <div key={idx} className={`p-4 rounded-xl border-2 ${isComplete ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-white'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-mono text-lg font-bold text-gray-900">{item.sku}</div>
                  <div className="text-sm text-gray-600">{item.name}</div>
                </div>
                <div className={`text-3xl font-bold ${isComplete ? 'text-green-600' : 'text-gray-400'}`}>
                  {scanned}/{item.quantity}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="p-4 bg-white shadow-lg space-y-3">
        {allVerified && !labelPrinted && (
          <button onClick={handlePrintLabel} className="w-full py-4 bg-green-600 text-white text-xl font-bold rounded-xl hover:bg-green-700">
            Print Label
          </button>
        )}
        {labelPrinted && <div className="text-center text-green-600 font-medium">Label printed</div>}
        <button
          onClick={onNext}
          disabled={!allVerified}
          className={`w-full py-4 text-xl font-bold rounded-xl ${allVerified ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
        >
          {labelPrinted ? 'Next Order →' : 'Verify Items First'}
        </button>
      </div>
    </div>
  )
}

// ============================================================================
// Singles Verification: scan 1 item + 20% spot check, print all labels at once
// ============================================================================

function SinglesVerification({
  binOrders,
  binNumber,
  onComplete,
  onNext,
}: {
  binOrders: ChunkOrder[]
  binNumber: number
  onComplete: () => void
  onNext: () => void
}) {
  const [scanInput, setScanInput] = useState('')
  const [scanError, setScanError] = useState<string | null>(null)
  const [primaryScanned, setPrimaryScanned] = useState(false)
  const [spotCheckRequired, setSpotCheckRequired] = useState(false)
  const [spotCheckDone, setSpotCheckDone] = useState(false)
  const [labelsPrinted, setLabelsPrinted] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Expected SKU from first order
  const expectedSku = useMemo(() => {
    if (binOrders.length === 0) return ''
    const items = getOrderItems(binOrders[0].rawPayload)
    return items[0]?.sku?.toUpperCase() || ''
  }, [binOrders])

  // Determine if spot check needed (20% chance)
  useEffect(() => {
    setPrimaryScanned(false)
    setSpotCheckRequired(Math.random() < 0.2) // 20% of the time
    setSpotCheckDone(false)
    setLabelsPrinted(false)
    setScanError(null)
    setScanInput('')
    if (inputRef.current) inputRef.current.focus()
  }, [binNumber])

  const handleScan = useCallback((value: string) => {
    if (!value.trim()) return
    const scanned = value.trim().toUpperCase()
    setScanInput('')
    setScanError(null)

    if (scanned === expectedSku) {
      if (!primaryScanned) {
        setPrimaryScanned(true)
        if (!spotCheckRequired) {
          // No spot check needed, ready to print
        }
      } else if (spotCheckRequired && !spotCheckDone) {
        setSpotCheckDone(true)
      }
    } else {
      setScanError(`Expected ${expectedSku}, got ${scanned}. WRONG ITEM!`)
    }
  }, [expectedSku, primaryScanned, spotCheckRequired, spotCheckDone])

  const verified = primaryScanned && (!spotCheckRequired || spotCheckDone)

  const handlePrintLabels = async () => {
    setLabelsPrinted(true)
    onComplete()
    // TODO: Call ShipEngine to print ALL labels for this bin at once
  }

  if (binOrders.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <h2 className="text-2xl font-bold text-gray-500 mb-2">Bin {binNumber} is Empty</h2>
        <button onClick={onNext} className="px-8 py-4 bg-blue-600 text-white text-xl font-bold rounded-xl hover:bg-blue-700">
          Continue →
        </button>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col">
      <div className="bg-white shadow p-4 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-500">Bin {binNumber} &mdash; Singles</div>
            <div className="text-2xl font-bold">{binOrders.length} orders</div>
            <div className="text-sm text-gray-500 font-mono">{expectedSku}</div>
          </div>
          <div className="text-right">
            <div className={`text-lg font-bold ${verified ? 'text-green-600' : 'text-amber-600'}`}>
              {verified ? 'Verified' : primaryScanned ? 'Spot check...' : 'Scan 1 item'}
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 mb-4">
        <input
          ref={inputRef}
          type="text"
          value={scanInput}
          onChange={(e) => setScanInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleScan(scanInput)}
          placeholder={!primaryScanned ? 'Scan 1 item to verify...' : 'Spot check: scan another item...'}
          className="w-full px-4 py-3 text-lg border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none"
          disabled={verified}
        />
        {scanError && (
          <div className="mt-2 p-2 rounded-lg text-center font-medium bg-red-100 text-red-700">{scanError}</div>
        )}
      </div>

      <div className="flex-1 px-4 flex flex-col items-center justify-center">
        {primaryScanned && spotCheckRequired && !spotCheckDone && (
          <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-6 text-center mb-4">
            <div className="text-2xl font-bold text-amber-700 mb-2">Spot Check Required</div>
            <div className="text-lg text-amber-600">
              Scan a random item from this bin to verify correctness
            </div>
          </div>
        )}
        {verified && !labelsPrinted && (
          <div className="text-center">
            <div className="text-6xl text-green-500 mb-4">&#10003;</div>
            <div className="text-xl text-green-700 font-medium mb-6">
              Bin verified! Ready to print {binOrders.length} labels.
            </div>
          </div>
        )}
        {labelsPrinted && (
          <div className="text-center">
            <div className="text-xl text-green-700 font-medium">
              {binOrders.length} labels printed. Apply labels and move on.
            </div>
          </div>
        )}
      </div>

      <div className="p-4 bg-white shadow-lg space-y-3">
        {verified && !labelsPrinted && (
          <button onClick={handlePrintLabels} className="w-full py-4 bg-green-600 text-white text-xl font-bold rounded-xl hover:bg-green-700">
            Print {binOrders.length} Labels
          </button>
        )}
        {labelsPrinted && (
          <button onClick={onNext} className="w-full py-4 bg-blue-600 text-white text-xl font-bold rounded-xl hover:bg-blue-700">
            Next Bin →
          </button>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// Bulk Verification: per-order scan with shelf layout reference
// ============================================================================

function BulkVerification({
  orders,
  skuLayout,
  currentOrderIndex,
  onComplete,
  onNext,
}: {
  orders: ChunkOrder[]
  skuLayout: BulkSkuLayoutEntry[]
  currentOrderIndex: number
  onComplete: () => void
  onNext: () => void
}) {
  const [items, setItems] = useState<OrderItem[]>([])
  const [scannedCounts, setScannedCounts] = useState<Map<string, number>>(new Map())
  const [scanInput, setScanInput] = useState('')
  const [scanError, setScanError] = useState<string | null>(null)
  const [allVerified, setAllVerified] = useState(false)
  const [labelPrinted, setLabelPrinted] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const order = orders[currentOrderIndex] || null

  // Build a lookup: which physical bin has which SKU
  const binLayoutMap = useMemo(() => {
    const map = new Map<string, number[]>() // SKU -> bin numbers
    for (const entry of skuLayout) {
      const key = entry.sku.toUpperCase()
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(entry.masterUnitIndex + 1)
    }
    return map
  }, [skuLayout])

  useEffect(() => {
    if (order) {
      setItems(getOrderItems(order.rawPayload))
      setScannedCounts(new Map())
      setScanError(null)
      setAllVerified(false)
      setLabelPrinted(false)
    }
  }, [order])

  useEffect(() => {
    if (inputRef.current) inputRef.current.focus()
  }, [order])

  useEffect(() => {
    if (items.length === 0) return
    const allDone = items.every(item => (scannedCounts.get(item.sku.toUpperCase()) || 0) >= item.quantity)
    setAllVerified(allDone)
  }, [items, scannedCounts])

  const handleScan = useCallback((value: string) => {
    if (!value.trim()) return
    const scannedValue = value.trim().toUpperCase()
    setScanInput('')
    setScanError(null)

    const matched = items.find(i => i.sku.toUpperCase() === scannedValue)
    if (!matched) { setScanError('Not in this order'); return }

    const current = scannedCounts.get(scannedValue) || 0
    if (current >= matched.quantity) setScanError(`Already scanned ${current}/${matched.quantity}`)

    setScannedCounts(prev => {
      const m = new Map(prev)
      m.set(scannedValue, (prev.get(scannedValue) || 0) + 1)
      return m
    })
  }, [items, scannedCounts])

  const handlePrintLabel = async () => {
    setLabelPrinted(true)
    onComplete()
    // TODO: Call ShipEngine to generate actual label
  }

  if (!order) return null

  return (
    <div className="flex-1 flex flex-col">
      {/* Shelf layout reference */}
      <div className="bg-orange-50 border-b border-orange-200 px-4 py-3">
        <div className="text-sm font-bold text-orange-700 mb-2">SHELF LAYOUT</div>
        <div className="flex gap-2">
          {skuLayout.map((entry, idx) => (
            <div key={idx} className="flex-1 bg-white rounded-lg border border-orange-300 p-2 text-center">
              <div className="text-xs text-gray-500">Bin {entry.masterUnitIndex + 1}</div>
              <div className="text-sm font-mono font-bold text-gray-800 truncate">{entry.sku}</div>
              <div className="text-xs text-orange-600">{entry.binQty} units</div>
            </div>
          ))}
          {/* Show empty bins up to 4 */}
          {Array.from({ length: Math.max(0, 4 - skuLayout.length) }).map((_, idx) => (
            <div key={`empty-${idx}`} className="flex-1 bg-gray-100 rounded-lg border border-gray-300 p-2 text-center">
              <div className="text-xs text-gray-400">Bin {skuLayout.length + idx + 1}</div>
              <div className="text-lg text-gray-300">&mdash;</div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white shadow p-4 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-500">Order {currentOrderIndex + 1} of {orders.length}</div>
            <div className="text-2xl font-bold">#{order.orderNumber}</div>
          </div>
          <div className="text-right">
            <div className={`text-lg font-bold ${allVerified ? 'text-green-600' : 'text-amber-600'}`}>
              {allVerified ? 'Verified' : 'Scan items'}
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 mb-4">
        <input
          ref={inputRef}
          type="text"
          value={scanInput}
          onChange={(e) => setScanInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleScan(scanInput)}
          placeholder="Scan item barcode..."
          className="w-full px-4 py-3 text-lg border-2 border-gray-300 rounded-xl focus:border-orange-500 focus:outline-none"
          disabled={allVerified}
        />
        {scanError && (
          <div className="mt-2 p-2 rounded-lg text-center font-medium bg-red-100 text-red-700">{scanError}</div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
        {items.map((item, idx) => {
          const scanned = scannedCounts.get(item.sku.toUpperCase()) || 0
          const isComplete = scanned >= item.quantity
          const bins = binLayoutMap.get(item.sku.toUpperCase()) || []
          return (
            <div key={idx} className={`p-4 rounded-xl border-2 ${isComplete ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-white'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-mono text-lg font-bold text-gray-900">{item.sku}</div>
                  <div className="text-sm text-gray-600">{item.name}</div>
                  {bins.length > 0 && (
                    <div className="text-xs text-orange-600 mt-1">
                      Grab from Bin{bins.length > 1 ? 's' : ''} {bins.join(', ')}
                    </div>
                  )}
                </div>
                <div className={`text-3xl font-bold ${isComplete ? 'text-green-600' : 'text-gray-400'}`}>
                  {scanned}/{item.quantity}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="p-4 bg-white shadow-lg space-y-3">
        {allVerified && !labelPrinted && (
          <button onClick={handlePrintLabel} className="w-full py-4 bg-green-600 text-white text-xl font-bold rounded-xl hover:bg-green-700">
            Print Label
          </button>
        )}
        {labelPrinted && <div className="text-center text-green-600 font-medium">Label printed</div>}
        <button
          onClick={onNext}
          disabled={!allVerified}
          className={`w-full py-4 text-xl font-bold rounded-xl ${allVerified ? 'bg-orange-600 text-white hover:bg-orange-700' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
        >
          {labelPrinted ? (currentOrderIndex >= orders.length - 1 ? 'Complete Cart' : 'Next Order →') : 'Verify Items First'}
        </button>
      </div>
    </div>
  )
}

// ============================================================================
// Main Page
// ============================================================================

export default function CartScanPage() {
  const [step, setStep] = useState<ShipStep>('cart-select')
  const [readyCarts, setReadyCarts] = useState<any[]>([])
  const [cart, setCart] = useState<CartWithChunks | null>(null)
  const [shipperName, setShipperName] = useState('')
  const [cartInput, setCartInput] = useState('')
  const [currentBinIndex, setCurrentBinIndex] = useState(0)
  const [shippedOrders, setShippedOrders] = useState<Set<string>>(new Set())
  const [emptyBins, setEmptyBins] = useState<Set<number>>(new Set())
  const [currentBulkOrderIndex, setCurrentBulkOrderIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load saved name
  useEffect(() => {
    const saved = localStorage.getItem('shipper-name')
    if (saved) setShipperName(saved)
  }, [])

  // Fetch ready carts
  useEffect(() => {
    if (step === 'cart-select') {
      fetch('/api/ship?action=ready-carts')
        .then(res => res.json())
        .then(data => setReadyCarts(data.carts || []))
        .catch(() => {})
    }
  }, [step])

  // Determine cart's picking mode
  const pickingMode: PickingMode = useMemo(() => {
    if (!cart) return 'UNKNOWN'
    const chunk = cart.chunks[0]
    if (!chunk) return 'UNKNOWN'
    const type = chunk.batch?.type || chunk.pickingMode
    if (type === 'SINGLES') return 'SINGLES'
    if (type === 'BULK') return 'BULK'
    if (type === 'ORDER_BY_SIZE') return 'ORDER_BY_SIZE'
    return 'UNKNOWN'
  }, [cart])

  const isPersonalized = cart?.chunks[0]?.batch?.isPersonalized || cart?.chunks[0]?.isPersonalized || false

  // For Bulk: extract the shelf layout from the chunk's bulkBatchAssignments
  const bulkSkuLayout = useMemo<BulkSkuLayoutEntry[]>(() => {
    if (!cart || pickingMode !== 'BULK') return []
    const chunk = cart.chunks[0]
    if (!chunk?.bulkBatchAssignments?.length) return []
    return (chunk.bulkBatchAssignments[0].bulkBatch.skuLayout || []) as BulkSkuLayoutEntry[]
  }, [cart, pickingMode])

  // Get all orders sorted by bin
  const allOrders = useMemo(() => {
    return cart?.chunks.flatMap(chunk =>
      chunk.orders.filter(o => o.status === 'AWAITING_SHIPMENT')
    ).sort((a, b) => (a.binNumber || 0) - (b.binNumber || 0)) || []
  }, [cart])

  // For singles: group orders by bin
  const ordersByBin = useMemo(() => {
    const map = new Map<number, ChunkOrder[]>()
    allOrders.forEach(o => {
      const bin = o.binNumber || 0
      if (!map.has(bin)) map.set(bin, [])
      map.get(bin)!.push(o)
    })
    return map
  }, [allOrders])

  // Bin numbers in order
  const binNumbers = useMemo(() => {
    return Array.from(ordersByBin.keys()).sort((a, b) => a - b)
  }, [ordersByBin])

  const currentBin = binNumbers[currentBinIndex] || 0
  const currentChunk = cart?.chunks[0]

  const handleSelectCart = async (cartId?: string) => {
    if (!shipperName.trim()) { setError('Please enter your name'); return }
    const searchId = cartId || cartInput.trim()
    if (!searchId) { setError('Please enter or select a cart'); return }

    localStorage.setItem('shipper-name', shipperName.trim())
    setLoading(true)
    setError(null)

    try {
      const cartRes = await fetch(`/api/ship?cartId=${searchId}`)
      if (!cartRes.ok) throw new Error((await cartRes.json()).error || 'Cart not found')
      const cartData = await cartRes.json()

      await fetch('/api/ship', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start-shipping', cartId: cartData.cart.id, shipperName: shipperName.trim() }),
      })

      setCart(cartData.cart)
      setCurrentBinIndex(0)
      setCurrentBulkOrderIndex(0)
      setShippedOrders(new Set())

      // Identify empty bins (Bulk uses 4 bins per shelf, others use 12)
      const cartChunk = cartData.cart.chunks[0]
      const cartType = cartChunk?.batch?.type || cartChunk?.pickingMode
      const totalBinCount = cartType === 'BULK' ? 4 : 12
      const usedBins = new Set(cartData.cart.chunks.flatMap((c: PickChunk) => c.orders.map(o => o.binNumber)))
      const empty = new Set<number>()
      for (let i = 1; i <= totalBinCount; i++) { if (!usedBins.has(i)) empty.add(i) }
      setEmptyBins(empty)

      setStep('shipping')
    } catch (err: any) {
      setError(err.message || 'Failed to load cart')
    } finally {
      setLoading(false)
    }
  }

  // Mark all orders in current bin as shipped
  const handleBinComplete = useCallback(async () => {
    if (!currentChunk) return
    const binOrders = ordersByBin.get(currentBin) || []
    for (const order of binOrders) {
      try {
        await fetch('/api/ship', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'complete-order', chunkId: currentChunk.id, orderNumber: order.orderNumber }),
        })
        setShippedOrders(prev => new Set([...Array.from(prev), order.orderNumber]))
      } catch {}
    }
  }, [currentBin, currentChunk, ordersByBin])

  // Single order complete (for standard/bulk modes)
  const handleOrderComplete = useCallback(async () => {
    if (!currentChunk) return
    const binOrders = ordersByBin.get(currentBin) || []
    const order = binOrders[0]
    if (!order) return

    try {
      await fetch('/api/ship', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete-order', chunkId: currentChunk.id, orderNumber: order.orderNumber }),
      })
      setShippedOrders(prev => new Set([...Array.from(prev), order.orderNumber]))
    } catch {}
  }, [currentBin, currentChunk, ordersByBin])

  // Bulk: mark one order as shipped
  const handleBulkOrderComplete = useCallback(async () => {
    if (!currentChunk || !allOrders[currentBulkOrderIndex]) return
    const order = allOrders[currentBulkOrderIndex]
    try {
      await fetch('/api/ship', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete-order', chunkId: currentChunk.id, orderNumber: order.orderNumber }),
      })
      setShippedOrders(prev => new Set([...Array.from(prev), order.orderNumber]))
    } catch {}
  }, [currentBulkOrderIndex, currentChunk, allOrders])

  // Bulk: advance to next order or complete
  const handleBulkNextOrder = useCallback(async () => {
    if (currentBulkOrderIndex >= allOrders.length - 1) {
      // All orders done
      if (cart && currentChunk) {
        await fetch('/api/ship', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'complete-cart', cartId: cart.id, chunkId: currentChunk.id }),
        })
      }
      setStep('complete')
    } else {
      setCurrentBulkOrderIndex(prev => prev + 1)
    }
  }, [currentBulkOrderIndex, allOrders.length, cart, currentChunk])

  const handleNextBin = useCallback(async () => {
    if (currentBinIndex >= binNumbers.length - 1) {
      // Cart complete
      if (cart && currentChunk) {
        await fetch('/api/ship', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'complete-cart', cartId: cart.id, chunkId: currentChunk.id }),
        })
      }
      setStep('complete')
    } else {
      setCurrentBinIndex(prev => prev + 1)
    }
  }, [currentBinIndex, binNumbers.length, cart, currentChunk])

  const handleReset = () => {
    setCart(null)
    setCartInput('')
    setCurrentBinIndex(0)
    setCurrentBulkOrderIndex(0)
    setShippedOrders(new Set())
    setEmptyBins(new Set())
    setStep('cart-select')
  }

  // ============================================
  // RENDER: Cart Select
  // ============================================
  if (step === 'cart-select') {
    return (
      <div className="min-h-screen bg-gray-100 p-4">
        <div className="max-w-lg mx-auto">
          <h1 className="text-3xl font-bold text-gray-900 mb-6 text-center">Ship Station</h1>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Your Name</label>
            <input
              type="text"
              value={shipperName}
              onChange={(e) => setShipperName(e.target.value)}
              placeholder="Enter your name"
              className="w-full px-4 py-3 text-lg border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Scan or Enter Cart</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={cartInput}
                onChange={(e) => setCartInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSelectCart()}
                placeholder="Scan cart barcode..."
                className="flex-1 px-4 py-3 text-lg border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none"
              />
              <button
                onClick={() => handleSelectCart()}
                disabled={loading}
                className="px-6 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50"
              >
                Go
              </button>
            </div>
          </div>

          {error && <div className="mb-4 bg-red-50 text-red-600 p-3 rounded-lg text-center">{error}</div>}

          {readyCarts.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Or Select Ready Cart</label>
              <div className="grid gap-3">
                {readyCarts.map((c: any) => (
                  <button
                    key={c.id}
                    onClick={() => handleSelectCart(c.id)}
                    disabled={loading}
                    className="p-4 bg-white rounded-xl shadow text-left hover:bg-blue-50 border-2 border-transparent hover:border-blue-500 disabled:opacity-50"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full" style={{ backgroundColor: c.color || '#9ca3af' }} />
                      <div className="flex-1">
                        <div className="font-bold text-lg">{c.name}</div>
                        <div className="text-sm text-gray-600">{c.orderCount} orders</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {readyCarts.length === 0 && (
            <div className="bg-amber-50 text-amber-700 p-4 rounded-lg text-center">
              <p className="font-medium">No carts ready for shipping</p>
              <p className="text-sm mt-1">Wait for pickers to complete carts</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ============================================
  // RENDER: Shipping
  // ============================================
  if (step === 'shipping' && cart) {
    const badge = getModeBadge(pickingMode, isPersonalized)
    const binOrders = ordersByBin.get(currentBin) || []
    const isEmptyBin = emptyBins.has(currentBin)
    const isBulkMode = pickingMode === 'BULK'
    const totalBinCount = isBulkMode ? 4 : 12

    return (
      <div className="min-h-screen bg-gray-100 flex flex-col">
        {/* Header */}
        <div className="bg-white shadow p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="font-bold text-lg">{cart.name}</div>
              <span className={`px-2 py-1 rounded text-xs font-bold ${badge.bg}`}>{badge.label}</span>
            </div>
            <div className="text-right">
              {isBulkMode ? (
                <div className="text-sm text-gray-600">Order {currentBulkOrderIndex + 1} / {allOrders.length}</div>
              ) : (
                <div className="text-sm text-gray-600">Bin {currentBinIndex + 1} / {binNumbers.length}</div>
              )}
              <div className="text-sm text-gray-500">{shipperName}</div>
            </div>
          </div>
        </div>

        {/* Bin/shelf grid (only for non-Bulk modes; Bulk shows layout inside BulkVerification) */}
        {!isBulkMode && (
          <div className="p-4">
            <div className="grid gap-2 bg-gray-100 rounded-lg p-3" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
              {Array.from({ length: totalBinCount }, (_, i) => i + 1).map((bin) => {
                const binShipped = (ordersByBin.get(bin) || []).every(o => shippedOrders.has(o.orderNumber))
                const isCurrent = bin === currentBin
                const isEmpty = emptyBins.has(bin) || !ordersByBin.has(bin)

                let bg = 'bg-white', border = 'border-gray-300', text = 'text-gray-600'
                if (isEmpty) { bg = 'bg-gray-200'; border = 'border-gray-400'; text = 'text-gray-400' }
                else if (binShipped) { bg = 'bg-green-100'; border = 'border-green-500'; text = 'text-green-700' }
                else if (isCurrent) { bg = 'bg-blue-100'; border = 'border-blue-500'; text = 'text-blue-700' }

                return (
                  <div key={bin} className={`aspect-square flex items-center justify-center rounded-lg border-2 font-bold text-xl ${bg} ${border} ${text}`}>
                    {isEmpty ? '—' : binShipped ? '✓' : bin}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Mode-specific verification */}
        {isBulkMode ? (
          <BulkVerification
            orders={allOrders}
            skuLayout={bulkSkuLayout}
            currentOrderIndex={currentBulkOrderIndex}
            onComplete={handleBulkOrderComplete}
            onNext={handleBulkNextOrder}
          />
        ) : pickingMode === 'SINGLES' ? (
          <SinglesVerification
            binOrders={isEmptyBin ? [] : binOrders}
            binNumber={currentBin}
            onComplete={handleBinComplete}
            onNext={handleNextBin}
          />
        ) : (
          <StandardVerification
            order={isEmptyBin ? null : binOrders[0] || null}
            binNumber={currentBin}
            isEmpty={isEmptyBin}
            onComplete={handleOrderComplete}
            onNext={handleNextBin}
          />
        )}
      </div>
    )
  }

  // ============================================
  // RENDER: Complete
  // ============================================
  if (step === 'complete') {
    return (
      <div className="min-h-screen bg-gray-100 p-4 flex items-center justify-center">
        <div className="max-w-lg mx-auto text-center">
          <div className="text-6xl mb-6">&#10003;</div>
          <h1 className="text-3xl font-bold text-green-600 mb-4">Cart Complete!</h1>
          <p className="text-gray-600 mb-2">{shippedOrders.size} orders shipped from {cart?.name}</p>
          <button onClick={handleReset} className="w-full py-4 bg-blue-600 text-white text-xl font-bold rounded-xl hover:bg-blue-700 mt-8">
            Ship Another Cart
          </button>
        </div>
      </div>
    )
  }

  return null
}
