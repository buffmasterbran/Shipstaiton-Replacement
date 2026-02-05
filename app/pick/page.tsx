'use client'

import { useState, useEffect, useCallback } from 'react'

interface PickCell {
  id: string
  name: string
  active: boolean
}

interface PickCart {
  id: string
  name: string
  color: string | null
  status: string
  active: boolean
}

interface OrderItem {
  sku: string
  name: string
  quantity: number
}

interface ChunkOrder {
  id: string
  orderNumber: string
  binNumber: number
  rawPayload: any
}

interface PickChunk {
  id: string
  batchId: string
  chunkNumber: number
  status: string
  cartId: string
  pickerName: string
  ordersInChunk: number
  batch: {
    id: string
    name: string
  }
  cart: PickCart
  orders: ChunkOrder[]
}

// Item grouped by SKU with bin distribution
interface PickItem {
  sku: string
  name: string
  binLocation: string
  bins: Array<{ binNumber: number; quantity: number }>
  totalQuantity: number
}

type PickerStep = 'cell-select' | 'cart-select' | 'picking' | 'complete'

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

// Hamburger menu icon
function MenuIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  )
}

// Cart visualization component - iPad optimized, full size
function CartVisualization({ 
  totalBins, 
  highlightedBins,
  completedBins,
  emptyBins,
  binQuantities,
}: { 
  totalBins: number
  highlightedBins: Set<number>
  completedBins: Set<number>
  emptyBins: Set<number>
  binQuantities?: Map<number, number>
}) {
  const isOversized = totalBins === 6
  const cols = isOversized ? 3 : 4
  const bins = Array.from({ length: totalBins }, (_, i) => i + 1)
  
  return (
    <div 
      className="grid gap-4 w-full h-full"
      style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
    >
      {bins.map((bin) => {
        const isCompleted = completedBins.has(bin)
        const isEmpty = emptyBins.has(bin)
        const isHighlighted = highlightedBins.has(bin)
        const quantity = binQuantities?.get(bin)
        
        let bgColor = 'bg-white'
        let borderColor = 'border-gray-300'
        let textColor = 'text-gray-400'
        
        if (isEmpty) {
          bgColor = 'bg-gray-100'
          borderColor = 'border-gray-300'
          textColor = 'text-gray-300'
        } else if (isCompleted) {
          bgColor = 'bg-green-100'
          borderColor = 'border-green-500'
          textColor = 'text-green-700'
        } else if (isHighlighted) {
          bgColor = 'bg-blue-100'
          borderColor = 'border-blue-500'
          textColor = 'text-blue-700'
        }
        
        return (
          <div
            key={bin}
            className={`flex flex-col items-center justify-center rounded-2xl ${bgColor} ${borderColor} ${textColor}`}
            style={{ borderWidth: '4px' }}
          >
            {isEmpty ? (
              <span className="text-5xl font-bold">—</span>
            ) : isCompleted ? (
              <span className="text-5xl font-bold">✓</span>
            ) : isHighlighted && quantity ? (
              <>
                <span className="text-2xl font-medium text-gray-500">{bin}</span>
                <span className="text-5xl font-bold">×{quantity}</span>
              </>
            ) : (
              <span className="text-5xl font-bold">{bin}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

// Slide-out menu component
function SlideMenu({
  isOpen,
  onClose,
  pickerName,
  cartName,
  cellName,
  onCancelPick,
  onChangeCell,
}: {
  isOpen: boolean
  onClose: () => void
  pickerName: string
  cartName: string
  cellName: string
  onCancelPick: () => void
  onChangeCell: () => void
}) {
  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />
      
      {/* Menu panel */}
      <div className="fixed left-0 top-0 bottom-0 w-72 bg-white shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="p-6 border-b bg-gray-50">
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 mb-4"
          >
            ✕ Close
          </button>
          <h2 className="text-xl font-bold text-gray-900">Menu</h2>
        </div>

        {/* Info section */}
        <div className="p-6 space-y-4 border-b">
          <div className="flex items-center gap-3">
            <span className="text-2xl">👤</span>
            <div>
              <div className="text-sm text-gray-500">Picker</div>
              <div className="font-bold text-gray-900">{pickerName}</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-2xl">🛒</span>
            <div>
              <div className="text-sm text-gray-500">Cart</div>
              <div className="font-bold text-gray-900">{cartName}</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-2xl">📦</span>
            <div>
              <div className="text-sm text-gray-500">Cell</div>
              <div className="font-bold text-gray-900">{cellName}</div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex-1 p-4 space-y-3">
          <button
            onClick={() => {
              onClose()
              onCancelPick()
            }}
            className="w-full py-4 px-4 text-left text-red-600 hover:bg-red-50 rounded-xl font-medium flex items-center gap-3"
          >
            <span className="text-xl">❌</span>
            Cancel Pick
          </button>
          <button
            onClick={() => {
              onClose()
              onChangeCell()
            }}
            className="w-full py-4 px-4 text-left text-gray-700 hover:bg-gray-100 rounded-xl font-medium flex items-center gap-3"
          >
            <span className="text-xl">🔄</span>
            Change Cell
          </button>
        </div>
      </div>
    </>
  )
}

export default function PickerPage() {
  const [step, setStep] = useState<PickerStep>('cell-select')
  const [cells, setCells] = useState<PickCell[]>([])
  const [carts, setCarts] = useState<PickCart[]>([])
  const [selectedCell, setSelectedCell] = useState<PickCell | null>(null)
  const [selectedCart, setSelectedCart] = useState<PickCart | null>(null)
  const [pickerName, setPickerName] = useState('')
  const [chunk, setChunk] = useState<PickChunk | null>(null)
  
  // Location-based picking state
  const [pickItems, setPickItems] = useState<PickItem[]>([])
  const [currentItemIndex, setCurrentItemIndex] = useState(0)
  const [pickedSkus, setPickedSkus] = useState<Set<string>>(new Set())
  const [emptyBins, setEmptyBins] = useState<Set<number>>(new Set())
  const [skuToBinLocation, setSkuToBinLocation] = useState<Map<string, string>>(new Map())
  
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [availableOrderCount, setAvailableOrderCount] = useState(0)
  
  // Menu and dialog state
  const [menuOpen, setMenuOpen] = useState(false)
  const [showCancelDialog, setShowCancelDialog] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  
  // Track if we're in an active pick (for navigation guard)
  const isActivePick = step === 'picking' && chunk !== null

  // Navigation guard - warn when leaving during active pick
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isActivePick) {
        e.preventDefault()
        e.returnValue = 'You have an active pick in progress. Are you sure you want to leave?'
        return e.returnValue
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isActivePick])

  // Load saved picker name from localStorage
  useEffect(() => {
    const savedName = localStorage.getItem('picker-name')
    if (savedName) {
      setPickerName(savedName)
    }
  }, [])

  // Fetch cells
  useEffect(() => {
    const fetchCells = async () => {
      try {
        const res = await fetch('/api/pick?action=active-cells')
        if (res.ok) {
          const data = await res.json()
          setCells(data.cells || [])
        }
      } catch (err) {
        console.error('Failed to fetch cells:', err)
      }
    }
    fetchCells()
  }, [])

  // Fetch carts
  useEffect(() => {
    const fetchCarts = async () => {
      try {
        const res = await fetch('/api/pick?action=available-carts')
        if (res.ok) {
          const data = await res.json()
          setCarts(data.carts || [])
        }
      } catch (err) {
        console.error('Failed to fetch carts:', err)
      }
    }
    if (step === 'cart-select') {
      fetchCarts()
    }
  }, [step])

  // Fetch available orders for selected cell
  useEffect(() => {
    const fetchAvailable = async () => {
      if (!selectedCell) return
      try {
        const res = await fetch(`/api/pick?cellId=${selectedCell.id}`)
        if (res.ok) {
          const data = await res.json()
          setAvailableOrderCount(data.availableOrderCount || 0)
        }
      } catch (err) {
        console.error('Failed to fetch available orders:', err)
      }
    }
    if (selectedCell) {
      fetchAvailable()
    }
  }, [selectedCell])

  // Process chunk into location-based pick items
  const processChunkForPicking = useCallback(async (chunkData: PickChunk) => {
    // Extract all items from all orders, grouped by SKU
    const skuMap = new Map<string, { name: string; bins: Map<number, number> }>()
    
    for (const order of chunkData.orders) {
      const items = getOrderItems(order.rawPayload)
      for (const item of items) {
        const skuKey = item.sku.toUpperCase()
        if (!skuMap.has(skuKey)) {
          skuMap.set(skuKey, { name: item.name, bins: new Map() })
        }
        const existing = skuMap.get(skuKey)!
        const currentQty = existing.bins.get(order.binNumber) || 0
        existing.bins.set(order.binNumber, currentQty + item.quantity)
      }
    }

    // Fetch bin locations for all SKUs
    const locationMap = new Map<string, string>()
    
    try {
      const res = await fetch('/api/products')
      if (res.ok) {
        const data = await res.json()
        const skuRecords = data.skus || []
        for (const record of skuRecords) {
          if (record.binLocation) {
            locationMap.set(record.sku.toUpperCase(), record.binLocation)
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch SKU locations:', err)
    }

    setSkuToBinLocation(locationMap)

    // Convert to PickItem array and sort by location
    const items: PickItem[] = []
    for (const [sku, data] of Array.from(skuMap.entries())) {
      const bins: Array<{ binNumber: number; quantity: number }> = []
      let total = 0
      for (const [binNum, qty] of Array.from(data.bins.entries())) {
        bins.push({ binNumber: binNum, quantity: qty })
        total += qty
      }
      bins.sort((a, b) => a.binNumber - b.binNumber)
      
      items.push({
        sku,
        name: data.name,
        binLocation: locationMap.get(sku) || 'ZZZ',
        bins,
        totalQuantity: total,
      })
    }

    // Sort by bin location
    items.sort((a, b) => a.binLocation.localeCompare(b.binLocation))
    
    setPickItems(items)
    setCurrentItemIndex(0)
    setPickedSkus(new Set())
  }, [])

  // Handle cell selection
  const handleCellSelect = (cell: PickCell) => {
    setSelectedCell(cell)
    setStep('cart-select')
  }

  // Handle cart selection and start picking
  const handleStartPicking = async () => {
    if (!selectedCell || !selectedCart || !pickerName.trim()) {
      setError('Please fill in all fields')
      return
    }

    // Save picker name
    localStorage.setItem('picker-name', pickerName.trim())

    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/pick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'claim-chunk',
          cellId: selectedCell.id,
          cartId: selectedCart.id,
          pickerName: pickerName.trim(),
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to claim chunk')
      }

      setChunk(data.chunk)
      setEmptyBins(new Set())
      await processChunkForPicking(data.chunk)
      setStep('picking')
    } catch (err: any) {
      setError(err.message || 'Failed to start picking')
    } finally {
      setLoading(false)
    }
  }

  // Get current pick item
  const currentItem = pickItems[currentItemIndex] || null
  const isOversized = chunk?.batch.name.startsWith('O-')
  const totalBins = isOversized ? 6 : 12

  // Calculate completed bins (all items for that bin have been picked)
  const completedBins = new Set<number>()
  if (chunk) {
    for (const order of chunk.orders) {
      const orderItems = getOrderItems(order.rawPayload)
      const allPicked = orderItems.every(item => pickedSkus.has(item.sku.toUpperCase()))
      if (allPicked) {
        completedBins.add(order.binNumber)
      }
    }
  }

  // Get highlighted bins for current item
  const highlightedBins = new Set<number>()
  const binQuantities = new Map<number, number>()
  if (currentItem) {
    for (const bin of currentItem.bins) {
      if (!emptyBins.has(bin.binNumber)) {
        highlightedBins.add(bin.binNumber)
        binQuantities.set(bin.binNumber, bin.quantity)
      }
    }
  }

  // Handle complete current item (advance to next location)
  const handleCompleteItem = useCallback(async () => {
    if (!chunk || !currentItem) return

    // Mark this SKU as picked
    setPickedSkus(prev => new Set([...Array.from(prev), currentItem.sku]))

    // Check if this was the last item
    if (currentItemIndex >= pickItems.length - 1) {
      // All items completed
      setLoading(true)
      try {
        await fetch('/api/pick', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'complete-chunk',
            chunkId: chunk.id,
          }),
        })
        setStep('complete')
      } catch (err) {
        console.error('Failed to complete chunk:', err)
      } finally {
        setLoading(false)
      }
    } else {
      // Move to next item
      setCurrentItemIndex(prev => prev + 1)
    }
  }, [chunk, currentItem, currentItemIndex, pickItems.length])

  // Handle out of stock
  const handleOutOfStock = async () => {
    if (!chunk || !currentItem) return

    // Find all bins that have this item
    const affectedBinNumbers = currentItem.bins.map(b => b.binNumber)

    const confirmed = confirm(
      `Mark "${currentItem.sku}" as out of stock? This will empty ${affectedBinNumbers.length} bin(s) and return those orders to the queue.`
    )

    if (!confirmed) return

    setLoading(true)
    try {
      const res = await fetch('/api/pick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'out-of-stock',
          chunkId: chunk.id,
          sku: currentItem.sku,
          affectedBinNumbers,
        }),
      })

      if (!res.ok) {
        throw new Error('Failed to mark out of stock')
      }

      // Mark affected bins as empty
      setEmptyBins(prev => new Set([...Array.from(prev), ...affectedBinNumbers]))
      
      // Mark this SKU as "picked" (actually skipped)
      setPickedSkus(prev => new Set([...Array.from(prev), currentItem.sku]))

      // Move to next item or complete
      if (currentItemIndex >= pickItems.length - 1) {
        // Check if there are any non-empty bins left
        const remainingBins = chunk.orders.filter(o => !emptyBins.has(o.binNumber) && !affectedBinNumbers.includes(o.binNumber))
        if (remainingBins.length === 0) {
          await fetch('/api/pick', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'complete-chunk',
              chunkId: chunk.id,
            }),
          })
          setStep('complete')
        } else {
          setCurrentItemIndex(prev => prev + 1)
        }
      } else {
        setCurrentItemIndex(prev => prev + 1)
      }
    } catch (err) {
      console.error('Failed to mark out of stock:', err)
    } finally {
      setLoading(false)
    }
  }

  // Cancel the current chunk and return orders to queue
  const handleCancelChunk = async () => {
    if (!chunk) return

    setCancelling(true)
    try {
      const res = await fetch('/api/pick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'cancel-chunk',
          chunkId: chunk.id,
          reason: 'picker_cancelled',
        }),
      })

      if (!res.ok) {
        throw new Error('Failed to cancel pick')
      }

      // Reset state and go back to cart selection
      setChunk(null)
      setPickItems([])
      setCurrentItemIndex(0)
      setPickedSkus(new Set())
      setEmptyBins(new Set())
      setShowCancelDialog(false)
      setStep('cart-select')
    } catch (err) {
      console.error('Failed to cancel chunk:', err)
      alert('Failed to cancel pick. Please try again.')
    } finally {
      setCancelling(false)
    }
  }

  // Reset and start new chunk
  const handleStartNewChunk = () => {
    setChunk(null)
    setPickItems([])
    setCurrentItemIndex(0)
    setPickedSkus(new Set())
    setEmptyBins(new Set())
    setStep('cart-select')
  }

  // Reset completely
  const handleReset = () => {
    if (isActivePick) {
      setShowCancelDialog(true)
      return
    }
    setSelectedCell(null)
    setSelectedCart(null)
    setChunk(null)
    setPickItems([])
    setCurrentItemIndex(0)
    setPickedSkus(new Set())
    setEmptyBins(new Set())
    setStep('cell-select')
  }

  // ============================================
  // RENDER: Cell Selection (Full Screen)
  // ============================================
  if (step === 'cell-select') {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center p-8">
        <div className="w-full max-w-2xl">
          <h1 className="text-5xl font-bold text-white mb-4 text-center">
            Pick Station
          </h1>
          <p className="text-xl text-blue-200 mb-12 text-center">
            Select your cell to begin
          </p>

          {cells.length === 0 ? (
            <div className="bg-white/20 backdrop-blur text-white p-8 rounded-2xl text-center">
              <p className="text-2xl font-medium">No active cells available</p>
              <p className="text-blue-200 mt-2">Contact admin to set up cells</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-6">
              {cells.map((cell) => (
                <button
                  key={cell.id}
                  onClick={() => handleCellSelect(cell)}
                  className="bg-white rounded-2xl shadow-2xl p-8 text-center hover:scale-105 transition-transform active:scale-95"
                >
                  <div className="text-4xl font-bold text-gray-900">{cell.name}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ============================================
  // RENDER: Cart Selection (Full Screen)
  // ============================================
  if (step === 'cart-select') {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-green-600 to-green-800 flex items-center justify-center p-8">
        <div className="w-full max-w-3xl">
          <button
            onClick={handleReset}
            className="mb-6 text-white/80 hover:text-white flex items-center gap-2 text-lg"
          >
            ← Back to cell selection
          </button>

          <h1 className="text-4xl font-bold text-white mb-2 text-center">
            {selectedCell?.name}
          </h1>
          <p className="text-xl text-green-200 mb-8 text-center">
            {availableOrderCount} orders waiting
          </p>

          <div className="bg-white rounded-2xl shadow-2xl p-8 mb-6">
            <label className="block text-lg font-medium text-gray-700 mb-3">
              Your Name
            </label>
            <input
              type="text"
              value={pickerName}
              onChange={(e) => setPickerName(e.target.value)}
              placeholder="Enter your name"
              className="w-full px-6 py-4 text-2xl border-2 border-gray-300 rounded-xl focus:border-green-500 focus:outline-none"
            />
          </div>

          <div className="bg-white rounded-2xl shadow-2xl p-8 mb-6">
            <label className="block text-lg font-medium text-gray-700 mb-3">
              Select Cart
            </label>
            {carts.length === 0 ? (
              <div className="text-amber-600 text-center py-8">
                <p className="text-xl font-medium">No carts available</p>
                <p className="text-gray-500 mt-1">All carts are in use</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-4">
                {carts.map((cart) => (
                  <button
                    key={cart.id}
                    onClick={() => setSelectedCart(cart)}
                    className={`p-6 rounded-xl border-3 text-center transition-all ${
                      selectedCart?.id === cart.id
                        ? 'border-green-500 bg-green-50'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                    style={{ borderWidth: '3px' }}
                  >
                    <div
                      className="w-12 h-12 rounded-full mx-auto mb-3"
                      style={{ backgroundColor: cart.color || '#9ca3af' }}
                    />
                    <div className="text-xl font-bold text-gray-900">{cart.name}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {error && (
            <div className="mb-6 bg-red-100 text-red-700 p-4 rounded-xl text-center text-lg">
              {error}
            </div>
          )}

          <button
            onClick={handleStartPicking}
            disabled={loading || !selectedCart || !pickerName.trim() || carts.length === 0}
            className="w-full py-6 bg-white text-green-700 text-3xl font-bold rounded-2xl hover:bg-green-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-xl"
          >
            {loading ? 'Starting...' : 'Start Picking →'}
          </button>
        </div>
      </div>
    )
  }

  // ============================================
  // RENDER: Picking (iPad Landscape Optimized)
  // ============================================
  if (step === 'picking' && chunk && currentItem) {
    const activeBins = currentItem.bins.filter(b => !emptyBins.has(b.binNumber))
    const activeTotal = activeBins.reduce((sum, b) => sum + b.quantity, 0)

    return (
      <div className="fixed inset-0 bg-gray-100 flex flex-col">
        {/* Slide-out menu */}
        <SlideMenu
          isOpen={menuOpen}
          onClose={() => setMenuOpen(false)}
          pickerName={chunk.pickerName}
          cartName={chunk.cart.name}
          cellName={selectedCell?.name || ''}
          onCancelPick={() => setShowCancelDialog(true)}
          onChangeCell={() => setShowCancelDialog(true)}
        />

        {/* Cancel confirmation dialog */}
        {showCancelDialog && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-8">
            <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-8">
              <h2 className="text-3xl font-bold text-gray-900 mb-6">Cancel This Pick?</h2>
              <div className="text-xl text-gray-600 mb-8 space-y-3">
                <p>The cart will be released and all orders will return to the batch queue.</p>
                <p className="text-amber-600 font-medium">
                  Return any items in the cart to their shelves.
                </p>
              </div>
              <div className="flex gap-4">
                <button
                  onClick={() => setShowCancelDialog(false)}
                  disabled={cancelling}
                  className="flex-1 py-5 bg-gray-100 text-gray-700 text-xl font-bold rounded-2xl hover:bg-gray-200 transition-colors disabled:opacity-50"
                >
                  Keep Picking
                </button>
                <button
                  onClick={handleCancelChunk}
                  disabled={cancelling}
                  className="flex-1 py-5 bg-red-600 text-white text-xl font-bold rounded-2xl hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  {cancelling ? 'Cancelling...' : 'Cancel Pick'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Top header bar - compact */}
        <div className="bg-white shadow-lg px-4 py-2 flex items-center justify-between">
          <button
            onClick={() => setMenuOpen(true)}
            className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <MenuIcon className="w-8 h-8 text-gray-700" />
          </button>
          <div className="text-center">
            <div className="text-xl font-medium text-gray-700">{chunk.batch.name} • {chunk.cart.name}</div>
          </div>
          <div className="text-right">
            <div className="text-xl font-medium text-gray-700">Item {currentItemIndex + 1} of {pickItems.length}</div>
          </div>
        </div>

        {/* Main content - two columns on landscape, maximized space */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
          {/* Left column: Cart visualization - takes maximum space */}
          <div className="lg:w-1/2 p-4 flex flex-col bg-gray-50">
            <div className="text-lg font-bold text-gray-500 mb-2 text-center">CART</div>
            <div className="flex-1 min-h-0">
              <CartVisualization
                totalBins={totalBins}
                highlightedBins={highlightedBins}
                completedBins={completedBins}
                emptyBins={emptyBins}
                binQuantities={binQuantities}
              />
            </div>
          </div>

          {/* Right column: Pick instructions - maximized */}
          <div className="lg:w-1/2 p-4 flex flex-col">
            <div className="bg-white rounded-3xl shadow-xl p-6 flex-1 flex flex-col justify-center text-center">
              {/* Location */}
              <div className="text-xl font-medium text-blue-600 mb-1">GO TO LOCATION</div>
              <div className="text-8xl lg:text-9xl font-bold text-blue-700 mb-4">
                {currentItem.binLocation !== 'ZZZ' ? currentItem.binLocation : '—'}
              </div>

              {/* Divider */}
              <div className="border-t border-gray-200 my-4" />

              {/* SKU */}
              <div className="text-xl text-gray-500 mb-1">Pick item:</div>
              <div className="text-4xl font-bold text-gray-900 font-mono mb-1">
                {currentItem.sku}
              </div>
              <div className="text-xl text-gray-500 mb-4 truncate">
                {currentItem.name}
              </div>

              {/* Quantity */}
              <div className="bg-blue-50 rounded-2xl p-6">
                <div className="text-xl text-blue-600 mb-1">GRAB</div>
                <div className="text-7xl font-bold text-blue-700">{activeTotal}</div>
                <div className="text-xl text-blue-600">{activeTotal === 1 ? 'item' : 'items'}</div>
              </div>

              {/* Bin distribution */}
              {activeBins.length > 1 && (
                <div className="flex flex-wrap justify-center gap-4 mt-4">
                  {activeBins.map((bin) => (
                    <div
                      key={bin.binNumber}
                      className="bg-gray-100 rounded-xl px-5 py-3 text-center"
                    >
                      <div className="text-lg text-gray-500">Bin {bin.binNumber}</div>
                      <div className="text-2xl font-bold text-gray-700">×{bin.quantity}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom action bar - compact but large touch targets */}
        <div className="bg-white shadow-lg px-4 py-3 flex gap-4">
          <button
            onClick={handleOutOfStock}
            disabled={loading}
            className="flex-1 py-4 text-red-600 border-3 border-red-200 text-xl font-bold rounded-2xl hover:bg-red-50 transition-colors disabled:opacity-50"
            style={{ borderWidth: '3px' }}
          >
            Out of Stock
          </button>
          <button
            onClick={handleCompleteItem}
            disabled={loading}
            className="flex-[2] py-4 bg-green-600 text-white text-2xl font-bold rounded-2xl hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            {loading ? 'Processing...' : currentItemIndex >= pickItems.length - 1 ? 'Complete Cart ✓' : 'Continue →'}
          </button>
        </div>
      </div>
    )
  }

  // ============================================
  // RENDER: Complete (Full Screen)
  // ============================================
  if (step === 'complete') {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-green-500 to-green-700 flex items-center justify-center p-8">
        <div className="text-center">
          <div className="text-9xl mb-8">✓</div>
          <h1 className="text-5xl font-bold text-white mb-4">
            Cart Complete!
          </h1>
          <p className="text-2xl text-green-100 mb-12">
            Take <span className="font-bold">{chunk?.cart.name}</span> to the shipping station
          </p>

          <div className="flex flex-col gap-4 max-w-md mx-auto">
            <button
              onClick={handleStartNewChunk}
              className="py-6 bg-white text-green-700 text-2xl font-bold rounded-2xl hover:bg-green-50 transition-colors shadow-xl"
            >
              Pick Another Cart →
            </button>
            <button
              onClick={handleReset}
              className="py-5 bg-white/20 text-white text-xl font-bold rounded-2xl hover:bg-white/30 transition-colors"
            >
              Change Cell
            </button>
          </div>
        </div>
      </div>
    )
  }

  return null
}
