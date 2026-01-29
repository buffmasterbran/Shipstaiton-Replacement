'use client'

import { Fragment, useState, useEffect } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { XMarkIcon, CheckIcon } from '@heroicons/react/24/outline'
import { getSizeFromSku, getColorFromSku, isShippingInsurance } from '@/lib/order-utils'

const MAX_ORDERS_PER_CHUNK = 24

interface OrderLog {
  id: string
  orderNumber: string
  status: string
  rawPayload: any
  createdAt: Date
  updatedAt: Date
}

interface PicklistItem {
  sku: string
  name: string
  totalQty: number
  size: string
  color: string
}

interface BulkQueueItem {
  id: string
  batchId: string | null
  bulkGroupSignature: string
  chunkIndex: number
  totalChunks: number
  orderNumbers: string[]
  packageInfo: {
    carrier: string
    service: string
    packaging: string
    weight: string
    dimensions: { length: string; width: string; height: string }
  }
  status: string
  createdAt: string
  updatedAt: string
}

interface BulkVerificationDialogProps {
  isOpen: boolean
  onClose: () => void
  queueItemId: string | null
  onComplete: () => void
}

export default function BulkVerificationDialog({
  isOpen,
  onClose,
  queueItemId,
  onComplete,
}: BulkVerificationDialogProps) {
  const [queueItem, setQueueItem] = useState<BulkQueueItem | null>(null)
  const [orders, setOrders] = useState<OrderLog[]>([])
  const [picklistItems, setPicklistItems] = useState<PicklistItem[]>([])
  const [verifiedSkus, setVerifiedSkus] = useState<Set<string>>(new Set())
  const [quantityConfirmed, setQuantityConfirmed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [printing, setPrinting] = useState(false)

  useEffect(() => {
    if (!isOpen || !queueItemId) return
    setVerifiedSkus(new Set())
    setQuantityConfirmed(false)
    setError(null)
    const fetchData = async () => {
      setLoading(true)
      try {
        const itemRes = await fetch(`/api/bulk-queue/${queueItemId}`)
        const itemData = await itemRes.json()
        if (!itemRes.ok) throw new Error(itemData.error || 'Failed to load queue item')
        setQueueItem(itemData)
        const orderNumbers = (itemData.orderNumbers || []) as string[]
        if (orderNumbers.length === 0) {
          setOrders([])
          setPicklistItems([])
          return
        }
        const ordRes = await fetch(`/api/orders-by-numbers?orderNumbers=${encodeURIComponent(orderNumbers.join(','))}`)
        const ordData = await ordRes.json()
        if (!ordRes.ok) throw new Error(ordData.error || 'Failed to load orders')
        const orderList = ordData.orders || []
        setOrders(orderList)
        const itemMap = new Map<string, PicklistItem>()
        orderList.forEach((log: OrderLog) => {
          const payload = log.rawPayload as any
          const order = Array.isArray(payload) ? payload[0] : payload
          const items = order?.items || []
          items.forEach((it: any) => {
            if (isShippingInsurance(it.sku || '', it.name || '')) return
            const sku = it.sku || 'N/A'
            const qty = it.quantity || 1
            const existing = itemMap.get(sku)
            if (existing) {
              existing.totalQty += qty
            } else {
              itemMap.set(sku, {
                sku,
                name: it.name || 'N/A',
                totalQty: qty,
                size: getSizeFromSku(sku),
                color: getColorFromSku(sku, it.name),
              })
            }
          })
        })
        setPicklistItems(Array.from(itemMap.values()))
      } catch (e: any) {
        setError(e?.message || 'Failed to load')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [isOpen, queueItemId])

  const toggleVerified = (sku: string) => {
    setVerifiedSkus((prev) => {
      const next = new Set(prev)
      if (next.has(sku)) next.delete(sku)
      else next.add(sku)
      return next
    })
  }

  const allItemsVerified = picklistItems.length > 0 && picklistItems.every((i) => verifiedSkus.has(i.sku))
  const canPrint = allItemsVerified && quantityConfirmed

  const handlePrintLabels = async () => {
    if (!queueItemId || !canPrint) return
    setPrinting(true)
    setError(null)
    try {
      const printRes = await fetch(`/api/bulk-queue/${queueItemId}/print`)
      if (!printRes.ok) throw new Error('Failed to load print')
      const html = await printRes.text()
      const printWindow = window.open('', '_blank')
      if (printWindow) {
        printWindow.document.write(html)
        printWindow.document.close()
        setTimeout(() => {
          printWindow.print()
        }, 250)
      }
      await fetch(`/api/bulk-queue/${queueItemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'COMPLETED' }),
      })
      onComplete()
      onClose()
    } catch (e: any) {
      setError(e?.message || 'Failed to print')
    } finally {
      setPrinting(false)
    }
  }

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-25" />
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
              <Dialog.Panel className="w-full max-w-2xl transform overflow-hidden rounded-2xl bg-white text-left align-middle shadow-xl transition-all">
                <div className="bg-gradient-to-r from-green-600 to-green-700 px-6 py-4">
                  <div className="flex items-center justify-between">
                    <Dialog.Title as="h3" className="text-xl font-bold text-white">
                      {queueItem?.batchId ? `${queueItem.batchId} — Start bulk` : 'Bulk verification — Start bulk'}
                    </Dialog.Title>
                    <button
                      onClick={onClose}
                      className="rounded-full p-1 text-white hover:bg-white/20 transition-colors"
                    >
                      <XMarkIcon className="h-6 w-6" />
                    </button>
                  </div>
                </div>

                <div className="max-h-[calc(100vh-280px)] overflow-y-auto p-6">
                  {loading && (
                    <p className="text-gray-500">Loading picklist…</p>
                  )}
                  {error && (
                    <p className="text-red-600 text-sm mb-4">{error}</p>
                  )}
                  {!loading && queueItem && (
                    <>
                      {queueItem.batchId && (
                        <p className="text-sm font-medium text-gray-900 mb-1 font-mono">{queueItem.batchId}</p>
                      )}
                      <p className="text-sm text-gray-600 mb-4">
                        Chunk {queueItem.chunkIndex + 1} of {queueItem.totalChunks} — {orders.length} orders (max {MAX_ORDERS_PER_CHUNK}). Scan or mark one of each item to confirm color/size, then confirm quantity.
                      </p>
                      <h4 className="text-sm font-semibold text-gray-900 mb-2">Picklist</h4>
                      <ul className="space-y-3 mb-6">
                        {picklistItems.map((item) => (
                          <li
                            key={item.sku}
                            className="flex items-center justify-between gap-4 py-2 border-b border-gray-100"
                          >
                            <div>
                              <span className="font-mono text-sm font-medium">{item.sku}</span>
                              <span className="text-gray-600 text-sm ml-2">{item.name}</span>
                              <span className="text-gray-500 text-xs block">Size: {item.size} | Color: {item.color}</span>
                              <span className="text-sm font-semibold">Qty: {item.totalQty}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => toggleVerified(item.sku)}
                              className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1 ${
                                verifiedSkus.has(item.sku)
                                  ? 'bg-green-600 text-white'
                                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                              }`}
                            >
                              {verifiedSkus.has(item.sku) ? <CheckIcon className="h-4 w-4" /> : null}
                              {verifiedSkus.has(item.sku) ? 'Verified' : 'Mark verified'}
                            </button>
                          </li>
                        ))}
                      </ul>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={quantityConfirmed}
                          onChange={(e) => setQuantityConfirmed(e.target.checked)}
                          className="w-5 h-5 text-green-600 rounded focus:ring-green-500"
                        />
                        <span className="text-sm font-medium text-gray-700">I confirm quantities are correct</span>
                      </label>
                    </>
                  )}
                </div>

                <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
                  <button
                    onClick={onClose}
                    disabled={printing}
                    className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handlePrintLabels}
                    disabled={!canPrint || printing}
                    className={`px-4 py-2 rounded-lg transition-colors ${
                      canPrint && !printing
                        ? 'bg-green-600 text-white hover:bg-green-700'
                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    }`}
                  >
                    {printing ? 'Printing…' : 'Print labels'}
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
