'use client'

import { useState, useMemo, useCallback } from 'react'
import OrderDialog from '../dialogs/OrderDialog'
import PackingSlipButton from '../shared/PackingSlipButton'
import { getColorFromSku, getSizeFromSku, isShippingInsurance } from '@/lib/order-utils'
import { useExpeditedFilter, isOrderExpedited, isOrderPersonalized } from '@/context/ExpeditedFilterContext'
import { useReferenceData } from '@/hooks/useReferenceData'
import { useOrders } from '@/context/OrdersContext'
import type { OrderLog } from '@/context/OrdersContext'
import type { Box } from '@/lib/box-config'

// ============================================================================
// Types
// ============================================================================

interface PersonalizedOrdersTableProps {
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
  engravingText: string
}

// ============================================================================
// Helpers
// ============================================================================

function getEngravingText(rawPayload: any): string {
  const order = Array.isArray(rawPayload) ? rawPayload[0] : rawPayload
  if (order?.engravingText) return order.engravingText
  if (order?.customization?.text) return order.customization.text
  if (order?.personalization?.text) return order.personalization.text

  const items = order?.items || []
  for (const item of items) {
    if (item.engravingText) return item.engravingText
    if (item.customization?.text) return item.customization.text
    if (item.personalization?.text) return item.personalization.text
  }
  return ''
}

// ============================================================================
// Main Component
// ============================================================================

export default function PersonalizedOrdersTable({ orders }: PersonalizedOrdersTableProps) {
  const { expeditedFilter } = useExpeditedFilter()
  const ref = useReferenceData()
  const boxes = ref.boxes as Box[]
  const { refreshOrders } = useOrders()

  // UI State
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null)
  const [selectedRawPayload, setSelectedRawPayload] = useState<any | null>(null)
  const [selectedLog, setSelectedLog] = useState<OrderLog | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [selectedBoxFilter, setSelectedBoxFilter] = useState<string>('all')
  const [selectedCupSize, setSelectedCupSize] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set())
  const [pushMessage, setPushMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [customBatchName, setCustomBatchName] = useState('')
  const [pushing, setPushing] = useState(false)

  // Process orders - only personalized, not yet batched
  const processedOrders = useMemo(() => {
    return orders
      .map((log) => {
        // Skip already-batched or on-hold orders
        if (log.batchId || log.status === 'ON_HOLD') return null

        // Only include personalized orders
        if (!isOrderPersonalized(log.rawPayload)) return null

        const payload = log.rawPayload as any
        const order = Array.isArray(payload) ? payload[0] : payload
        const items = (order?.items || []).filter(
          (item: any) => !isShippingInsurance(item.sku || '', item.name || '')
        )

        if (items.length === 0) return null

        const processedItems = items.map((item: any) => ({
          sku: item.sku || 'N/A',
          name: item.name || 'Unknown',
          quantity: item.quantity || 1,
          color: getColorFromSku(item.sku || '', item.name, item.color),
          size: getSizeFromSku(item.sku || ''),
        }))

        const totalQty = processedItems.reduce((sum: number, item: any) => sum + item.quantity, 0)
        const boxName = log.suggestedBox?.boxName || null
        const customerName = order?.shipTo?.name || order?.billTo?.name || 'Unknown'
        const orderDate = order?.orderDate || log.createdAt
        const engravingText = getEngravingText(log.rawPayload)

        return {
          log,
          order,
          items: processedItems,
          totalQty,
          boxName,
          customerName,
          orderDate: typeof orderDate === 'string' ? orderDate : String(orderDate),
          engravingText,
        } as ProcessedOrder
      })
      .filter((o): o is ProcessedOrder => o !== null)
  }, [orders])

  // Box sizes (tier 1 filter)
  const boxSizeCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    processedOrders.forEach(o => {
      const box = o.boxName || 'No Box'
      counts[box] = (counts[box] || 0) + 1
    })
    return counts
  }, [processedOrders])

  // Cup sizes (tier 2 filter, filtered by selected box)
  const cupSizeCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    processedOrders.forEach(o => {
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
  }, [processedOrders, selectedBoxFilter])

  // Apply all filters
  const filteredOrders = useMemo(() => {
    let result = processedOrders

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
        o.engravingText.toLowerCase().includes(q) ||
        o.items.some(i => i.sku.toLowerCase().includes(q) || i.name.toLowerCase().includes(q))
      )
    }

    // Sort by date (newest first)
    result.sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime())

    return result
  }, [processedOrders, selectedBoxFilter, selectedCupSize, searchQuery, expeditedFilter])

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

  // Push handler - personalized batches go directly to the personalized pool (no cell assignment)
  const handlePushToQueue = useCallback(async () => {
    const orderNumbers = selectedOrderIds.size > 0
      ? Array.from(selectedOrderIds)
      : filteredOrders.map(o => o.log.orderNumber)

    if (orderNumbers.length === 0) return

    setPushing(true)
    setPushMessage(null)

    try {
      const res = await fetch('/api/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderNumbers,
          cellIds: [], // No cell assignment for personalized
          type: 'ORDER_BY_SIZE',
          isPersonalized: true,
          customName: customBatchName || undefined,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create batch')
      }

      const data = await res.json()
      setPushMessage({
        type: 'success',
        text: `Created personalized batch "${data.batch.name}" with ${data.summary.totalOrders} orders`,
      })

      setSelectedOrderIds(new Set())
      setCustomBatchName('')
      if (refreshOrders) refreshOrders()
    } catch (err: any) {
      setPushMessage({
        type: 'error',
        text: err.message || 'Failed to create batch',
      })
    } finally {
      setPushing(false)
    }
  }, [selectedOrderIds, filteredOrders, customBatchName, refreshOrders])

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
            selectedBoxFilter === 'all' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          All Boxes ({processedOrders.length})
        </button>
        {sortedBoxSizes.map(([size, count]) => (
          <button
            key={size}
            onClick={() => { setSelectedBoxFilter(size); setSelectedCupSize('all') }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              selectedBoxFilter === size ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
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
            placeholder="Search order #, customer, SKU, engraving text..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 max-w-md px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
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
        </div>
      </div>

      {/* Push to Queue controls (inline, no cell selection needed) */}
      <div className="flex items-center gap-3 bg-purple-50 rounded-lg p-3 border border-purple-200">
        <input
          type="text"
          value={customBatchName}
          onChange={(e) => setCustomBatchName(e.target.value)}
          placeholder="Batch name (auto-generated if empty)"
          className="flex-1 max-w-xs px-3 py-2 border border-purple-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 bg-white"
        />
        <button
          onClick={handlePushToQueue}
          disabled={filteredOrders.length === 0 || pushing}
          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm flex items-center gap-2"
        >
          {pushing ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
              Creating...
            </>
          ) : (
            `Push to Personalized Queue (${selectedCount})`
          )}
        </button>
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
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Engraving</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredOrders.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                  No personalized orders match the current filters
                </td>
              </tr>
            ) : (
              filteredOrders.slice(0, 200).map((o) => {
                const isSelected = selectedOrderIds.has(o.log.orderNumber)
                return (
                  <tr
                    key={o.log.id}
                    onClick={() => { setSelectedOrder(o.order); setSelectedRawPayload(o.log.rawPayload); setSelectedLog(o.log); setIsDialogOpen(true) }}
                    className={`hover:bg-gray-50 cursor-pointer ${isSelected ? 'bg-purple-50' : ''}`}
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
                        o.boxName ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {o.boxName || 'Unknown'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-sm">
                      {o.engravingText ? (
                        <span className="text-purple-700 font-medium truncate block max-w-[200px]" title={o.engravingText}>
                          {o.engravingText}
                        </span>
                      ) : (
                        <span className="text-gray-400 italic">No text</span>
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

      {/* Order Detail Dialog */}
      {isDialogOpen && selectedOrder && (
        <OrderDialog
          isOpen={isDialogOpen}
          onClose={() => { setIsDialogOpen(false); setSelectedOrder(null); setSelectedRawPayload(null); setSelectedLog(null) }}
          order={selectedOrder}
          rawPayload={selectedRawPayload}
          orderLog={selectedLog}
          onSaved={() => refreshOrders()}
        />
      )}
    </div>
  )
}
