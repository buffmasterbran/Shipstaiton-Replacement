'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import Barcode from 'react-barcode'
import { CartVisualization } from '../pick/CartVisualization'

// ============================================================================
// Types
// ============================================================================

interface EngravingOrder {
  id: string
  orderNumber: string
  binNumber: number | null
  rawPayload: any
}

interface EngravingChunk {
  id: string
  chunkNumber: number
  status: string
  isPersonalized: boolean
  batchId: string
  engraverName?: string | null
  engravingProgress?: EngravingProgress | null
  batch: { id: string; name: string; type: string }
  orders: EngravingOrder[]
}

interface EngravingCart {
  id: string
  name: string
  color: string | null
  status: string
  personalizedItemCount: number
  totalBins: number
  chunk: EngravingChunk | null
  chunks: EngravingChunk[]
}

interface EngravingProgress {
  completedItems: number[]
  currentIndex: number
  totalPausedMs: number
}

interface EngravingItem {
  orderNumber: string
  orderId: string
  binNumber: number
  sku: string
  name: string
  color: string
  quantity: number
  engravingText1: string
  engravingText2: string
  barcode: string
  mockupUrl: string
  isPersonalized: boolean
}

// ============================================================================
// Helpers
// ============================================================================

function extractEngravingItems(orders: EngravingOrder[]): EngravingItem[] {
  const items: EngravingItem[] = []

  for (const order of orders) {
    const payload = Array.isArray(order.rawPayload) ? order.rawPayload[0] : order.rawPayload
    const rawItems = payload?.items || []
    const bin = order.binNumber || 0

    for (const item of rawItems) {
      const sku = (item.sku || '').toUpperCase()
      const itemName = (item.name || '').toUpperCase()
      if (sku.includes('INSURANCE') || sku.includes('SHIPPING') || itemName.includes('INSURANCE')) continue

      const skuUpper = (item.sku || '').toUpperCase()
      // TEMPORARY FALLBACK: orders ingested before 2/19/2026 don't have custcol_customization_barcode.
      // Once all old orders are shipped, remove the SKU fallback and keep only the barcode check.
      const isPersonalized = !!item.custcol_customization_barcode || skuUpper.endsWith('-PERS')

      items.push({
        orderNumber: order.orderNumber,
        orderId: order.id,
        binNumber: bin,
        sku: item.sku || 'N/A',
        name: item.name || 'Unknown',
        color: item.color || item.custcol_color || '',
        quantity: item.quantity || 1,
        engravingText1: item.custcol_item_notes || '',
        engravingText2: item.custcol_item_notes_2 || '',
        barcode: item.custcol_customization_barcode || '',
        mockupUrl: item.custcol_custom_image_url || '',
        isPersonalized,
      })
    }
  }

  items.sort((a, b) => a.binNumber - b.binNumber)
  return items
}

function formatTimer(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

function getUniqueBins(items: EngravingItem[]): number[] {
  const bins = new Set<number>()
  for (const item of items) {
    if (item.isPersonalized) bins.add(item.binNumber)
  }
  return Array.from(bins).sort((a, b) => a - b)
}

// ============================================================================
// Main Page
// ============================================================================

export default function PersonalizationPage() {
  // Step state
  const [step, setStep] = useState<'login' | 'cart-select' | 'engraving' | 'complete'>('login')
  const [engraverName, setEngraverName] = useState('')

  // Cart select state
  const [carts, setCarts] = useState<EngravingCart[]>([])
  const [cartsLoading, setCartsLoading] = useState(false)

  // Engraving state
  const [activeCart, setActiveCart] = useState<EngravingCart | null>(null)
  const [activeChunkId, setActiveChunkId] = useState<string | null>(null)
  const [allItems, setAllItems] = useState<EngravingItem[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [completedItems, setCompletedItems] = useState<Set<number>>(new Set())
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [retryQueue, setRetryQueue] = useState<number[]>([])

  // Timer state
  const [timerSeconds, setTimerSeconds] = useState(0)
  const [timerRunning, setTimerRunning] = useState(false)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const [totalPausedMs, setTotalPausedMs] = useState(0)
  const pauseStartRef = useRef<number | null>(null)

  // Pause setting
  const [pauseEnabled, setPauseEnabled] = useState(false)
  const [isPaused, setIsPaused] = useState(false)

  // Derived data
  const personalizedItems = useMemo(() => allItems.filter(i => i.isPersonalized), [allItems])
  const bins = useMemo(() => getUniqueBins(allItems), [allItems])
  const currentItem = personalizedItems[currentIndex] || null
  const nextItem = personalizedItems[currentIndex + 1] || null
  const currentBinIndex = currentItem ? bins.indexOf(currentItem.binNumber) : 0
  const nonPersItemsInCurrentBin = useMemo(() => {
    if (!currentItem) return []
    return allItems.filter(i => !i.isPersonalized && i.binNumber === currentItem.binNumber)
  }, [allItems, currentItem])

  const allPersonalizedDone = personalizedItems.length > 0 && completedItems.size >= personalizedItems.length

  // Load name from logged-in user (same as picker/shipper)
  useEffect(() => {
    const name = localStorage.getItem('current-user-name') || ''
    if (name) {
      setEngraverName(name)
      setStep('cart-select')
    }
  }, [])

  // Warn before leaving during active engraving
  useEffect(() => {
    if (step !== 'engraving') return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [step])

  // Timer interval
  useEffect(() => {
    if (timerRunning && !isPaused) {
      timerRef.current = setInterval(() => setTimerSeconds(prev => prev + 1), 1000)
    } else if (timerRef.current) {
      clearInterval(timerRef.current)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [timerRunning, isPaused])

  // Fetch pause setting
  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(data => {
        const settings = data.settings || []
        const pauseSetting = settings.find((s: any) => s.key === 'engraving_pause_enabled')
        if (pauseSetting?.value?.enabled) setPauseEnabled(true)
      })
      .catch(() => {})
  }, [])

  // Retry failed saves
  useEffect(() => {
    if (retryQueue.length === 0) return
    const timeout = setTimeout(async () => {
      const toRetry = [...retryQueue]
      setRetryQueue([])
      for (const idx of toRetry) {
        try {
          await fetch('/api/pick', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'mark-engraved-item',
              chunkId: activeChunkId,
              itemIndex: idx,
              totalPausedMs,
            }),
          })
          setSaveError(null)
        } catch {
          setRetryQueue(prev => [...prev, idx])
        }
      }
    }, 5000)
    return () => clearTimeout(timeout)
  }, [retryQueue, activeChunkId, totalPausedMs])

  // ============================================
  // Handlers
  // ============================================

  const handleLogin = () => {
    if (!engraverName.trim()) return
    setStep('cart-select')
  }

  const fetchCarts = useCallback(async () => {
    setCartsLoading(true)
    try {
      const res = await fetch('/api/pick?action=engraving-queue')
      if (res.ok) {
        const data = await res.json()
        setCarts(data.carts || [])
      }
    } catch (err) {
      console.error('Failed to fetch engraving queue:', err)
    } finally {
      setCartsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (step === 'cart-select') fetchCarts()
  }, [step, fetchCarts])

  const handleCheckoutCart = async (cart: EngravingCart) => {
    try {
      const chunk = cart.chunk || cart.chunks?.[0]
      if (!chunk) return

      // Check if resuming an existing session
      const progress = chunk.engravingProgress as EngravingProgress | null
      if (progress && chunk.engraverName) {
        // Resuming: restore state from server
        setActiveCart(cart)
        setActiveChunkId(chunk.id)
        const items = extractEngravingItems(chunk.orders)
        setAllItems(items)
        const persItems = items.filter(i => i.isPersonalized)
        const completed = new Set<number>(progress.completedItems || [])
        setCompletedItems(completed)
        setCurrentIndex(progress.currentIndex < persItems.length ? progress.currentIndex : Math.max(0, persItems.length - 1))
        setTotalPausedMs(progress.totalPausedMs || 0)
        setTimerSeconds(0)
        setTimerRunning(true)
        setStep('engraving')
        return
      }

      // New session: claim the cart
      const res = await fetch('/api/pick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start-engraving',
          cartId: cart.id,
          engraverName: engraverName.trim(),
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        alert(err.error || 'Failed to check out cart')
        return
      }

      const data = await res.json()
      const returnedCart = data.cart
      const returnedChunk = returnedCart?.chunks?.[0]
      if (!returnedChunk) return

      setActiveCart(cart)
      setActiveChunkId(returnedChunk.id)
      const items = extractEngravingItems(returnedChunk.orders)
      setAllItems(items)
      setCompletedItems(new Set())
      setCurrentIndex(0)
      setTotalPausedMs(0)
      setTimerSeconds(0)
      setTimerRunning(true)
      setStep('engraving')
    } catch (err) {
      console.error('Failed to checkout cart:', err)
      alert('Failed to check out cart')
    }
  }

  const handleCancelCheckout = async () => {
    if (!activeChunkId || completedItems.size > 0) return
    try {
      await fetch('/api/pick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel-engraving', chunkId: activeChunkId }),
      })
    } catch {}
    resetEngravingState()
    setStep('cart-select')
  }

  const handleMarkDone = async () => {
    if (!activeChunkId || !currentItem || completedItems.has(currentIndex)) return
    setSaving(true)
    setSaveError(null)

    // Optimistic local update
    const newCompleted = new Set(completedItems)
    newCompleted.add(currentIndex)
    setCompletedItems(newCompleted)

    // Check if all personalized items in this order are now done
    const orderItems = personalizedItems
      .map((item, idx) => ({ item, idx }))
      .filter(({ item }) => item.orderNumber === currentItem.orderNumber)
    const allOrderItemsDone = orderItems.every(({ idx }) => newCompleted.has(idx))

    // Advance to next incomplete item
    let nextIdx = currentIndex + 1
    while (nextIdx < personalizedItems.length && newCompleted.has(nextIdx)) {
      nextIdx++
    }
    if (nextIdx < personalizedItems.length) {
      setCurrentIndex(nextIdx)
    }

    // Persist to server
    try {
      const res = await fetch('/api/pick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'mark-engraved-item',
          chunkId: activeChunkId,
          itemIndex: currentIndex,
          totalPausedMs,
        }),
      })
      if (!res.ok) throw new Error('Save failed')

      // If all items in order are done, mark order as engraved
      if (allOrderItemsDone) {
        await fetch('/api/pick', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'mark-engraved',
            chunkId: activeChunkId,
            orderNumber: currentItem.orderNumber,
          }),
        })
      }
    } catch {
      setSaveError('Failed to save — retrying...')
      setRetryQueue(prev => [...prev, currentIndex])
    } finally {
      setSaving(false)
    }
  }

  const handlePrev = () => {
    if (currentIndex > 0) setCurrentIndex(currentIndex - 1)
  }

  const handlePause = () => {
    setIsPaused(true)
    pauseStartRef.current = Date.now()
  }

  const handleResume = () => {
    if (pauseStartRef.current) {
      setTotalPausedMs(prev => prev + (Date.now() - pauseStartRef.current!))
      pauseStartRef.current = null
    }
    setIsPaused(false)
  }

  const handleComplete = async () => {
    if (!activeChunkId || !allPersonalizedDone) return
    setTimerRunning(false)

    const activeDuration = timerSeconds
    const pausedSeconds = Math.round(totalPausedMs / 1000)

    try {
      await fetch('/api/pick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'complete-engraving',
          chunkId: activeChunkId,
          engravingDurationSeconds: activeDuration,
          engravingPausedSeconds: pausedSeconds,
          itemsEngraved: personalizedItems.length,
        }),
      })
    } catch (err) {
      console.error('Failed to complete engraving:', err)
    }

    setStep('complete')
  }

  const resetEngravingState = () => {
    setActiveCart(null)
    setActiveChunkId(null)
    setAllItems([])
    setCurrentIndex(0)
    setCompletedItems(new Set())
    setTimerSeconds(0)
    setTimerRunning(false)
    setTotalPausedMs(0)
    setIsPaused(false)
    setSaveError(null)
    setRetryQueue([])
  }

  // ============================================
  // RENDER: Login (fallback if no user name found)
  // ============================================
  if (step === 'login') {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-purple-600 to-purple-800 flex items-center justify-center p-8">
        <div className="w-full max-w-md text-center">
          <h1 className="text-5xl font-bold text-white mb-4">Engraving Station</h1>
          <p className="text-xl text-purple-200 mb-10">
            No user logged in. Please log in from the main app first.
          </p>
        </div>
      </div>
    )
  }

  // ============================================
  // RENDER: Cart Select
  // ============================================
  if (step === 'cart-select') {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-purple-600 to-purple-800 flex items-center justify-center p-8">
        <div className="w-full max-w-2xl">
          <div className="text-center mb-2 text-purple-200">
            Logged in as <span className="font-bold text-white">{engraverName}</span>
          </div>
          <h1 className="text-5xl font-bold text-white mb-4 text-center">Engraving Station</h1>
          <p className="text-xl text-purple-200 mb-10 text-center">Select a cart to engrave</p>

          {cartsLoading ? (
            <div className="bg-white/20 backdrop-blur text-white p-8 rounded-2xl text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-3" />
              <p className="text-xl">Loading queue...</p>
            </div>
          ) : carts.length === 0 ? (
            <div className="bg-white/20 backdrop-blur text-white p-8 rounded-2xl text-center">
              <p className="text-3xl font-medium mb-2">No Carts Waiting</p>
              <p className="text-purple-200 text-lg">All caught up! Check back soon.</p>
              <button
                onClick={fetchCarts}
                className="mt-6 px-8 py-3 bg-white/20 hover:bg-white/30 text-white text-lg font-bold rounded-xl transition-colors"
              >
                Refresh
              </button>
            </div>
          ) : (
            <>
              <div className="space-y-5">
                {carts.map((cart) => {
                  const chunk = cart.chunk || cart.chunks?.[0]
                  const isResumable = !!(chunk?.engraverName && chunk?.engravingProgress)
                  return (
                    <button
                      key={cart.id}
                      onClick={() => handleCheckoutCart(cart)}
                      className={`w-full rounded-2xl shadow-2xl p-6 text-left transition-all hover:scale-[1.02] active:scale-[0.98] ${
                        isResumable ? 'bg-amber-50 ring-2 ring-amber-400' : 'bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            {cart.color && (
                              <div className="w-5 h-5 rounded-full flex-shrink-0" style={{ backgroundColor: cart.color }} />
                            )}
                            <span className="font-bold text-3xl text-gray-900">{cart.name}</span>
                          </div>
                          <div className="text-gray-500 text-lg">
                            {chunk?.batch?.name && <span>{chunk.batch.name} &bull; </span>}
                            {cart.totalBins} bins
                          </div>
                          {isResumable && (
                            <div className="text-amber-600 font-bold mt-1">
                              In progress &mdash; tap to resume
                            </div>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0 ml-4">
                          <div className="text-5xl font-bold text-purple-600">{cart.personalizedItemCount}</div>
                          <div className="text-sm font-medium text-purple-500 uppercase tracking-wide">items</div>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
              <div className="text-center mt-6">
                <button
                  onClick={fetchCarts}
                  className="px-6 py-3 bg-white/20 hover:bg-white/30 text-white text-lg font-bold rounded-xl transition-colors"
                >
                  Refresh
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  // ============================================
  // RENDER: Engraving
  // ============================================
  if (step === 'engraving' && activeCart) {
    const isViewingCompleted = currentItem && completedItems.has(currentIndex)

    // Build bin sets for CartVisualization
    const totalBins = 12
    const highlightedBins = new Set<number>()
    const completedBinSet = new Set<number>()
    const emptyBins = new Set<number>()

    // Track which bins have personalized items and which are fully done
    const binsWithItems = new Set<number>()
    for (const item of personalizedItems) {
      binsWithItems.add(item.binNumber)
    }
    for (let b = 1; b <= totalBins; b++) {
      if (!binsWithItems.has(b)) {
        // Bin has no personalized items — check if it has any items at all
        const hasAnyItem = allItems.some(i => i.binNumber === b)
        if (!hasAnyItem) emptyBins.add(b)
      }
    }

    // Mark completed bins (all personalized items in that bin are done)
    for (const binNum of Array.from(binsWithItems)) {
      const binItemIndices = personalizedItems
        .map((item, idx) => ({ item, idx }))
        .filter(({ item }) => item.binNumber === binNum)
      if (binItemIndices.every(({ idx }) => completedItems.has(idx))) {
        completedBinSet.add(binNum)
      }
    }

    // Highlight current bin
    if (currentItem) {
      highlightedBins.add(currentItem.binNumber)
    }

    // Items in current bin for the right panel
    const currentBinItems = currentItem
      ? personalizedItems
          .map((item, idx) => ({ item, idx }))
          .filter(({ item }) => item.binNumber === currentItem.binNumber)
      : []
    const currentBinItemIndex = currentBinItems.findIndex(({ idx }) => idx === currentIndex)

    return (
      <div className="fixed inset-0 bg-gray-100 flex flex-col">
        {/* Save error banner */}
        {saveError && (
          <div className="bg-amber-500 text-white text-center py-2 text-sm font-medium">
            {saveError}
          </div>
        )}

        {/* Pause overlay */}
        {isPaused && (
          <div className="absolute inset-0 z-50 bg-gray-900/80 flex items-center justify-center">
            <div className="text-center">
              <div className="text-6xl font-bold text-white mb-4">Paused</div>
              <p className="text-xl text-gray-300 mb-8">Timer is stopped</p>
              <button
                onClick={handleResume}
                className="px-12 py-5 bg-purple-600 text-white text-2xl font-bold rounded-2xl hover:bg-purple-700 transition-colors"
              >
                Resume
              </button>
            </div>
          </div>
        )}

        {/* Top header bar */}
        <div className="bg-white shadow-lg px-4 py-2 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            {activeCart.color && (
              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: activeCart.color }} />
            )}
            <span className="px-2 py-1 rounded text-xs font-bold bg-purple-600 text-white">PERSONALIZED</span>
            {completedItems.size === 0 && (
              <button
                onClick={handleCancelCheckout}
                className="px-3 py-1.5 text-sm text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              >
                Release
              </button>
            )}
          </div>

          <div className="text-center">
            <div className="text-lg font-medium text-gray-700">
              {activeCart.name}
            </div>
            <div className="text-sm text-gray-500">
              {completedItems.size}/{personalizedItems.length} items
              &nbsp;&bull;&nbsp;
              Bin {currentBinIndex + 1} of {bins.length}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="font-mono text-xl text-gray-700 tabular-nums">{formatTimer(timerSeconds)}</span>
            {pauseEnabled && !isPaused && (
              <button
                onClick={handlePause}
                className="px-2 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200"
              >
                Pause
              </button>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 bg-gray-200 flex-shrink-0">
          <div
            className="h-full bg-purple-600 transition-all duration-300"
            style={{ width: `${personalizedItems.length > 0 ? (completedItems.size / personalizedItems.length) * 100 : 0}%` }}
          />
        </div>

        {/* Main content: cart grid left, engraving info right */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
          {/* Left: Cart visualization */}
          <div className="lg:w-1/2 p-4 flex flex-col bg-gray-50">
            <div className="text-lg font-bold text-gray-500 mb-2 text-center">CART</div>
            <div className="flex-1 min-h-0">
              <CartVisualization
                totalBins={totalBins}
                highlightedBins={highlightedBins}
                completedBins={completedBinSet}
                emptyBins={emptyBins}
              />
            </div>
          </div>

          {/* Right: Engraving info */}
          <div className="lg:w-1/2 p-4 flex flex-col overflow-y-auto">
            {currentItem ? (
              <div className="bg-white rounded-3xl shadow-xl p-6 flex-1 flex flex-col">
                {/* Bin + quantity indicator */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="bg-purple-100 text-purple-700 text-lg font-bold px-4 py-1 rounded-full">
                      Bin {currentItem.binNumber}
                    </span>
                    {isViewingCompleted && (
                      <span className="text-green-600 font-bold flex items-center gap-1">
                        <span>&#10003;</span> Done
                      </span>
                    )}
                  </div>
                  {currentItem.quantity > 1 && (
                    <div className="bg-amber-100 border-2 border-amber-400 rounded-xl px-4 py-2 text-center">
                      <div className="text-3xl font-bold text-amber-700">{currentItem.quantity}x</div>
                      <div className="text-xs font-medium text-amber-600 uppercase">same item</div>
                    </div>
                  )}
                </div>

                {/* Two-column: engraving details (left) + mockup image (right) */}
                <div className="flex gap-4 mb-4 flex-1 min-h-0">
                  {/* Left: Engraving text + product info */}
                  <div className="flex-1 flex flex-col">
                    <div className="bg-purple-50 rounded-2xl p-5 mb-3 flex-1 flex flex-col justify-center">
                      {currentItem.engravingText1 ? (
                        <div className="text-sm font-medium text-purple-500 uppercase tracking-wide text-center">
                          {currentItem.engravingText1}
                        </div>
                      ) : (
                        <div className="text-lg text-gray-400 italic text-center">No engraving text</div>
                      )}
                      {currentItem.engravingText2 && (
                        <div className="text-5xl font-bold text-gray-900 mt-1 leading-tight break-words text-center">
                          {currentItem.engravingText2}
                        </div>
                      )}
                    </div>
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-2 mb-1">
                        <span className="font-mono text-xl text-gray-700">{currentItem.sku}</span>
                      </div>
                      <div className="text-lg text-gray-500 truncate">{currentItem.name}</div>
                      {currentItem.color && <div className="text-gray-400">{currentItem.color}</div>}
                      <div className="text-sm text-gray-400 mt-1">{currentItem.orderNumber}</div>
                    </div>
                  </div>

                  {/* Right: Mockup image */}
                  {currentItem.mockupUrl && (
                    <div className="w-2/5 flex-shrink-0 flex items-center justify-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={currentItem.mockupUrl}
                        alt="Mockup"
                        className="max-h-full w-auto rounded-xl border border-gray-200 object-contain"
                      />
                    </div>
                  )}
                </div>

                {/* Barcode */}
                {currentItem.barcode && (
                  <div className="mt-auto pt-4 flex flex-col items-center">
                    <div className="bg-white p-3 rounded-lg border">
                      <Barcode
                        value={currentItem.barcode}
                        format="CODE128"
                        width={2.5}
                        height={70}
                        fontSize={16}
                        margin={8}
                        displayValue={true}
                      />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-400 text-xl">
                No items to engrave
              </div>
            )}
          </div>
        </div>

        {/* Bottom bar — aligned with the two-panel layout above */}
        <div className="bg-white shadow-lg flex flex-shrink-0">
          {/* Left half: Prev — aligned under cart grid */}
          <div className="lg:w-1/2 p-3 flex">
            <button
              onClick={handlePrev}
              disabled={currentIndex === 0}
              className="w-full py-4 text-xl font-bold text-gray-600 bg-gray-100 rounded-2xl hover:bg-gray-200 disabled:opacity-30 transition-colors"
            >
              &larr; Prev
            </button>
          </div>
          {/* Right half: Done/Next — aligned under engraving details */}
          <div className="lg:w-1/2 p-3 flex">
            {(() => {
              if (allPersonalizedDone) {
                return (
                  <button
                    onClick={handleComplete}
                    className="w-full py-4 bg-green-600 text-white text-2xl font-bold rounded-2xl hover:bg-green-700 transition-colors"
                  >
                    Complete Cart &rarr; Shipping
                  </button>
                )
              }
              if (isViewingCompleted) {
                const nextIncomplete = (() => {
                  let n = currentIndex + 1
                  while (n < personalizedItems.length && completedItems.has(n)) n++
                  return n < personalizedItems.length ? personalizedItems[n] : null
                })()
                const nextBinLabel = nextIncomplete
                  ? `Next Item in Bin ${nextIncomplete.binNumber}`
                  : 'Next Item'
                return (
                  <button
                    onClick={() => {
                      let n = currentIndex + 1
                      while (n < personalizedItems.length && completedItems.has(n)) n++
                      if (n < personalizedItems.length) setCurrentIndex(n)
                    }}
                    className="w-full py-4 bg-gray-600 text-white text-2xl font-bold rounded-2xl hover:bg-gray-700 transition-colors"
                  >
                    {nextBinLabel} &rarr;
                  </button>
                )
              }

              const nextAfterDone = (() => {
                const newCompleted = new Set(completedItems)
                newCompleted.add(currentIndex)
                let n = currentIndex + 1
                while (n < personalizedItems.length && newCompleted.has(n)) n++
                return n < personalizedItems.length ? personalizedItems[n] : null
              })()
              const isLastPersonalized = !nextAfterDone
              const nextIsSameBin = nextAfterDone && nextAfterDone.binNumber === currentItem?.binNumber
              let buttonLabel = 'Next Item'
              if (saving) {
                buttonLabel = 'Saving...'
              } else if (isLastPersonalized) {
                buttonLabel = 'Last Item \u2192'
              } else if (nextIsSameBin) {
                buttonLabel = `Next Item in Bin ${currentItem?.binNumber} \u2192`
              } else if (nextAfterDone) {
                buttonLabel = `Next Item in Bin ${nextAfterDone.binNumber} \u2192`
              }

              return (
                <button
                  onClick={handleMarkDone}
                  disabled={saving || !currentItem}
                  className="w-full py-4 bg-purple-600 text-white text-2xl font-bold rounded-2xl hover:bg-purple-700 disabled:opacity-50 transition-colors"
                >
                  {buttonLabel}
                </button>
              )
            })()}
          </div>
        </div>
      </div>
    )
  }

  // ============================================
  // RENDER: Complete
  // ============================================
  if (step === 'complete') {
    const avgPerItem = personalizedItems.length > 0
      ? Math.round(timerSeconds / personalizedItems.length)
      : 0
    const pausedSec = Math.round(totalPausedMs / 1000)

    return (
      <div className="fixed inset-0 bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center p-8">
        <div className="text-center max-w-lg">
          <div className="text-9xl mb-6">&#10003;</div>
          <h1 className="text-5xl font-bold text-white mb-4">Engraving Complete!</h1>
          <p className="text-2xl text-purple-100 mb-8">
            Cart <span className="font-bold">{activeCart?.name}</span> is ready for shipping
          </p>

          {/* Performance summary */}
          <div className="bg-white/10 backdrop-blur rounded-2xl p-6 mb-8 text-left">
            <div className="grid grid-cols-2 gap-4 text-purple-100">
              <div>
                <div className="text-sm opacity-70">Items Engraved</div>
                <div className="text-3xl font-bold text-white">{personalizedItems.length}</div>
              </div>
              <div>
                <div className="text-sm opacity-70">Bins</div>
                <div className="text-3xl font-bold text-white">{bins.length}</div>
              </div>
              <div>
                <div className="text-sm opacity-70">Active Time</div>
                <div className="text-3xl font-bold text-white">{formatTimer(timerSeconds)}</div>
              </div>
              <div>
                <div className="text-sm opacity-70">Avg per Item</div>
                <div className="text-3xl font-bold text-white">{formatTimer(avgPerItem)}</div>
              </div>
            </div>
            {pausedSec > 0 && (
              <div className="text-sm text-purple-200 mt-3 text-center opacity-70">
                Includes {formatTimer(pausedSec)} pause time (not counted in active time)
              </div>
            )}
          </div>

          <button
            onClick={() => { resetEngravingState(); setStep('cart-select') }}
            className="py-6 px-12 bg-white text-purple-700 text-2xl font-bold rounded-2xl hover:bg-purple-50 shadow-xl transition-colors"
          >
            Back to Queue
          </button>
        </div>
      </div>
    )
  }

  return null
}

// ============================================================================
// Item Card Component
// ============================================================================

function ItemCard({ item, isCompleted, isCurrent }: { item: EngravingItem; isCompleted: boolean; isCurrent: boolean }) {
  return (
    <div className={`flex-1 flex flex-col rounded-2xl border-2 p-5 transition-all ${
      isCompleted
        ? 'border-green-400 bg-green-50'
        : isCurrent
          ? 'border-purple-300 bg-white shadow-lg'
          : 'border-gray-200 bg-white'
    }`}>
      {/* Completed overlay */}
      {isCompleted && (
        <div className="text-green-600 text-sm font-bold mb-2 flex items-center gap-1">
          <span>&#10003;</span> Done
        </div>
      )}

      {/* Engraving text */}
      <div className="mb-4">
        {item.engravingText1 && (
          <div className={`font-bold leading-tight break-words ${isCurrent ? 'text-3xl' : 'text-2xl'} text-gray-900`}>
            {item.engravingText1}
          </div>
        )}
        {item.engravingText2 && (
          <div className={`font-semibold text-gray-700 mt-1 ${isCurrent ? 'text-2xl' : 'text-xl'}`}>
            {item.engravingText2}
          </div>
        )}
        {!item.engravingText1 && !item.engravingText2 && (
          <div className="text-xl text-gray-400 italic">No engraving text</div>
        )}
      </div>

      {/* Product info */}
      <div className="mb-4 space-y-1">
        <div className="flex items-center gap-2">
          {item.quantity > 1 && (
            <span className="bg-purple-100 text-purple-700 text-sm font-bold px-2 py-0.5 rounded">
              {item.quantity}x
            </span>
          )}
          <span className="font-mono text-sm text-gray-600">{item.sku}</span>
        </div>
        <div className="text-sm text-gray-500 truncate">{item.name}</div>
        {item.color && <div className="text-sm text-gray-400">{item.color}</div>}
      </div>

      {/* Barcode */}
      {item.barcode && (
        <div className="mt-auto pt-3 flex flex-col items-center">
          <div className="bg-white p-3 rounded-lg">
            <Barcode
              value={item.barcode}
              format="CODE128"
              width={2.5}
              height={70}
              fontSize={16}
              margin={8}
              displayValue={true}
            />
          </div>
        </div>
      )}

      {/* Bin badge */}
      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-gray-400">{item.orderNumber}</span>
        <span className="bg-blue-100 text-blue-700 text-sm font-bold px-2.5 py-0.5 rounded">
          Bin {item.binNumber}
        </span>
      </div>
    </div>
  )
}
