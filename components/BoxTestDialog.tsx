'use client'

import { useState, useMemo, Fragment } from 'react'
import { Dialog, Transition } from '@headlessui/react'

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
}

interface FeedbackRule {
  id: string
  comboSignature: string
  boxId: string
  fits: boolean
  correctBoxId?: string
  testedAt: string
}

interface TestItem {
  productId: string
  productName: string
  quantity: number
  volume: number
}

interface TestResult {
  box: Box | null
  confidence: 'confirmed' | 'calculated' | 'unknown'
  fitRatio?: number
  orderVolume?: number
  usableVolume?: number
  comboSignature: string
}

interface BoxTestDialogProps {
  isOpen: boolean
  onClose: () => void
  products: Product[]
  boxes: Box[]
  packingEfficiency: number
  feedbackRules: FeedbackRule[]
  onFeedbackSaved: () => void
}

// Build a combo signature (must match API logic)
function buildSignature(items: { productId: string; quantity: number }[]): string {
  return items
    .map(i => `${i.productId}:${i.quantity}`)
    .sort()
    .join('|')
}

// Generate all combinations up to maxTotalQty items (any mix of products)
function generateCombinations(
  products: Product[],
  maxQtyPerProduct = 6,
  maxTotalQty = 10
): { productId: string; quantity: number }[][] {
  const combos: { productId: string; quantity: number }[][] = []
  const activeProducts = products.filter(p => p.volume > 0)

  // Recursive generator: tries all qty assignments for each product
  function generate(
    productIndex: number,
    current: { productId: string; quantity: number }[],
    remainingQty: number
  ) {
    // Base case: considered all products
    if (productIndex >= activeProducts.length) {
      if (current.length > 0) {
        combos.push([...current])
      }
      return
    }

    const product = activeProducts[productIndex]
    const maxQty = Math.min(maxQtyPerProduct, remainingQty)

    // Option 1: Skip this product (qty = 0)
    generate(productIndex + 1, current, remainingQty)

    // Option 2: Include 1, 2, 3, ... up to maxQty of this product
    for (let qty = 1; qty <= maxQty; qty++) {
      generate(
        productIndex + 1,
        [...current, { productId: product.id, quantity: qty }],
        remainingQty - qty
      )
    }
  }

  generate(0, [], maxTotalQty)
  return combos
}

export default function BoxTestDialog({
  isOpen,
  onClose,
  products,
  boxes,
  packingEfficiency,
  feedbackRules,
  onFeedbackSaved,
}: BoxTestDialogProps) {
  const [testItems, setTestItems] = useState<TestItem[]>([])
  const [selectedProductId, setSelectedProductId] = useState('')
  const [testQuantity, setTestQuantity] = useState(1)
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [suggestionMessage, setSuggestionMessage] = useState<string | null>(null)

  const testOrderVolume = useMemo(() => {
    return testItems.reduce((sum, item) => sum + item.volume * item.quantity, 0)
  }, [testItems])

  // Get confirmed signatures (combos that have fits: true feedback)
  const confirmedSignatures = useMemo(() => {
    return new Set(
      feedbackRules
        .filter(r => r.fits)
        .map(r => r.comboSignature)
    )
  }, [feedbackRules])

  // Count how many combos are confirmed vs total
  const comboStats = useMemo(() => {
    const allCombos = generateCombinations(products)
    const unconfirmed = allCombos.filter(
      combo => !confirmedSignatures.has(buildSignature(combo))
    )
    return {
      total: allCombos.length,
      confirmed: allCombos.length - unconfirmed.length,
      remaining: unconfirmed.length,
    }
  }, [products, confirmedSignatures])

  // Suggest the next unconfirmed combination
  const suggestNext = () => {
    const allCombos = generateCombinations(products)
    const unconfirmed = allCombos.filter(
      combo => !confirmedSignatures.has(buildSignature(combo))
    )

    if (unconfirmed.length === 0) {
      setSuggestionMessage('All combinations confirmed!')
      return
    }

    // Pick the first unconfirmed combo
    const nextCombo = unconfirmed[0]

    // Convert to TestItems
    const newTestItems: TestItem[] = nextCombo.map(item => {
      const product = products.find(p => p.id === item.productId)!
      return {
        productId: item.productId,
        productName: product.name,
        quantity: item.quantity,
        volume: product.volume,
      }
    })

    setTestItems(newTestItems)
    setTestResult(null)
    setSuggestionMessage(`Suggested: ${unconfirmed.length} unconfirmed remaining`)
  }

  const addTestItem = () => {
    if (!selectedProductId) return
    const product = products.find(p => p.id === selectedProductId)
    if (!product) return

    const existing = testItems.find(i => i.productId === selectedProductId)
    if (existing) {
      setTestItems(testItems.map(i =>
        i.productId === selectedProductId
          ? { ...i, quantity: i.quantity + testQuantity }
          : i
      ))
    } else {
      setTestItems([
        ...testItems,
        {
          productId: product.id,
          productName: product.name,
          quantity: testQuantity,
          volume: product.volume,
        },
      ])
    }

    setTestResult(null)
  }

  const removeTestItem = (productId: string) => {
    setTestItems(testItems.filter(i => i.productId !== productId))
    setTestResult(null)
  }

  const clearTest = () => {
    setTestItems([])
    setTestResult(null)
    setError(null)
    setSuggestionMessage(null)
  }

  const runTest = async () => {
    if (testItems.length === 0) return

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

  const saveFeedback = async (fits: boolean, correctBoxId?: string) => {
    if (!testResult?.comboSignature || !testResult?.box) return

    setSaving(true)
    setError(null)

    try {
      const res = await fetch('/api/box-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add-feedback',
          comboSignature: testResult.comboSignature,
          boxId: testResult.box.id,
          fits,
          correctBoxId: fits ? undefined : correctBoxId,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save feedback')

      onFeedbackSaved()
      await runTest()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const handleClose = () => {
    clearTest()
    onClose()
  }

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
                  Test Box Fit
                </Dialog.Title>
                <p className="text-sm text-gray-500 mb-4">
                  Build a test order to see which box it fits in.
                </p>

                {/* Progress & Suggest Next */}
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="text-sm">
                      <span className="font-medium text-blue-900">
                        {comboStats.confirmed} / {comboStats.total}
                      </span>
                      <span className="text-blue-700 ml-1">combinations confirmed</span>
                      {comboStats.remaining > 0 && (
                        <span className="text-blue-600 ml-2">
                          ({comboStats.remaining} remaining)
                        </span>
                      )}
                    </div>
                    <button
                      onClick={suggestNext}
                      disabled={comboStats.remaining === 0}
                      className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Suggest Next
                    </button>
                  </div>
                  {suggestionMessage && (
                    <div className="mt-2 text-sm text-blue-700">
                      {suggestionMessage}
                    </div>
                  )}
                </div>

                {error && (
                  <div className="mb-4 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
                    {error}
                  </div>
                )}

                {/* Add product */}
                <div className="flex gap-2 mb-4">
                  <select
                    value={selectedProductId}
                    onChange={(e) => setSelectedProductId(e.target.value)}
                    className="flex-1 border rounded px-3 py-2 text-sm"
                  >
                    <option value="">Select product...</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.volume.toFixed(1)} in³)
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    value={testQuantity}
                    onChange={(e) => setTestQuantity(parseInt(e.target.value) || 1)}
                    className="w-16 border rounded px-2 py-2 text-sm text-center"
                  />
                  <button
                    onClick={addTestItem}
                    disabled={!selectedProductId}
                    className="px-3 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>

                {/* Test items */}
                {testItems.length > 0 && (
                  <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                    <div className="text-sm font-medium text-gray-700 mb-2">Test Order:</div>
                    <ul className="space-y-1">
                      {testItems.map((item) => (
                        <li key={item.productId} className="flex items-center justify-between text-sm">
                          <span>
                            {item.quantity}× {item.productName}
                            <span className="text-gray-500 ml-2">
                              ({(item.volume * item.quantity).toFixed(1)} in³)
                            </span>
                          </span>
                          <button
                            onClick={() => removeTestItem(item.productId)}
                            className="text-red-500 hover:text-red-700 px-2"
                          >
                            ×
                          </button>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-2 pt-2 border-t text-sm font-semibold">
                      Total: {testOrderVolume.toFixed(1)} in³
                    </div>
                  </div>
                )}

                {/* Test button */}
                <div className="flex gap-2 mb-4">
                  <button
                    onClick={runTest}
                    disabled={testItems.length === 0 || testing}
                    className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                  >
                    {testing ? 'Testing...' : 'Test Fit'}
                  </button>
                  <button
                    onClick={clearTest}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Clear
                  </button>
                </div>

                {/* Result */}
                {testResult && (
                  <div className={`p-4 rounded-lg border-2 ${
                    testResult.box
                      ? testResult.confidence === 'confirmed'
                        ? 'bg-green-50 border-green-300'
                        : 'bg-blue-50 border-blue-300'
                      : 'bg-yellow-50 border-yellow-300'
                  }`}>
                    {testResult.box ? (
                      <>
                        <div className="text-lg font-semibold">
                          {testResult.box.name}
                        </div>
                        <div className="text-sm text-gray-600 mt-1">
                          Fill: {testResult.fitRatio ? (testResult.fitRatio * 100).toFixed(0) : '—'}%
                          <span className="text-gray-400 ml-1">
                            ({testResult.orderVolume?.toFixed(0)} / {testResult.usableVolume?.toFixed(0)} in³)
                          </span>
                        </div>
                        <div className="text-sm mt-1">
                          <span className={`font-medium ${
                            testResult.confidence === 'confirmed' ? 'text-green-700' : 'text-blue-700'
                          }`}>
                            {testResult.confidence === 'confirmed' ? 'Confirmed' : 'Calculated'}
                          </span>
                        </div>

                        {testResult.confidence !== 'confirmed' && (
                          <div className="mt-4 pt-3 border-t">
                            <div className="text-sm text-gray-700 mb-2">
                              Does this fit in {testResult.box.name}?
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => saveFeedback(true)}
                                disabled={saving}
                                className="flex-1 px-3 py-2 bg-green-600 text-white rounded text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                              >
                                Yes, it fits
                              </button>
                              <select
                                disabled={saving}
                                className="flex-1 px-3 py-2 bg-red-600 text-white rounded text-sm font-medium hover:bg-red-700 disabled:opacity-50 cursor-pointer appearance-none text-center"
                                value=""
                                onChange={(e) => {
                                  if (e.target.value) {
                                    saveFeedback(false, e.target.value)
                                  }
                                }}
                              >
                                <option value="" disabled>Actually fits in...</option>
                                {boxes
                                  .filter(b => b.id !== testResult.box?.id)
                                  .sort((a, b) => a.volume - b.volume)
                                  .map((box) => (
                                    <option key={box.id} value={box.id} className="bg-white text-gray-900">
                                      {box.name} ({box.volume.toFixed(0)} in³)
                                    </option>
                                  ))}
                              </select>
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-yellow-800 font-semibold">
                        No box fits this combination
                        <div className="text-sm font-normal mt-1">Goes to Misc queue</div>
                      </div>
                    )}
                  </div>
                )}

                {/* Close button */}
                <div className="mt-6 flex justify-end">
                  <button
                    onClick={handleClose}
                    className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg"
                  >
                    Close
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
