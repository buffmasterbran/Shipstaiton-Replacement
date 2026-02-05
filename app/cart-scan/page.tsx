'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

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

interface PickChunk {
  id: string
  batchId: string
  chunkNumber: number
  status: string
  cartId: string
  batch: {
    id: string
    name: string
  }
  orders: ChunkOrder[]
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

// Helper to extract items from order payload
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

// Shipping verification interface for a single order
function OrderVerification({
  order,
  chunkId,
  binNumber,
  isEmpty,
  onComplete,
  onNext,
}: {
  order: ChunkOrder | null
  chunkId: string
  binNumber: number
  isEmpty: boolean
  onComplete: (trackingNumber?: string) => void
  onNext: () => void
}) {
  const [items, setItems] = useState<OrderItem[]>([])
  const [scannedCounts, setScannedCounts] = useState<Map<string, number>>(new Map())
  const [scanInput, setScanInput] = useState('')
  const [scanError, setScanError] = useState<string | null>(null)
  const [allVerified, setAllVerified] = useState(false)
  const [labelPrinted, setLabelPrinted] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Initialize items when order changes
  useEffect(() => {
    if (order) {
      const orderItems = getOrderItems(order.rawPayload)
      setItems(orderItems)
      setScannedCounts(new Map())
      setScanError(null)
      setAllVerified(false)
      setLabelPrinted(false)
    }
  }, [order])

  // Focus input on mount
  useEffect(() => {
    if (inputRef.current && !isEmpty) {
      inputRef.current.focus()
    }
  }, [order, isEmpty])

  // Check if all items are verified
  useEffect(() => {
    if (items.length === 0) return
    
    const allDone = items.every(item => {
      const scanned = scannedCounts.get(item.sku.toUpperCase()) || 0
      return scanned >= item.quantity
    })
    setAllVerified(allDone)
  }, [items, scannedCounts])

  // Handle scan
  const handleScan = useCallback((value: string) => {
    if (!value.trim()) return

    const scannedValue = value.trim().toUpperCase()
    setScanInput('')
    setScanError(null)

    // Find matching item
    const matchedItem = items.find(item => 
      item.sku.toUpperCase() === scannedValue
    )

    if (!matchedItem) {
      setScanError('Not in this order')
      return
    }

    // Check if already at expected quantity
    const currentCount = scannedCounts.get(scannedValue) || 0
    if (currentCount >= matchedItem.quantity) {
      setScanError(`Warning: Expected ${matchedItem.quantity}, scanned ${currentCount + 1}`)
    }

    // Increment count
    setScannedCounts(prev => {
      const newMap = new Map(prev)
      newMap.set(scannedValue, (prev.get(scannedValue) || 0) + 1)
      return newMap
    })
  }, [items, scannedCounts])

  // Handle key press
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleScan(scanInput)
    }
  }

  // Handle print label
  const handlePrintLabel = async () => {
    // In a real implementation, this would call ShipEngine to generate and print a label
    // For now, we'll simulate it
    setLabelPrinted(true)
    
    // TODO: Integrate with actual label printing
    // const response = await fetch('/api/shipengine/create-label', {...})
  }

  // Handle next order
  const handleNext = () => {
    if (labelPrinted) {
      onComplete()
    }
    onNext()
  }

  if (isEmpty) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="text-6xl mb-4">📭</div>
        <h2 className="text-2xl font-bold text-gray-500 mb-2">Bin {binNumber} is Empty</h2>
        <p className="text-gray-400 mb-6">
          This bin was emptied due to out-of-stock items during picking.
        </p>
        <button
          onClick={onNext}
          className="px-8 py-4 bg-blue-600 text-white text-xl font-bold rounded-xl hover:bg-blue-700"
        >
          Continue to Next Bin →
        </button>
      </div>
    )
  }

  if (!order) return null

  return (
    <div className="flex-1 flex flex-col">
      {/* Order info */}
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

      {/* Scan input */}
      <div className="px-4 mb-4">
        <input
          ref={inputRef}
          type="text"
          value={scanInput}
          onChange={(e) => setScanInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Scan item barcode..."
          className="w-full px-4 py-3 text-lg border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none"
          disabled={allVerified}
        />
        {scanError && (
          <div className={`mt-2 p-2 rounded-lg text-center font-medium ${
            scanError.startsWith('Warning') ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
          }`}>
            {scanError}
          </div>
        )}
      </div>

      {/* Items list */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="space-y-3">
          {items.map((item, idx) => {
            const scanned = scannedCounts.get(item.sku.toUpperCase()) || 0
            const isComplete = scanned >= item.quantity
            const isOverScanned = scanned > item.quantity

            return (
              <div
                key={idx}
                className={`p-4 rounded-xl border-2 ${
                  isComplete 
                    ? isOverScanned 
                      ? 'border-amber-500 bg-amber-50' 
                      : 'border-green-500 bg-green-50'
                    : 'border-gray-200 bg-white'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="font-mono text-lg font-bold text-gray-900">
                      {item.sku}
                    </div>
                    <div className="text-sm text-gray-600 truncate">
                      {item.name}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-3xl font-bold ${
                      isComplete 
                        ? isOverScanned ? 'text-amber-600' : 'text-green-600'
                        : 'text-gray-400'
                    }`}>
                      {scanned}/{item.quantity}
                    </div>
                    {isComplete && (
                      <div className="text-sm text-green-600">✓ Verified</div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Action buttons */}
      <div className="p-4 bg-white shadow-lg space-y-3">
        {allVerified && !labelPrinted && (
          <button
            onClick={handlePrintLabel}
            className="w-full py-4 bg-green-600 text-white text-xl font-bold rounded-xl hover:bg-green-700"
          >
            🖨️ Print Label
          </button>
        )}
        
        {labelPrinted && (
          <div className="text-center text-green-600 font-medium mb-2">
            ✓ Label printed successfully
          </div>
        )}
        
        <button
          onClick={handleNext}
          disabled={!allVerified && items.length > 0}
          className={`w-full py-4 text-xl font-bold rounded-xl ${
            allVerified
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          {labelPrinted ? 'Next Order →' : 'Skip (Requires Verification)'}
        </button>
      </div>
    </div>
  )
}

export default function CartScanPage() {
  const [step, setStep] = useState<ShipStep>('cart-select')
  const [readyCarts, setReadyCarts] = useState<any[]>([])
  const [cart, setCart] = useState<CartWithChunks | null>(null)
  const [shipperName, setShipperName] = useState('')
  const [cartInput, setCartInput] = useState('')
  const [currentOrderIndex, setCurrentOrderIndex] = useState(0)
  const [shippedOrders, setShippedOrders] = useState<Set<string>>(new Set())
  const [emptyBins, setEmptyBins] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load saved shipper name
  useEffect(() => {
    const savedName = localStorage.getItem('shipper-name')
    if (savedName) {
      setShipperName(savedName)
    }
  }, [])

  // Fetch ready carts
  useEffect(() => {
    const fetchReadyCarts = async () => {
      try {
        const res = await fetch('/api/ship?action=ready-carts')
        if (res.ok) {
          const data = await res.json()
          setReadyCarts(data.carts || [])
        }
      } catch (err) {
        console.error('Failed to fetch ready carts:', err)
      }
    }

    if (step === 'cart-select') {
      fetchReadyCarts()
    }
  }, [step])

  // Get all orders from cart chunks, sorted by bin number
  const allOrders = cart?.chunks.flatMap(chunk => 
    chunk.orders.filter(o => o.status === 'AWAITING_SHIPMENT')
  ).sort((a, b) => (a.binNumber || 0) - (b.binNumber || 0)) || []

  const currentOrder = allOrders[currentOrderIndex] || null
  const currentChunk = cart?.chunks.find(c => c.orders.some(o => o.id === currentOrder?.id))
  const isOversized = currentChunk?.batch.name.startsWith('O-')
  const totalBins = isOversized ? 6 : 12

  // Handle cart selection/scan
  const handleSelectCart = async (cartId?: string) => {
    if (!shipperName.trim()) {
      setError('Please enter your name')
      return
    }

    const searchCartId = cartId || cartInput.trim()
    if (!searchCartId) {
      setError('Please enter or select a cart')
      return
    }

    localStorage.setItem('shipper-name', shipperName.trim())

    setLoading(true)
    setError(null)

    try {
      // First fetch cart details
      const cartRes = await fetch(`/api/ship?cartId=${searchCartId}`)
      if (!cartRes.ok) {
        const cartData = await cartRes.json()
        throw new Error(cartData.error || 'Cart not found')
      }

      const cartData = await cartRes.json()
      
      // Start shipping session
      const startRes = await fetch('/api/ship', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start-shipping',
          cartId: cartData.cart.id,
          shipperName: shipperName.trim(),
        }),
      })

      if (!startRes.ok) {
        const startData = await startRes.json()
        throw new Error(startData.error || 'Failed to start shipping')
      }

      setCart(cartData.cart)
      setCurrentOrderIndex(0)
      setShippedOrders(new Set())
      
      // Identify empty bins
      const usedBins = new Set(cartData.cart.chunks.flatMap((c: PickChunk) => 
        c.orders.map(o => o.binNumber)
      ))
      const empty = new Set<number>()
      for (let i = 1; i <= totalBins; i++) {
        if (!usedBins.has(i)) {
          empty.add(i)
        }
      }
      setEmptyBins(empty)
      
      setStep('shipping')
    } catch (err: any) {
      setError(err.message || 'Failed to load cart')
    } finally {
      setLoading(false)
    }
  }

  // Handle order completion
  const handleOrderComplete = useCallback(async (trackingNumber?: string) => {
    if (!currentOrder || !currentChunk) return

    try {
      await fetch('/api/ship', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'complete-order',
          chunkId: currentChunk.id,
          orderNumber: currentOrder.orderNumber,
          trackingNumber,
        }),
      })

      setShippedOrders(prev => new Set([...Array.from(prev), currentOrder.orderNumber]))
    } catch (err) {
      console.error('Failed to complete order:', err)
    }
  }, [currentOrder, currentChunk])

  // Handle next order
  const handleNextOrder = useCallback(async () => {
    if (currentOrderIndex >= allOrders.length - 1) {
      // Cart complete
      if (cart && currentChunk) {
        await fetch('/api/ship', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'complete-cart',
            cartId: cart.id,
            chunkId: currentChunk.id,
          }),
        })
      }
      setStep('complete')
    } else {
      setCurrentOrderIndex(prev => prev + 1)
    }
  }, [currentOrderIndex, allOrders.length, cart, currentChunk])

  // Handle reset
  const handleReset = () => {
    setCart(null)
    setCartInput('')
    setCurrentOrderIndex(0)
    setShippedOrders(new Set())
    setEmptyBins(new Set())
    setStep('cart-select')
  }

  // Render cart select step
  if (step === 'cart-select') {
    return (
      <div className="min-h-screen bg-gray-100 p-4">
        <div className="max-w-lg mx-auto">
          <h1 className="text-3xl font-bold text-gray-900 mb-6 text-center">
            Cart Scan & Ship
          </h1>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Your Name
            </label>
            <input
              type="text"
              value={shipperName}
              onChange={(e) => setShipperName(e.target.value)}
              placeholder="Enter your name"
              className="w-full px-4 py-3 text-lg border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Scan or Enter Cart
            </label>
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

          {error && (
            <div className="mb-4 bg-red-50 text-red-600 p-3 rounded-lg text-center">
              {error}
            </div>
          )}

          {readyCarts.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Or Select Ready Cart
              </label>
              <div className="grid gap-3">
                {readyCarts.map((cart) => (
                  <button
                    key={cart.id}
                    onClick={() => handleSelectCart(cart.id)}
                    disabled={loading}
                    className="p-4 bg-white rounded-xl shadow text-left hover:bg-blue-50 border-2 border-transparent hover:border-blue-500 transition-all disabled:opacity-50"
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className="w-10 h-10 rounded-full"
                        style={{ backgroundColor: cart.color || '#gray' }}
                      />
                      <div className="flex-1">
                        <div className="font-bold text-lg">{cart.name}</div>
                        <div className="text-sm text-gray-600">
                          {cart.orderCount} orders ready
                        </div>
                      </div>
                      <div className="text-blue-600">→</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {readyCarts.length === 0 && (
            <div className="bg-amber-50 text-amber-700 p-4 rounded-lg text-center">
              <p className="font-medium">No carts ready for shipping</p>
              <p className="text-sm mt-1">Wait for pickers to complete their carts</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Render shipping step
  if (step === 'shipping' && cart) {
    const currentBinNumber = currentOrder?.binNumber || 0
    const isEmptyBin = emptyBins.has(currentBinNumber)

    return (
      <div className="min-h-screen bg-gray-100 flex flex-col">
        {/* Header */}
        <div className="bg-white shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-bold text-lg">{cart.name}</div>
              <div className="text-sm text-gray-600">
                Shipper: {shipperName}
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-600">Progress</div>
              <div className="text-lg font-bold">
                {currentOrderIndex + 1} / {allOrders.length}
              </div>
            </div>
          </div>
        </div>

        {/* Bin visualization - 4x3 for standard, 3x2 for oversized */}
        <div className="p-4">
          <div 
            className="grid gap-2 bg-gray-100 rounded-lg p-3"
            style={{ gridTemplateColumns: `repeat(${isOversized ? 3 : 4}, 1fr)` }}
          >
            {Array.from({ length: totalBins }, (_, i) => i + 1).map((bin) => {
              const isShipped = shippedOrders.has(
                allOrders.find(o => o.binNumber === bin)?.orderNumber || ''
              )
              const isCurrent = bin === currentBinNumber
              const isEmpty = emptyBins.has(bin)
              
              let bgColor = 'bg-white'
              let borderColor = 'border-gray-300'
              let textColor = 'text-gray-600'
              
              if (isEmpty) {
                bgColor = 'bg-gray-200'
                borderColor = 'border-gray-400'
                textColor = 'text-gray-400'
              } else if (isShipped) {
                bgColor = 'bg-green-100'
                borderColor = 'border-green-500'
                textColor = 'text-green-700'
              } else if (isCurrent) {
                bgColor = 'bg-blue-100'
                borderColor = 'border-blue-500'
                textColor = 'text-blue-700'
              }
              
              return (
                <div
                  key={bin}
                  className={`aspect-square flex items-center justify-center rounded-lg border-2 font-bold text-xl ${bgColor} ${borderColor} ${textColor}`}
                >
                  {isEmpty ? '—' : isShipped ? '✓' : bin}
                </div>
              )
            })}
          </div>
        </div>

        {/* Order verification */}
        <OrderVerification
          order={isEmptyBin ? null : currentOrder}
          chunkId={currentChunk?.id || ''}
          binNumber={currentBinNumber}
          isEmpty={isEmptyBin}
          onComplete={handleOrderComplete}
          onNext={handleNextOrder}
        />
      </div>
    )
  }

  // Render complete step
  if (step === 'complete') {
    return (
      <div className="min-h-screen bg-gray-100 p-4 flex items-center justify-center">
        <div className="max-w-lg mx-auto text-center">
          <div className="text-6xl mb-6">🎉</div>
          <h1 className="text-3xl font-bold text-green-600 mb-4">
            Cart Complete!
          </h1>
          <p className="text-gray-600 mb-2">
            All orders have been shipped.
          </p>
          <p className="text-gray-600 mb-8">
            {shippedOrders.size} orders shipped from {cart?.name}
          </p>

          <button
            onClick={handleReset}
            className="w-full py-4 bg-blue-600 text-white text-xl font-bold rounded-xl hover:bg-blue-700 transition-colors"
          >
            Ship Another Cart
          </button>
        </div>
      </div>
    )
  }

  return null
}
