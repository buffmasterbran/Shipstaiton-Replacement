'use client'

import { useState, useEffect, Fragment } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { useReferenceData } from '@/lib/use-reference-data'

interface Product {
  id: string
  name: string
  volume: number
  category: string
}

interface Box {
  id: string
  name: string
  volume: number
  priority: number
  active: boolean
}

interface OrderItem {
  sku: string
  name: string
  quantity: number
}

interface BoxConfirmDialogProps {
  isOpen: boolean
  onClose: () => void
  orderNumber: string
  items: OrderItem[]
  currentBoxName: string | null
  currentConfidence: 'confirmed' | 'calculated' | 'unknown'
  onFeedbackSaved: () => void
}

interface TestResult {
  box: { id: string; name: string; volume: number } | null
  confidence: 'confirmed' | 'calculated' | 'unknown'
  fitRatio?: number
  orderVolume?: number
  usableVolume?: number
  comboSignature: string
}

export default function BoxConfirmDialog({
  isOpen,
  onClose,
  orderNumber,
  items,
  currentBoxName,
  currentConfidence,
  onFeedbackSaved,
}: BoxConfirmDialogProps) {
  const ref = useReferenceData()
  const boxes = ref.boxes as unknown as Box[]

  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [mappedItems, setMappedItems] = useState<{ productId: string; productName: string; quantity: number; volume: number }[]>([])

  // Fetch products when dialog opens (boxes come from shared reference data)
  useEffect(() => {
    if (isOpen) {
      fetchProducts()
    }
  }, [isOpen])

  // Map order items to products when data is loaded
  useEffect(() => {
    if (products.length > 0 && items.length > 0) {
      mapItemsToProducts()
    }
  }, [products, items])

  const fetchProducts = async () => {
    setLoading(true)
    setError(null)
    try {
      const prodRes = await fetch('/api/products')
      const prodData = await prodRes.json()
      if (!prodRes.ok) throw new Error(prodData.error || 'Failed to fetch products')
      setProducts(prodData.sizes || prodData.products || [])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const mapItemsToProducts = async () => {
    // Try to match SKUs to product sizes
    const mapped: { productId: string; productName: string; quantity: number; volume: number }[] = []

    for (const item of items) {
      // Try to find a matching product by SKU pattern
      // This uses the same logic as the ingest API - match by SKU prefix
      const sku = item.sku.toUpperCase()

      // Skip insurance/shipping items
      if (sku.includes('INSURANCE') || sku.includes('SHIPPING')) continue

      // Try to match to a product size
      let matchedProduct: Product | undefined

      // Match DPT10 → 10oz Tumbler, DPT16 → 16oz Tumbler, DPT26 → 26oz Bottle
      if (sku.startsWith('DPT10')) {
        matchedProduct = products.find(p => p.name.toLowerCase().includes('10oz'))
      } else if (sku.startsWith('DPT16')) {
        matchedProduct = products.find(p => p.name.toLowerCase().includes('16oz'))
      } else if (sku.startsWith('DPT26')) {
        matchedProduct = products.find(p => p.name.toLowerCase().includes('26oz'))
      }

      if (matchedProduct) {
        // Check if we already have this product
        const existing = mapped.find(m => m.productId === matchedProduct!.id)
        if (existing) {
          existing.quantity += item.quantity
        } else {
          mapped.push({
            productId: matchedProduct.id,
            productName: matchedProduct.name,
            quantity: item.quantity,
            volume: matchedProduct.volume,
          })
        }
      }
    }

    setMappedItems(mapped)

    // Auto-run test if we have mapped items
    if (mapped.length > 0) {
      runTestWithItems(mapped)
    }
  }

  const runTestWithItems = async (testItems: { productId: string; quantity: number }[]) => {
    setTesting(true)
    setError(null)

    try {
      const res = await fetch('/api/box-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'test-fit',
          items: testItems.map(i => ({ productId: i.productId, quantity: i.quantity })),
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to test')
      setTestResult(data)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setTesting(false)
    }
  }

  const saveFeedback = async (boxId: string) => {
    if (!testResult?.comboSignature) return

    setSaving(true)
    setError(null)

    try {
      const res = await fetch('/api/box-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add-feedback',
          comboSignature: testResult.comboSignature,
          boxId: boxId,
          fits: true,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save feedback')

      onFeedbackSaved()
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const handleClose = () => {
    setTestResult(null)
    setMappedItems([])
    setError(null)
    onClose()
  }

  const totalVolume = mappedItems.reduce((sum, item) => sum + item.volume * item.quantity, 0)

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={handleClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/40" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-lg transform overflow-hidden rounded-xl bg-white p-6 shadow-xl transition-all">
                <Dialog.Title as="h3" className="text-lg font-semibold text-gray-900 mb-1">
                  Confirm Box for Order #{orderNumber}
                </Dialog.Title>
                <p className="text-sm text-gray-500 mb-4">
                  Verify or change the box assignment for this order's items.
                </p>

                {error && (
                  <div className="mb-4 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
                    {error}
                  </div>
                )}

                {loading ? (
                  <div className="py-8 text-center text-gray-500">Loading...</div>
                ) : (
                  <>
                    {/* Current Assignment */}
                    <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                      <div className="text-sm font-medium text-gray-700 mb-2">Current Assignment:</div>
                      <div className="flex items-center gap-3">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                          currentBoxName ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {currentBoxName || 'No fit'}
                        </span>
                        <span className={`text-sm ${
                          currentConfidence === 'confirmed' ? 'text-green-600' :
                          currentConfidence === 'calculated' ? 'text-amber-600' :
                          'text-red-600'
                        }`}>
                          {currentConfidence === 'confirmed' ? '✓ Confirmed' :
                           currentConfidence === 'calculated' ? '○ Calculated' :
                           '? Unknown'}
                        </span>
                      </div>
                    </div>

                    {/* Order Items */}
                    <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                      <div className="text-sm font-medium text-gray-700 mb-2">Order Items:</div>
                      <ul className="space-y-1 text-sm">
                        {items.filter(item =>
                          !item.sku.toUpperCase().includes('INSURANCE') &&
                          !item.sku.toUpperCase().includes('SHIPPING')
                        ).map((item, idx) => (
                          <li key={idx} className="flex justify-between">
                            <span className="font-mono text-xs">{item.sku}</span>
                            <span className="text-gray-600">× {item.quantity}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Mapped Products */}
                    {mappedItems.length > 0 ? (
                      <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                        <div className="text-sm font-medium text-blue-800 mb-2">Mapped to Product Sizes:</div>
                        <ul className="space-y-1 text-sm">
                          {mappedItems.map((item, idx) => (
                            <li key={idx} className="flex justify-between">
                              <span>{item.quantity}× {item.productName}</span>
                              <span className="text-blue-600">
                                ({(item.volume * item.quantity).toFixed(0)} in³)
                              </span>
                            </li>
                          ))}
                        </ul>
                        <div className="mt-2 pt-2 border-t border-blue-200 text-sm font-semibold text-blue-800">
                          Total Volume: {totalVolume.toFixed(0)} in³
                        </div>
                      </div>
                    ) : (
                      <div className="mb-4 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                        <div className="text-sm text-yellow-800">
                          Could not map SKUs to known product sizes. This may be an accessory-only order or contain unknown SKUs.
                        </div>
                      </div>
                    )}

                    {/* Test Result */}
                    {testing ? (
                      <div className="mb-4 p-4 bg-gray-100 rounded-lg text-center text-gray-600">
                        Testing fit...
                      </div>
                    ) : testResult ? (
                      <div className={`mb-4 p-4 rounded-lg border-2 ${
                        testResult.box
                          ? testResult.confidence === 'confirmed'
                            ? 'bg-green-50 border-green-300'
                            : 'bg-blue-50 border-blue-300'
                          : 'bg-yellow-50 border-yellow-300'
                      }`}>
                        {testResult.box ? (
                          <>
                            <div className="text-sm text-gray-600 mb-1">Algorithm suggests:</div>
                            <div className="text-lg font-semibold">
                              {testResult.box.name}
                            </div>
                            <div className="text-sm text-gray-600 mt-1">
                              Fill: {testResult.fitRatio ? (testResult.fitRatio * 100).toFixed(0) : '—'}%
                              <span className="text-gray-400 ml-1">
                                ({testResult.orderVolume?.toFixed(0)} / {testResult.usableVolume?.toFixed(0)} in³)
                              </span>
                            </div>
                          </>
                        ) : (
                          <div className="text-yellow-800 font-semibold">
                            No box fits this combination
                          </div>
                        )}
                      </div>
                    ) : null}

                    {/* Confirm Buttons */}
                    {testResult && mappedItems.length > 0 && (
                      <div className="space-y-3">
                        <div className="text-sm font-medium text-gray-700">Select the correct box:</div>
                        <div className="grid grid-cols-2 gap-2">
                          {boxes
                            .filter(b => b.active)
                            .sort((a, b) => a.priority - b.priority)
                            .map((box) => {
                              const isCurrentSuggestion = testResult.box?.id === box.id
                              const isTooSmall = totalVolume > box.volume * 0.7 // rough packing efficiency check

                              return (
                                <button
                                  key={box.id}
                                  onClick={() => saveFeedback(box.id)}
                                  disabled={saving}
                                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                                    isCurrentSuggestion
                                      ? 'bg-green-600 text-white hover:bg-green-700'
                                      : isTooSmall
                                        ? 'bg-gray-100 text-gray-500 hover:bg-gray-200 border border-gray-300'
                                        : 'bg-blue-100 text-blue-800 hover:bg-blue-200 border border-blue-300'
                                  }`}
                                >
                                  {box.name}
                                  {isCurrentSuggestion && ' ✓'}
                                </button>
                              )
                            })}
                        </div>
                        <p className="text-xs text-gray-500 mt-2">
                          Click a box to confirm this item combination fits in that box.
                        </p>
                      </div>
                    )}
                  </>
                )}

                {/* Close button */}
                <div className="mt-6 flex justify-end">
                  <button
                    onClick={handleClose}
                    className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg"
                  >
                    {saving ? 'Saving...' : 'Close'}
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}
