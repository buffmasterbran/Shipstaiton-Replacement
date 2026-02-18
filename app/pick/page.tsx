'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRole } from '@/context/RoleContext'
import { PickCell, PickCart, PickChunk, PickItem, PickerStep, BulkSkuLayoutEntry } from './types'
import { getOrderItems, extractProductInfo, formatTimer, getModeBadge } from './helpers'
import { useTimer } from './hooks/useTimer'
import { CartVisualization } from './CartVisualization'
import { SlideMenu } from './SlideMenu'

// ============================================================================
// Main Page
// ============================================================================

export default function PickerPage() {
  const { role } = useRole()
  const isAdmin = role === 'admin'
  const [step, setStep] = useState<PickerStep>('login')
  const [cells, setCells] = useState<PickCell[]>([])
  const [carts, setCarts] = useState<PickCart[]>([])
  const [selectedCell, setSelectedCell] = useState<PickCell | null>(null)
  const [selectedCart, setSelectedCart] = useState<PickCart | null>(null)
  const [pickerName, setPickerName] = useState('')
  const [chunk, setChunk] = useState<PickChunk | null>(null)
  
  // Pick state
  const [pickItems, setPickItems] = useState<PickItem[]>([])
  const [currentItemIndex, setCurrentItemIndex] = useState(0)
  const [pickedSkus, setPickedSkus] = useState<Set<string>>(new Set())
  const [emptyBins, setEmptyBins] = useState<Set<number>>(new Set())
  
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [availableOrderCount, setAvailableOrderCount] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const [showCancelDialog, setShowCancelDialog] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [returnToCell, setReturnToCell] = useState<PickCell | null>(null) // Track cell to return to after personalized pick
  const [personalizedOrderCount, setPersonalizedOrderCount] = useState(0)
  const [releaseCart, setReleaseCart] = useState<PickCart | null>(null)
  const [releasing, setReleasing] = useState(false)
  
  // Timer
  const timer = useTimer()

  const isActivePick = step === 'picking' && chunk !== null

  // Navigation guard
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isActivePick) {
        e.preventDefault()
        e.returnValue = 'You have an active pick in progress. Leave?'
        return e.returnValue
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isActivePick])

  // Auto-populate picker name from logged-in user or saved preference
  useEffect(() => {
    const saved = localStorage.getItem('picker-name')
    const loggedInName = localStorage.getItem('current-user-name')
    const name = saved || loggedInName || ''
    if (name) {
      setPickerName(name)
      setStep('cell-select')
    }
  }, [])

  // Fetch cells
  useEffect(() => {
    fetch('/api/pick?action=active-cells')
      .then(res => res.json())
      .then(data => setCells(data.cells || []))
      .catch(() => {})
  }, [])

  // Fetch carts when needed
  useEffect(() => {
    if (step === 'cart-select') {
      const params = isAdmin ? '&includeActive=true' : ''
      fetch(`/api/pick?action=available-carts${params}`)
        .then(res => res.json())
        .then(data => setCarts(data.carts || []))
        .catch(() => {})
    }
  }, [step, isAdmin])

  // Fetch available orders for cell
  useEffect(() => {
      if (!selectedCell) return
    fetch(`/api/pick?cellId=${selectedCell.id}`)
      .then(res => res.json())
      .then(data => setAvailableOrderCount(data.availableOrderCount || 0))
      .catch(() => {})
  }, [selectedCell])

  // Fetch personalized order count from the personalized pool
  useEffect(() => {
    if (step !== 'cell-select' && step !== 'cart-select') return
    fetch('/api/pick?action=personalized-count')
      .then(res => res.json())
      .then(data => setPersonalizedOrderCount(data.availableOrderCount || 0))
      .catch(() => setPersonalizedOrderCount(0))
  }, [step])

  // Process chunk into pick items sorted by location
  const processChunkForPicking = useCallback(async (chunkData: PickChunk) => {
    // Fetch bin locations for all SKUs
    const locationMap = new Map<string, string>()
    try {
      const res = await fetch('/api/products')
        if (res.ok) {
          const data = await res.json()
        for (const record of (data.skus || [])) {
          if (record.binLocation) locationMap.set(record.sku.toUpperCase(), record.binLocation)
        }
      }
    } catch {}

    const isBulkMode = chunkData.batch.type === 'BULK' && 
      chunkData.bulkBatchAssignments && 
      chunkData.bulkBatchAssignments.length > 0

    if (isBulkMode) {
      // BULK MODE: Consolidate skuLayouts across ALL shelves (up to 3)
      const assignments = [...chunkData.bulkBatchAssignments!].sort((a, b) => a.shelfNumber - b.shelfNumber)

      const skuGroups = new Map<string, { bins: Array<{ binNumber: number; quantity: number }>; totalQty: number }>()

      for (const assignment of assignments) {
        const layout = (assignment.bulkBatch.skuLayout || []) as BulkSkuLayoutEntry[]
        const binOffset = (assignment.shelfNumber - 1) * 4

        for (const entry of layout) {
          const skuKey = entry.sku.toUpperCase()
          if (!skuGroups.has(skuKey)) {
            skuGroups.set(skuKey, { bins: [], totalQty: 0 })
          }
          const group = skuGroups.get(skuKey)!
          const physicalBin = entry.masterUnitIndex + 1 + binOffset
          group.bins.push({ binNumber: physicalBin, quantity: entry.binQty })
          group.totalQty += entry.binQty
        }
      }

      // Build pick items from the consolidated layout
      const items: PickItem[] = []
      for (const [sku, data] of Array.from(skuGroups.entries())) {
        data.bins.sort((a, b) => a.binNumber - b.binNumber)
        let friendlyName = sku
        if (chunkData.orders.length > 0) {
          const orderItems = getOrderItems(chunkData.orders[0].rawPayload)
          const match = orderItems.find(i => i.sku.toUpperCase() === sku)
          if (match) friendlyName = match.name
        }
        const info = extractProductInfo(sku)
        items.push({
          sku,
          name: friendlyName,
          binLocation: locationMap.get(sku) || 'ZZZ',
          productSize: info.size,
          productColor: info.color,
          bins: data.bins,
          totalQuantity: data.totalQty,
        })
      }

      items.sort((a, b) => a.binLocation.localeCompare(b.binLocation))
      setPickItems(items)
      setCurrentItemIndex(0)
      setPickedSkus(new Set())
      return
    }

    // SINGLES / OBS / PERSONALIZED: Derive from order payloads
    const skuMap = new Map<string, { name: string; bins: Map<number, number> }>()
    
    for (const order of chunkData.orders) {
      const items = getOrderItems(order.rawPayload)
      for (const item of items) {
        const skuKey = item.sku.toUpperCase()
        if (!skuMap.has(skuKey)) {
          skuMap.set(skuKey, { name: item.name, bins: new Map() })
        }
        const existing = skuMap.get(skuKey)!
        existing.bins.set(order.binNumber, (existing.bins.get(order.binNumber) || 0) + item.quantity)
      }
    }

    // Build pick items
    const items: PickItem[] = []
    for (const [sku, data] of Array.from(skuMap.entries())) {
      const bins: Array<{ binNumber: number; quantity: number }> = []
      let total = 0
      for (const [binNum, qty] of Array.from(data.bins.entries())) {
        bins.push({ binNumber: binNum, quantity: qty })
        total += qty
      }
      bins.sort((a, b) => a.binNumber - b.binNumber)
      
      const info = extractProductInfo(sku)
      items.push({
        sku,
        name: data.name,
        binLocation: locationMap.get(sku) || 'ZZZ',
        productSize: info.size,
        productColor: info.color,
        bins,
        totalQuantity: total,
      })
    }

    items.sort((a, b) => a.binLocation.localeCompare(b.binLocation))
    setPickItems(items)
    setCurrentItemIndex(0)
    setPickedSkus(new Set())
  }, [])

  // ============================================
  // Actions
  // ============================================

  const handleLogin = () => {
    if (!pickerName.trim()) return
    localStorage.setItem('picker-name', pickerName.trim())
    setStep('cell-select')
  }

  const handleCellSelect = (cell: PickCell) => {
    setSelectedCell(cell)
    setStep('cart-select')
  }

  const [pickingPersonalized, setPickingPersonalized] = useState(false)

  const handlePickPersonalized = () => {
    if (selectedCell) {
      setReturnToCell(selectedCell)
    }
    setPickingPersonalized(true)
    setStep('cart-select')
  }

  const handleStartPicking = async () => {
    if (!pickingPersonalized && !selectedCell) {
      setError('Please select a cell')
      return
    }
    if (!selectedCart || !pickerName.trim()) {
      setError('Please fill in all fields')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const claimBody: any = {
          action: 'claim-chunk',
          cartId: selectedCart.id,
          pickerName: pickerName.trim(),
      }
      if (pickingPersonalized) {
        claimBody.personalized = true
      } else {
        claimBody.cellId = selectedCell!.id
      }

      const res = await fetch('/api/pick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(claimBody),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to claim chunk')

      setChunk(data.chunk)
      setEmptyBins(new Set())
      await processChunkForPicking(data.chunk)
      timer.start()
      setStep('picking')
    } catch (err: any) {
      setError(err.message || 'Failed to start picking')
    } finally {
      setLoading(false)
    }
  }

  // Current pick item
  const currentItem = pickItems[currentItemIndex] || null
  const batchType = chunk?.batch.type || chunk?.pickingMode
  const isPersonalized = chunk?.batch.isPersonalized || chunk?.isPersonalized || false
  const totalBins = 12

  // Calculate completed and highlighted bins
  const completedBins = new Set<number>()
  if (chunk) {
    const isBulkPicking = batchType === 'BULK' && chunk.bulkBatchAssignments && chunk.bulkBatchAssignments.length > 0
    if (isBulkPicking) {
      const assignments = [...chunk.bulkBatchAssignments!].sort((a, b) => a.shelfNumber - b.shelfNumber)
      for (const assignment of assignments) {
        const layout = (assignment.bulkBatch.skuLayout || []) as BulkSkuLayoutEntry[]
        const binOffset = (assignment.shelfNumber - 1) * 4
        for (const entry of layout) {
          const physicalBin = entry.masterUnitIndex + 1 + binOffset
          if (pickedSkus.has(entry.sku.toUpperCase())) {
            completedBins.add(physicalBin)
          }
        }
      }
    } else {
      for (const order of chunk.orders) {
        const orderItems = getOrderItems(order.rawPayload)
        if (orderItems.every(item => pickedSkus.has(item.sku.toUpperCase()))) {
          completedBins.add(order.binNumber)
        }
      }
    }
  }

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

  const handleCompleteItem = useCallback(async () => {
    if (!chunk || !currentItem) return

    setPickedSkus(prev => new Set([...Array.from(prev), currentItem.sku]))

    if (currentItemIndex >= pickItems.length - 1) {
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
        timer.pause()
        setStep('complete')
      } catch (err) {
        console.error('Failed to complete chunk:', err)
      } finally {
        setLoading(false)
      }
    } else {
      setCurrentItemIndex(prev => prev + 1)
    }
  }, [chunk, currentItem, currentItemIndex, pickItems.length, timer])

  const handleOutOfStock = async () => {
    if (!chunk || !currentItem) return
    const affectedBinNumbers = currentItem.bins.map(b => b.binNumber)
    if (!confirm(`Mark "${currentItem.sku}" as out of stock? This will empty ${affectedBinNumbers.length} bin(s).`)) return

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
      if (!res.ok) throw new Error('Failed')

      setEmptyBins(prev => new Set([...Array.from(prev), ...affectedBinNumbers]))
      setPickedSkus(prev => new Set([...Array.from(prev), currentItem.sku]))

      if (currentItemIndex >= pickItems.length - 1) {
        const remaining = chunk.orders.filter(o => !emptyBins.has(o.binNumber) && !affectedBinNumbers.includes(o.binNumber))
        if (remaining.length === 0) {
          await fetch('/api/pick', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'complete-chunk', chunkId: chunk.id }),
          })
          timer.pause()
          setStep('complete')
        } else {
          setCurrentItemIndex(prev => prev + 1)
        }
      } else {
        setCurrentItemIndex(prev => prev + 1)
      }
    } catch {
      console.error('Failed to mark out of stock')
    } finally {
      setLoading(false)
    }
  }

  const handleCancelChunk = async () => {
    if (!chunk) return
    setCancelling(true)
    try {
      const res = await fetch('/api/pick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel-chunk', chunkId: chunk.id, reason: 'picker_cancelled' }),
      })
      if (!res.ok) throw new Error('Failed to cancel')

      setChunk(null)
      setPickItems([])
      setCurrentItemIndex(0)
      setPickedSkus(new Set())
      setEmptyBins(new Set())
      setShowCancelDialog(false)
      timer.reset()
      setStep('cart-select')
    } catch {
      alert('Failed to cancel. Try again.')
    } finally {
      setCancelling(false)
    }
  }

  const handleStartNewChunk = () => {
    setChunk(null)
    setPickItems([])
    setCurrentItemIndex(0)
    setPickedSkus(new Set())
    setEmptyBins(new Set())
    timer.reset()
    setPickingPersonalized(false)

    if (returnToCell) {
      setSelectedCell(returnToCell)
      setReturnToCell(null)
    }
    setStep('cart-select')
  }

  const handleReset = () => {
    if (isActivePick) { setShowCancelDialog(true); return }
    setSelectedCell(null)
    setSelectedCart(null)
    setChunk(null)
    setPickItems([])
    setCurrentItemIndex(0)
    setPickedSkus(new Set())
    setEmptyBins(new Set())
    setPickingPersonalized(false)
    setReturnToCell(null)
    timer.reset()
    setStep('cell-select')
  }

  const handleReleaseCart = async () => {
    if (!releaseCart) return
    setReleasing(true)
    try {
      const res = await fetch('/api/carts/release', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cartId: releaseCart.id, reason: 'admin_release' }),
      })
      if (!res.ok) throw new Error('Failed to release cart')
      setReleaseCart(null)
      const params = isAdmin ? '&includeActive=true' : ''
      const cartsRes = await fetch(`/api/pick?action=available-carts${params}`)
      const cartsData = await cartsRes.json()
      setCarts(cartsData.carts || [])
    } catch {
      alert('Failed to release cart. Try again.')
    } finally {
      setReleasing(false)
    }
  }

  // ============================================
  // RENDER: Login
  // ============================================
  if (step === 'login') {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <h1 className="text-5xl font-bold text-white mb-4 text-center">Pick Station</h1>
          <p className="text-xl text-gray-400 mb-10 text-center">Confirm to begin</p>
          <div className="bg-white rounded-2xl shadow-2xl p-8">
            <div className="w-full px-6 py-4 text-2xl border-2 border-gray-200 rounded-xl bg-gray-50 text-gray-700 font-medium mb-6">
              {pickerName || <span className="text-gray-400">Not logged in</span>}
            </div>
            <button
              onClick={handleLogin}
              disabled={!pickerName.trim()}
              className="w-full py-5 bg-blue-600 text-white text-2xl font-bold rounded-2xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ============================================
  // RENDER: Cell Selection
  // ============================================
  if (step === 'cell-select') {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center p-8">
        <div className="w-full max-w-2xl">
          <div className="text-center mb-2 text-blue-200">
            Logged in as <span className="font-bold text-white">{pickerName}</span>
            <button onClick={() => { setStep('login'); localStorage.removeItem('picker-name') }} className="ml-2 underline text-blue-300 hover:text-white">
              change
            </button>
          </div>
          <h1 className="text-5xl font-bold text-white mb-4 text-center">Pick Station</h1>
          <p className="text-xl text-blue-200 mb-12 text-center">Select your cell to begin</p>

          {cells.length === 0 ? (
            <div className="bg-white/20 backdrop-blur text-white p-8 rounded-2xl text-center">
              <p className="text-2xl font-medium">No active cells available</p>
              <p className="text-blue-200 mt-2">Contact admin to set up cells</p>
            </div>
          ) : (
            <>
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

              {/* Personalized quick-pick button */}
              <div className="mt-8">
                <button
                  onClick={handlePickPersonalized}
                  disabled={personalizedOrderCount === 0}
                  className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 disabled:cursor-not-allowed text-white rounded-2xl shadow-2xl p-6 text-center transition-all hover:scale-[1.02] active:scale-[0.98]"
                >
                  <div className="text-2xl font-bold">Pick Personalized Cart</div>
                  <div className="text-purple-200 text-lg mt-1">
                    {personalizedOrderCount > 0
                      ? `${personalizedOrderCount} orders waiting`
                      : 'No personalized orders'}
                  </div>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  // ============================================
  // RENDER: Cart Selection
  // ============================================
  if (step === 'cart-select') {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-green-600 to-green-800 flex items-center justify-center p-8">
        <div className="w-full max-w-3xl">
          <button onClick={handleReset} className="mb-6 text-white/80 hover:text-white flex items-center gap-2 text-lg">
            &larr; Back to cell selection
          </button>

          <h1 className="text-4xl font-bold text-white mb-2 text-center">
            {pickingPersonalized ? 'Personalized' : selectedCell?.name}
          </h1>
          <p className="text-xl text-green-200 mb-8 text-center">
            {pickingPersonalized ? `${personalizedOrderCount} personalized orders waiting` : `${availableOrderCount} orders waiting`}
          </p>

          <div className="bg-white rounded-2xl shadow-2xl p-8 mb-6">
            <label className="block text-lg font-medium text-gray-700 mb-3">Select Cart</label>
            {carts.filter(c => c.status === 'AVAILABLE').length === 0 && carts.filter(c => c.status === 'PICKING').length === 0 ? (
              <div className="text-amber-600 text-center py-8">
                <p className="text-xl font-medium">No carts available</p>
                <p className="text-gray-500 mt-1">All carts are in use</p>
              </div>
            ) : (
              <>
              <div className="grid grid-cols-3 gap-4">
                  {carts.filter(c => c.status === 'AVAILABLE').map((cart) => (
                  <button
                    key={cart.id}
                    onClick={() => setSelectedCart(cart)}
                      className={`p-6 rounded-xl text-center transition-all ${
                      selectedCart?.id === cart.id
                        ? 'border-green-500 bg-green-50'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                      style={{ borderWidth: '3px', borderStyle: 'solid', borderColor: selectedCart?.id === cart.id ? '#22c55e' : '#e5e7eb' }}
                  >
                    <div
                      className="w-12 h-12 rounded-full mx-auto mb-3"
                      style={{ backgroundColor: cart.color || '#9ca3af' }}
                    />
                    <div className="text-xl font-bold text-gray-900">{cart.name}</div>
                  </button>
                ))}
                </div>

                {/* PICKING carts — admin only */}
                {isAdmin && carts.filter(c => c.status === 'PICKING').length > 0 && (
                  <div className="mt-6 pt-6 border-t border-gray-200">
                    <label className="block text-sm font-medium text-red-600 mb-3 uppercase tracking-wide">Active Carts (Admin)</label>
                    <div className="grid grid-cols-3 gap-4">
                      {carts.filter(c => c.status === 'PICKING').map((cart) => {
                        const minutesAgo = cart.activeChunk?.claimedAt
                          ? Math.floor((Date.now() - new Date(cart.activeChunk.claimedAt).getTime()) / 60000)
                          : null
                        return (
                          <div
                            key={cart.id}
                            className="p-4 rounded-xl text-center border-red-300 bg-red-50"
                            style={{ borderWidth: '3px', borderStyle: 'solid' }}
                          >
                            <div
                              className="w-12 h-12 rounded-full mx-auto mb-2 opacity-60"
                              style={{ backgroundColor: cart.color || '#9ca3af' }}
                            />
                            <div className="text-lg font-bold text-gray-900">{cart.name}</div>
                            <div className="text-sm text-gray-500 mt-1">
                              {cart.activeChunk?.pickerName || 'Unknown'}
                            </div>
                            <div className="text-xs text-gray-400">
                              {minutesAgo !== null ? `${minutesAgo} min ago` : 'Unknown time'}
                              {cart.activeChunk?.ordersInChunk ? ` · ${cart.activeChunk.ordersInChunk} orders` : ''}
                            </div>
                            <button
                              onClick={() => setReleaseCart(cart)}
                              className="mt-3 w-full py-2 text-sm font-bold text-red-600 bg-white border-2 border-red-300 rounded-lg hover:bg-red-100 transition-colors"
                            >
                              Cancel Pick
                            </button>
                          </div>
                        )
                      })}
                    </div>
              </div>
                )}
              </>
            )}
          </div>

          {/* Release cart confirmation dialog */}
          {releaseCart && (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-8">
              <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-8">
                <h2 className="text-3xl font-bold text-gray-900 mb-4">Release Cart?</h2>
                <div className="bg-red-50 rounded-xl p-4 mb-6">
                  <p className="text-lg text-gray-800">
                    <span className="font-bold">{releaseCart.name}</span> is being picked by{' '}
                    <span className="font-bold">{releaseCart.activeChunk?.pickerName || 'Unknown'}</span>
                  </p>
                  {releaseCart.activeChunk?.claimedAt && (
                    <p className="text-sm text-gray-500 mt-1">
                      Started {Math.floor((Date.now() - new Date(releaseCart.activeChunk.claimedAt).getTime()) / 60000)} minutes ago
                      {releaseCart.activeChunk?.ordersInChunk ? ` · ${releaseCart.activeChunk.ordersInChunk} orders assigned` : ''}
                    </p>
                  )}
                </div>
                <p className="text-lg text-gray-600 mb-2">This will:</p>
                <ul className="text-gray-600 mb-6 space-y-1 ml-4">
                  <li>• Return all orders back to the queue</li>
                  <li>• Cancel the active pick session</li>
                  <li>• Make the cart available again</li>
                </ul>
                <p className="text-lg text-amber-600 font-medium mb-6">Make sure the physical cart is empty before releasing.</p>
                <div className="flex gap-4">
                  <button
                    onClick={() => setReleaseCart(null)}
                    disabled={releasing}
                    className="flex-1 py-4 bg-gray-100 text-gray-700 text-xl font-bold rounded-2xl hover:bg-gray-200 transition-colors"
                  >
                    Go Back
                  </button>
                  <button
                    onClick={handleReleaseCart}
                    disabled={releasing}
                    className="flex-1 py-4 bg-red-600 text-white text-xl font-bold rounded-2xl hover:bg-red-700 transition-colors disabled:opacity-50"
                  >
                    {releasing ? 'Releasing...' : 'Release Cart'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="mb-6 bg-red-100 text-red-700 p-4 rounded-xl text-center text-lg">{error}</div>
          )}

          <button
            onClick={handleStartPicking}
            disabled={loading || !selectedCart || carts.filter(c => c.status === 'AVAILABLE').length === 0}
            className="w-full py-6 bg-white text-green-700 text-3xl font-bold rounded-2xl hover:bg-green-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-xl"
          >
            {loading ? 'Starting...' : 'Start Picking →'}
          </button>

          {/* Personalized detour button */}
          {!pickingPersonalized && (
            <button
              onClick={handlePickPersonalized}
              disabled={personalizedOrderCount === 0}
              className="w-full mt-4 py-4 bg-purple-600 text-white text-xl font-bold rounded-2xl hover:bg-purple-700 disabled:bg-purple-400 disabled:cursor-not-allowed transition-colors shadow-lg"
            >
              Switch to Personalized Cart ({personalizedOrderCount} waiting)
            </button>
          )}
        </div>
      </div>
    )
  }

  // ============================================
  // RENDER: Picking
  // ============================================
  if (step === 'picking' && chunk && currentItem) {
    const activeBins = currentItem.bins.filter(b => !emptyBins.has(b.binNumber))
    const activeTotal = activeBins.reduce((sum, b) => sum + b.quantity, 0)
    const badge = getModeBadge(batchType, isPersonalized)

    return (
      <div className="fixed inset-0 bg-gray-100 flex flex-col">
        <SlideMenu
          isOpen={menuOpen}
          onClose={() => setMenuOpen(false)}
          pickerName={chunk.pickerName}
          cartName={chunk.cart.name}
          cellName={selectedCell?.name || ''}
          batchType={batchType}
          isPersonalized={isPersonalized}
          onCancelPick={() => setShowCancelDialog(true)}
        />

        {/* Cancel dialog */}
        {showCancelDialog && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-8">
            <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-8">
              <h2 className="text-3xl font-bold text-gray-900 mb-6">Cancel This Pick?</h2>
              <p className="text-xl text-gray-600 mb-4">Cart will be released and orders return to the queue.</p>
              <p className="text-xl text-amber-600 font-medium mb-8">Return items to shelves.</p>
              <div className="flex gap-4">
                <button
                  onClick={() => setShowCancelDialog(false)}
                  disabled={cancelling}
                  className="flex-1 py-5 bg-gray-100 text-gray-700 text-xl font-bold rounded-2xl"
                >
                  Keep Picking
                </button>
                <button
                  onClick={handleCancelChunk}
                  disabled={cancelling}
                  className="flex-1 py-5 bg-red-600 text-white text-xl font-bold rounded-2xl"
                >
                  {cancelling ? 'Cancelling...' : 'Cancel Pick'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Top header bar */}
        <div className="bg-white shadow-lg px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setMenuOpen(true)} className="p-2 hover:bg-gray-100 rounded-xl">
              <svg className="w-8 h-8 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
          </button>
            <span className={`px-2 py-1 rounded text-xs font-bold text-white ${badge.bg}`}>{badge.label}</span>
          </div>

          {/* Progress + Timer */}
          <div className="text-center">
            <div className="text-lg font-medium text-gray-700">
              {chunk.batch.name} &bull; {chunk.cart.name}
          </div>
            <div className="text-sm text-gray-500">
              Item {currentItemIndex + 1} of {pickItems.length}
              &nbsp;&bull;&nbsp;
              {completedBins.size}/{chunk.orders.length} bins
          </div>
        </div>

          {/* Timer */}
          <div className="flex items-center gap-2">
            <span className="font-mono text-xl text-gray-700">{formatTimer(timer.elapsed)}</span>
            <button
              onClick={timer.running ? timer.pause : timer.resume}
              className="px-2 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200"
            >
              {timer.running ? 'Pause' : 'Resume'}
            </button>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
          {/* Left: Cart */}
          <div className="lg:w-1/2 p-4 flex flex-col bg-gray-50">
            <div className="text-lg font-bold text-gray-500 mb-2 text-center">CART</div>
            <div className="flex-1 min-h-0">
              <CartVisualization
                totalBins={totalBins}
                highlightedBins={highlightedBins}
                completedBins={completedBins}
                emptyBins={emptyBins}
                binQuantities={binQuantities}
                pickingMode={batchType}
              />
            </div>
          </div>

          {/* Right: Pick instructions */}
          <div className="lg:w-1/2 p-4 flex flex-col">
            <div className="bg-white rounded-3xl shadow-xl p-6 flex-1 flex flex-col justify-center text-center">
              {/* Location */}
              <div className="text-xl font-medium text-blue-600 mb-1">GO TO LOCATION</div>
              <div className="text-8xl lg:text-9xl font-bold text-blue-700 mb-4">
                {currentItem.binLocation !== 'ZZZ' ? currentItem.binLocation : '—'}
              </div>

              <div className="border-t border-gray-200 my-4" />

              {/* SKU + Product info */}
              <div className="text-xl text-gray-500 mb-1">Pick item:</div>
              <div className="text-4xl font-bold text-gray-900 font-mono mb-1">{currentItem.sku}</div>
              <div className="text-xl text-gray-500 mb-2 truncate">{currentItem.name}</div>

              {/* Product size & color */}
              <div className="flex justify-center gap-4 mb-4">
                {currentItem.productSize !== 'N/A' && (
                  <span className="px-3 py-1 bg-gray-100 rounded-lg text-gray-700 font-medium">
                    {currentItem.productSize}
                  </span>
                )}
                {currentItem.productColor !== 'N/A' && (
                  <span className="px-3 py-1 bg-gray-100 rounded-lg text-gray-700 font-medium">
                    {currentItem.productColor}
                  </span>
                )}
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
                    <div key={bin.binNumber} className="bg-gray-100 rounded-xl px-5 py-3 text-center">
                      <div className="text-lg text-gray-500">Bin {bin.binNumber}</div>
                      <div className="text-2xl font-bold text-gray-700">&times;{bin.quantity}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="bg-white shadow-lg px-4 py-3 flex gap-4">
          <button
            onClick={handleOutOfStock}
            disabled={loading}
            className="flex-1 py-4 text-red-600 text-xl font-bold rounded-2xl hover:bg-red-50 transition-colors disabled:opacity-50"
            style={{ borderWidth: '3px', borderColor: '#fecaca', borderStyle: 'solid' }}
          >
            Out of Stock
          </button>
          <button
            onClick={handleCompleteItem}
            disabled={loading}
            className="flex-[2] py-4 bg-green-600 text-white text-2xl font-bold rounded-2xl hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            {loading ? 'Processing...' : currentItemIndex >= pickItems.length - 1 ? 'Complete Cart' : 'Continue →'}
          </button>
        </div>
      </div>
    )
  }

  // ============================================
  // RENDER: Complete
  // ============================================
  if (step === 'complete') {
    const completionMessage = isPersonalized
      ? 'Take cart to the ENGRAVING station'
      : 'Take cart to the SHIPPING station'

    const bgGradient = isPersonalized
      ? 'from-purple-500 to-purple-700'
      : 'from-green-500 to-green-700'

    return (
      <div className={`fixed inset-0 bg-gradient-to-br ${bgGradient} flex items-center justify-center p-8`}>
        <div className="text-center">
          <div className="text-9xl mb-8">{isPersonalized ? '&#9998;' : '&#10003;'}</div>
          <h1 className="text-5xl font-bold text-white mb-4">
            Cart Complete!
          </h1>
          <p className="text-2xl text-white/80 mb-2">
            Time: <span className="font-mono font-bold">{formatTimer(timer.elapsed)}</span>
          </p>
          <p className="text-2xl text-white/90 mb-12">
            {completionMessage}: <span className="font-bold">{chunk?.cart.name}</span>
          </p>

          {isPersonalized && (
            <div className="bg-white/20 backdrop-blur rounded-2xl p-6 mb-8 max-w-md mx-auto">
              <p className="text-xl text-white font-medium">
                This is a PERSONALIZED cart. Place it in the engraving staging zone.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-4 max-w-md mx-auto">
            <button
              onClick={handleStartNewChunk}
              className="py-6 bg-white text-gray-800 text-2xl font-bold rounded-2xl hover:bg-gray-50 transition-colors shadow-xl"
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
