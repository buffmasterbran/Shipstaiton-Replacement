'use client'

import { useState, useEffect, useCallback } from 'react'

// ============================================================================
// Types
// ============================================================================

interface EngravingOrder {
  id: string
  orderNumber: string
  binNumber: number
  rawPayload: any
}

interface EngravingChunk {
  id: string
  chunkNumber: number
  status: string
  isPersonalized: boolean
  cartId: string
  batchId: string
  batch: {
    id: string
    name: string
    type: string
  }
  cart: {
    id: string
    name: string
    color: string | null
  }
  orders: EngravingOrder[]
}

// ============================================================================
// Helpers
// ============================================================================

function getEngravingText(rawPayload: any): string {
  const order = Array.isArray(rawPayload) ? rawPayload[0] : rawPayload
  // Look for engraving text in multiple possible fields
  if (order?.engravingText) return order.engravingText
  if (order?.customization?.text) return order.customization.text
  if (order?.personalization?.text) return order.personalization.text

  // Check item-level
  const items = order?.items || []
  for (const item of items) {
    if (item.engravingText) return item.engravingText
    if (item.customization?.text) return item.customization.text
    if (item.personalization?.text) return item.personalization.text
    // Check options
    if (item.options) {
      for (const opt of item.options) {
        if (/engrav|personal|custom/i.test(opt.name || '')) return opt.value || ''
      }
    }
  }

  return 'No engraving text found'
}

function getOrderItemSummary(rawPayload: any): string {
  const order = Array.isArray(rawPayload) ? rawPayload[0] : rawPayload
  const items = order?.items || []
  return items
    .filter((i: any) => {
      const sku = (i.sku || '').toUpperCase()
      return !sku.includes('INSURANCE') && !sku.includes('SHIPPING')
    })
    .map((i: any) => `${i.quantity || 1}x ${i.sku || 'N/A'}`)
    .join(', ')
}

// ============================================================================
// Main Page
// ============================================================================

export default function PersonalizationPage() {
  const [chunks, setChunks] = useState<EngravingChunk[]>([])
  const [loading, setLoading] = useState(true)
  const [activeChunk, setActiveChunk] = useState<EngravingChunk | null>(null)
  const [currentOrderIndex, setCurrentOrderIndex] = useState(0)
  const [engravedOrders, setEngravedOrders] = useState<Set<string>>(new Set())
  const [engraverName, setEngraverName] = useState('')
  const [step, setStep] = useState<'login' | 'queue' | 'engraving' | 'complete'>('login')

  // Load saved name
  useEffect(() => {
    const saved = localStorage.getItem('engraver-name')
    if (saved) { setEngraverName(saved); setStep('queue') }
  }, [])

  // Fetch chunks awaiting engraving
  const fetchChunks = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/pick?action=engraving-queue')
      if (res.ok) {
        const data = await res.json()
        setChunks(data.chunks || [])
      }
    } catch (err) {
      console.error('Failed to fetch engraving queue:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (step === 'queue') fetchChunks()
  }, [step, fetchChunks])

  const handleLogin = () => {
    if (!engraverName.trim()) return
    localStorage.setItem('engraver-name', engraverName.trim())
    setStep('queue')
  }

  const handleStartEngraving = (chunk: EngravingChunk) => {
    setActiveChunk(chunk)
    setCurrentOrderIndex(0)
    setEngravedOrders(new Set())
    setStep('engraving')
  }

  const handleMarkEngraved = async () => {
    if (!activeChunk) return
    const order = activeChunk.orders[currentOrderIndex]
    if (!order) return

    try {
      await fetch('/api/pick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'mark-engraved',
          chunkId: activeChunk.id,
          orderNumber: order.orderNumber,
        }),
      })

      setEngravedOrders(prev => new Set([...Array.from(prev), order.orderNumber]))

      if (currentOrderIndex >= activeChunk.orders.length - 1) {
        // All done
        await fetch('/api/pick', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'complete-engraving',
            chunkId: activeChunk.id,
          }),
        })
        setStep('complete')
      } else {
        setCurrentOrderIndex(prev => prev + 1)
      }
    } catch (err) {
      console.error('Failed to mark engraved:', err)
    }
  }

  // ============================================
  // RENDER: Login
  // ============================================
  if (step === 'login') {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-purple-600 to-purple-800 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <h1 className="text-5xl font-bold text-white mb-4 text-center">Engraving Station</h1>
          <p className="text-xl text-purple-200 mb-10 text-center">Enter your name to begin</p>
          <div className="bg-white rounded-2xl shadow-2xl p-8">
            <input
              type="text"
              value={engraverName}
              onChange={(e) => setEngraverName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              placeholder="Your name"
              autoFocus
              className="w-full px-6 py-4 text-2xl border-2 border-gray-300 rounded-xl focus:border-purple-500 focus:outline-none mb-6"
            />
            <button
              onClick={handleLogin}
              disabled={!engraverName.trim()}
              className="w-full py-5 bg-purple-600 text-white text-2xl font-bold rounded-2xl hover:bg-purple-700 disabled:opacity-50"
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ============================================
  // RENDER: Queue
  // ============================================
  if (step === 'queue') {
    return (
      <div className="min-h-screen bg-gray-100 p-4">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Engraving Queue</h1>
              <p className="text-gray-500">Logged in as {engraverName}</p>
            </div>
            <button onClick={fetchChunks} className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg">
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600" />
              <span className="ml-3 text-gray-600">Loading...</span>
            </div>
          ) : chunks.length === 0 ? (
            <div className="bg-white rounded-xl p-8 text-center shadow">
              <div className="text-5xl mb-4">&#9998;</div>
              <h2 className="text-2xl font-bold text-gray-700 mb-2">No Carts Waiting</h2>
              <p className="text-gray-500">All caught up! Check back soon.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {chunks.map((chunk) => (
                <div key={chunk.id} className="bg-white rounded-xl p-6 shadow">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-lg text-gray-900">{chunk.cart.name}</span>
                        <span className="px-2 py-0.5 rounded text-xs font-bold bg-purple-100 text-purple-700">
                          Personalized
                        </span>
                      </div>
                      <div className="text-sm text-gray-500">
                        Batch: {chunk.batch.name} &bull; {chunk.orders.length} orders
                      </div>
                    </div>
                    <button
                      onClick={() => handleStartEngraving(chunk)}
                      className="px-6 py-3 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-700"
                    >
                      Start Engraving
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ============================================
  // RENDER: Engraving
  // ============================================
  if (step === 'engraving' && activeChunk) {
    const order = activeChunk.orders[currentOrderIndex]
    if (!order) return null

    const engravingText = getEngravingText(order.rawPayload)
    const itemSummary = getOrderItemSummary(order.rawPayload)

    return (
      <div className="fixed inset-0 bg-gray-100 flex flex-col">
        {/* Header */}
        <div className="bg-white shadow px-4 py-3 flex items-center justify-between">
          <div>
            <div className="font-bold text-lg">{activeChunk.cart.name}</div>
            <div className="text-sm text-gray-500">{activeChunk.batch.name}</div>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold">{currentOrderIndex + 1} / {activeChunk.orders.length}</div>
            <div className="text-sm text-gray-500">Bin {order.binNumber}</div>
          </div>
        </div>

        {/* Main */}
        <div className="flex-1 flex flex-col items-center justify-center p-8">
          <div className="bg-white rounded-3xl shadow-xl p-8 max-w-2xl w-full text-center">
            <div className="text-sm text-gray-500 mb-1">Order #{order.orderNumber}</div>
            <div className="text-sm text-gray-500 mb-4">{itemSummary}</div>

            <div className="text-lg text-purple-600 font-medium mb-2">ENGRAVE:</div>
            <div className="text-5xl font-bold text-gray-900 mb-8 font-serif leading-tight break-words">
              {engravingText}
            </div>

            <div className="bg-gray-50 rounded-xl p-4">
              <div className="text-sm text-gray-500">Place in Bin</div>
              <div className="text-4xl font-bold text-blue-600">{order.binNumber}</div>
            </div>
          </div>
        </div>

        {/* Bottom */}
        <div className="bg-white shadow-lg p-4">
          <button
            onClick={handleMarkEngraved}
            className="w-full py-5 bg-purple-600 text-white text-2xl font-bold rounded-2xl hover:bg-purple-700"
          >
            {currentOrderIndex >= activeChunk.orders.length - 1 ? 'Complete Cart' : 'Done — Next →'}
          </button>
        </div>
      </div>
    )
  }

  // ============================================
  // RENDER: Complete
  // ============================================
  if (step === 'complete') {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center p-8">
        <div className="text-center">
          <div className="text-9xl mb-8">&#10003;</div>
          <h1 className="text-5xl font-bold text-white mb-4">Engraving Complete!</h1>
          <p className="text-2xl text-purple-100 mb-12">
            Cart <span className="font-bold">{activeChunk?.cart.name}</span> is ready for shipping
          </p>
          <button
            onClick={() => { setActiveChunk(null); setStep('queue') }}
            className="py-6 px-12 bg-white text-purple-700 text-2xl font-bold rounded-2xl hover:bg-purple-50 shadow-xl"
          >
            Back to Queue
          </button>
        </div>
      </div>
    )
  }

  return null
}
