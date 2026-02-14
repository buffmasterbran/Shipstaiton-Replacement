'use client'

import { useState, useMemo, useCallback } from 'react'
import OrderDialog from './OrderDialog'
import PushToQueueDialog from './PushToQueueDialog'
import PackingSlipButton from './PackingSlipButton'
import { getColorFromSku, getSizeFromSku, isShippingInsurance } from '@/lib/order-utils'
import { useExpeditedFilter, isOrderExpedited, isOrderPersonalized } from '@/context/ExpeditedFilterContext'
import { useReferenceData } from '@/lib/use-reference-data'
import { useOrders } from '@/context/OrdersContext'

// ============================================================================
// Types
// ============================================================================

interface OrderLog {
  id: string
  orderNumber: string
  status: string
  rawPayload: any
  batchId?: string | null
  suggestedBox?: {
    boxId: string | null
    boxName: string | null
    confidence: 'confirmed' | 'calculated' | 'unknown'
    reason?: string
  } | null
  orderType?: string | null
  createdAt: Date | string
  updatedAt: Date | string
}

interface Box {
  id: string
  name: string
  lengthInches: number
  widthInches: number
  heightInches: number
  weightLbs: number
  priority: number
  active: boolean
  singleCupOnly: boolean
}

interface BoxSizeSpecificTableProps {
  orders: OrderLog[]
}

interface ProcessedOrder {
  log: OrderLog
  order: any
  items: Array<{
    sku: string
    name: string
    quantity: number
    color: string
    size: string
  }>
  totalQty: number
  boxName: string | null
  customerName: string
  orderDate: string
  identicalSignature: string
  identicalCount?: number
}

// ============================================================================
// Helpers
// ============================================================================

function computeSimpleSignature(items: Array<{ sku: string; quantity: number }>): string {
  const sorted = items.map(i => `${i.sku}:${i.quantity}`).sort()
  return sorted.join('|')
}

// ============================================================================
// Main Component
// ============================================================================

export default function BoxSizeSpecificTable({ orders }: BoxSizeSpecificTableProps) {
  const { expeditedFilter } = useExpeditedFilter()
  const ref = useReferenceData()
  const boxes = ref.boxes as Box[]
  const { refreshOrders } = useOrders()

  // UI State
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null)
  const [selectedRawPayload, setSelectedRawPayload] = useState<any | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isPushDialogOpen, setIsPushDialogOpen] = useState(false)
  const [selectedBoxFilter, setSelectedBoxFilter] = useState<string>('all')
  const [selectedCupSize, setSelectedCupSize] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set())
  const [pushMessage, setPushMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Process orders
  const processedOrders = useMemo(() => {
    return orders
      .map((log) => {
        // Skip already-batched or on-hold orders
        if (log.batchId || log.status === 'ON_HOLD') return null

        // Personalized orders have their own tab - exclude here
        if (isOrderPersonalized(log.rawPayload)) return null

        const payload = log.rawPayload as any
        const order = Array.isArray(payload) ? payload[0] : payload
        const items = (order?.items || []).filter(
          (item: any) => !isShippingInsurance(item.sku || '', item.name || '')
        )

        if (items.length === 0) return null

        // Order by Size = multi-item orders (5+), or non-bulk multi-item orders
        const processedItems = items.map((item: any) => ({
          sku: item.sku || 'N/A',
          name: item.name || 'Unknown',
          quantity: item.quantity || 1,
          color: getColorFromSku(item.sku || '', item.name, item.color),
          size: getSizeFromSku(item.sku || ''),
        }))

        const totalQty = processedItems.reduce((sum: number, item: any) => sum + item.quantity, 0)

        // Skip singles (1 item)
        if (totalQty <= 1) return null

        const boxName = log.suggestedBox?.boxName || null
        const customerName = order?.shipTo?.name || order?.billTo?.name || 'Unknown'
        const orderDate = order?.orderDate || log.createdAt
        const identicalSignature = computeSimpleSignature(processedItems)

        return {
          log,
          order,
          items: processedItems,
          totalQty,
          boxName,
          customerName,
          orderDate: typeof orderDate === 'string' ? orderDate : String(orderDate),
          identicalSignature,
        } as ProcessedOrder
      })
      .filter((o): o is ProcessedOrder => o !== null)
  }, [orders])

  // Compute identical counts for sorting
  const ordersWithIdenticalCounts = useMemo(() => {
    const sigCounts = new Map<string, number>()
    processedOrders.forEach(o => {
      sigCounts.set(o.identicalSignature, (sigCounts.get(o.identicalSignature) || 0) + 1)
    })
    return processedOrders.map(o => ({
      ...o,
      identicalCount: sigCounts.get(o.identicalSignature) || 1,
    }))
  }, [processedOrders])

  // Box sizes (tier 1 filter)
  const boxSizeCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    ordersWithIdenticalCounts.forEach(o => {
      const box = o.boxName || 'No Box'
      counts[box] = (counts[box] || 0) + 1
    })
    return counts
  }, [ordersWithIdenticalCounts])

  // Cup sizes (tier 2 filter, filtered by selected box)
  const cupSizeCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    ordersWithIdenticalCounts.forEach(o => {
      if (selectedBoxFilter !== 'all') {
        const box = o.boxName || 'No Box'
        if (box !== selectedBoxFilter) return
      }
      o.items.forEach(item => {
        if (item.size && item.size !== 'Unknown') {
          counts[item.size] = (counts[item.size] || 0) + 1
        }
      })
    })
    return counts
  }, [ordersWithIdenticalCounts, selectedBoxFilter])

  // Apply all filters
  const filteredOrders = useMemo(() => {
    let result = ordersWithIdenticalCounts

    // Expedited filter
    if (expeditedFilter === 'only') {
      result = result.filter(o => {
        const cr = (o.log as any).customerReachedOut || false
        return isOrderExpedited(o.log.rawPayload, cr, (o.log as any).orderType)
      })
    } else if (expeditedFilter === 'hide') {
      result = result.filter(o => {
        const cr = (o.log as any).customerReachedOut || false
        return !isOrderExpedited(o.log.rawPayload, cr, (o.log as any).orderType)
      })
    }

    // Box filter
    if (selectedBoxFilter !== 'all') {
      result = result.filter(o => (o.boxName || 'No Box') === selectedBoxFilter)
    }

    // Cup size filter
    if (selectedCupSize !== 'all') {
      result = result.filter(o =>
        o.items.some(i => i.size === selectedCupSize)
      )
    }

    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(o =>
        o.log.orderNumber.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        o.items.some(i => i.sku.toLowerCase().includes(q) || i.name.toLowerCase().includes(q))
      )
    }

    // Default sort: identical orders first, then by date
    result.sort((a, b) => (b.identicalCount || 1) - (a.identicalCount || 1))

    return result
  }, [ordersWithIdenticalCounts, selectedBoxFilter, selectedCupSize, searchQuery, expeditedFilter])

  // Selection helpers
  const selectableOrders = filteredOrders.filter(o => !o.log.batchId)
  const allSelected = selectableOrders.length > 0 && selectableOrders.every(o => selectedOrderIds.has(o.log.orderNumber))

  const toggleSelection = (orderNumber: string) => {
    setSelectedOrderIds(prev => {
      const next = new Set(prev)
      if (next.has(orderNumber)) next.delete(orderNumber)
      else next.add(orderNumber)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedOrderIds(new Set())
    } else {
      setSelectedOrderIds(new Set(selectableOrders.map(o => o.log.orderNumber)))
    }
  }

  // Get selected count
  const selectedCount = selectedOrderIds.size > 0 ? selectedOrderIds.size : filteredOrders.length

  // Push handler
  const handlePushToQueue = useCallback(async (cellIds: string[], customName?: string) => {
    const orderNumbers = selectedOrderIds.size > 0
      ? Array.from(selectedOrderIds)
      : filteredOrders.map(o => o.log.orderNumber)

    const res = await fetch('/api/batches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderNumbers,
        cellIds,
        type: 'ORDER_BY_SIZE',
        isPersonalized: false,
        customName,
      }),
    })

    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error || 'Failed to create batch')
    }

    const data = await res.json()
    setPushMessage({
      type: 'success',
      text: `Created batch "${data.batch.name}" with ${data.summary.totalOrders} orders → ${data.summary.cellsAssigned} cell(s)`,
    })

    setSelectedOrderIds(new Set())
    if (refreshOrders) refreshOrders()
  }, [selectedOrderIds, filteredOrders, refreshOrders])

  const sortedBoxSizes = Object.entries(boxSizeCounts).sort((a, b) => {
    const boxA = boxes.find(box => box.name === a[0])
    const boxB = boxes.find(box => box.name === b[0])
    return (boxA?.priority || 999) - (boxB?.priority || 999)
  })

  const sortedCupSizes = Object.entries(cupSizeCounts).sort((a, b) => b[1] - a[1])

  return (
    <div className="space-y-4">
      {/* Message */}
      {pushMessage && (
        <div className={`p-3 rounded-lg text-sm ${
          pushMessage.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
        }`}>
          {pushMessage.text}
          <button onClick={() => setPushMessage(null)} className="ml-2 underline">Dismiss</button>
        </div>
      )}

      {/* Tier 1: Box size filter */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => { setSelectedBoxFilter('all'); setSelectedCupSize('all') }}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            selectedBoxFilter === 'all' ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          All Boxes ({ordersWithIdenticalCounts.length})
        </button>
        {sortedBoxSizes.map(([size, count]) => (
          <button
            key={size}
            onClick={() => { setSelectedBoxFilter(size); setSelectedCupSize('all') }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              selectedBoxFilter === size ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {size} ({count})
          </button>
        ))}
      </div>

      {/* Tier 2: Cup size filter */}
      {sortedCupSizes.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedCupSize('all')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              selectedCupSize === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            All Cup Sizes
          </button>
          {sortedCupSizes.map(([size, count]) => (
            <button
              key={size}
              onClick={() => setSelectedCupSize(size)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                selectedCupSize === size ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {size} ({count})
            </button>
          ))}
        </div>
      )}

      {/* Search + Action bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1">
          <input
            type="text"
            placeholder="Search order #, customer, SKU..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 max-w-md px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">
            {filteredOrders.length} orders
            {selectedOrderIds.size > 0 && ` (${selectedOrderIds.size} selected)`}
          </span>
          <PackingSlipButton
            getOrders={() => filteredOrders.map(o => ({
              orderNumber: o.log.orderNumber,
              customerName: o.customerName,
              shipTo: o.order?.shipTo || { name: o.customerName },
              items: o.items.map(i => ({ sku: i.sku, name: i.name, quantity: i.quantity })),
            }))}
            disabled={filteredOrders.length === 0}
          />
          <button
            onClick={() => setIsPushDialogOpen(true)}
            disabled={filteredOrders.length === 0}
            className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm"
          >
            Push to Queue ({selectedCount})
          </button>
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
              <th className="px-3 py-3 text-left">
                  <input
                    type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  className="rounded border-gray-300"
                  />
                </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Order #</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Items</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Qty</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Box</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Identical</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredOrders.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                  No orders match the current filters
                </td>
              </tr>
            ) : (
              filteredOrders.slice(0, 200).map((o) => {
                const isSelected = selectedOrderIds.has(o.log.orderNumber)
                return (
                  <tr
                    key={o.log.id}
                    onClick={() => { setSelectedOrder(o.order); setSelectedRawPayload(o.log.rawPayload); setIsDialogOpen(true) }}
                    className={`hover:bg-gray-50 cursor-pointer ${isSelected ? 'bg-blue-50' : ''}`}
                  >
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                        onChange={() => toggleSelection(o.log.orderNumber)}
                        className="rounded border-gray-300"
                        />
                    </td>
                    <td className="px-4 py-2 text-sm font-mono text-gray-900">
                      {o.log.orderNumber}
                    </td>
                    <td className="px-4 py-2 text-sm">
                      <div className="flex flex-wrap gap-1">
                        {o.items.map((item, idx) => (
                          <span key={idx} className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                            {item.quantity}× {item.sku}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-600">{o.totalQty}</td>
                    <td className="px-4 py-2 text-sm">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                        o.boxName ? 'bg-teal-100 text-teal-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {o.boxName || 'Unknown'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-sm">
                      {(o.identicalCount || 1) > 1 ? (
                        <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700">
                          {o.identicalCount}×
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-800">{o.customerName}</td>
                    <td className="px-4 py-2 text-sm text-gray-500">
                      {new Date(o.orderDate).toLocaleDateString()}
                    </td>
                  </tr>
                )
              })
            )}
            </tbody>
          </table>
        {filteredOrders.length > 200 && (
          <div className="px-4 py-2 text-xs text-gray-500 bg-gray-50 border-t">
            Showing first 200 of {filteredOrders.length} orders
        </div>
        )}
      </div>

      {/* Push to Queue Dialog */}
      <PushToQueueDialog
        isOpen={isPushDialogOpen}
        onClose={() => setIsPushDialogOpen(false)}
        onConfirm={handlePushToQueue}
        orderCount={selectedCount}
        batchType="ORDER_BY_SIZE"
        isPersonalized={false}
        description={
          selectedBoxFilter !== 'all' || selectedCupSize !== 'all'
            ? `${selectedBoxFilter !== 'all' ? selectedBoxFilter : 'All boxes'}${selectedCupSize !== 'all' ? ` - ${selectedCupSize}` : ''}`
            : undefined
        }
      />

      {/* Order Detail Dialog */}
      {isDialogOpen && selectedOrder && (
      <OrderDialog
        isOpen={isDialogOpen}
          onClose={() => { setIsDialogOpen(false); setSelectedOrder(null); setSelectedRawPayload(null) }}
        order={selectedOrder}
        rawPayload={selectedRawPayload}
        />
      )}
    </div>
  )
}
