'use client'

import { useState, useEffect, Fragment } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { useReferenceData } from '@/hooks/useReferenceData'
import type { Box } from '@/lib/box-config'

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

  const [loading, setLoading] = useState(true)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [mappedItems, setMappedItems] = useState<{ productId: string; productName: string; quantity: number; volume: number }[]>([])
  const [canonicalSignature, setCanonicalSignature] = useState<string | null>(null)

  // Use the suggest-box API (same matchSkuToSize as ingestion) for correct mapping
  useEffect(() => {
    if (isOpen && items.length > 0) {
      fetchSuggestion()
    }
  }, [isOpen, items])

  const fetchSuggestion = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/box-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'suggest-box',
          items: items.map(i => ({ sku: i.sku, quantity: i.quantity })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to compute box suggestion')

      setCanonicalSignature(data.comboSignature || null)

      const mapped: { productId: string; productName: string; quantity: number; volume: number }[] = []
      if (data.mappedItems) {
        for (const mi of data.mappedItems) {
          const existing = mapped.find(m => m.productId === mi.productId)
          if (existing) {
            existing.quantity += mi.quantity
          } else {
            mapped.push({
              productId: mi.productId,
              productName: mi.productName || mi.productId,
              quantity: mi.quantity,
              volume: mi.volume ?? 0,
            })
          }
        }
      }
      setMappedItems(mapped)

      if (data.box && data.comboSignature) {
        setTestResult({
          box: { id: data.box.id, name: data.box.name, volume: data.box.volume || 0 },
          confidence: data.confidence,
          fitRatio: data.fitRatio,
          orderVolume: data.orderVolume,
          usableVolume: data.usableVolume,
          comboSignature: data.comboSignature,
        })
      } else if (data.comboSignature) {
        setTestResult({
          box: null,
          confidence: data.confidence || 'unknown',
          orderVolume: data.orderVolume,
          comboSignature: data.comboSignature,
        })
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const saveFeedback = async (boxId: string) => {
    if (!boxId || !canonicalSignature) return

    setSaving(true)
    setError(null)

    try {
      const res = await fetch('/api/box-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add-feedback',
          comboSignature: canonicalSignature,
          boxId,
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
    setCanonicalSignature(null)
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
                              Fill: {testResult.orderVolume && testResult.usableVolume ? (testResult.orderVolume / testResult.usableVolume * 100).toFixed(0) : '—'}%
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
