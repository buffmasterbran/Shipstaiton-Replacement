'use client'

import { useState, useMemo, useCallback } from 'react'
import OrderDialog from './OrderDialog'
import PushToQueueDialog from './PushToQueueDialog'
import PackingSlipButton from './PackingSlipButton'
import { getColorFromSku, getSizeFromSku, isShippingInsurance } from '@/lib/order-utils'
import { useExpeditedFilter, isOrderExpedited, isOrderPersonalized } from '@/context/ExpeditedFilterContext'
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
  isPersonalized?: boolean
  suggestedBox?: {
    boxId: string | null
    boxName: string | null
    confidence: 'confirmed' | 'calculated' | 'unknown'
  } | null
  orderType?: string | null
  createdAt: Date | string
  updatedAt: Date | string
}

interface SinglesOrdersTableProps {
  orders: OrderLog[]
}

interface ProcessedOrder {
  log: OrderLog
  order: any
  mainItem: any
  sku: string
  size: string
  color: string
  customerName: string
  orderDate: string
}

// SKU display name mappings for accessories
const SKU_DISPLAY_NAMES: Record<string, string> = {
  'LID-AT': 'Air-tight Lid',
  'LID-PS': 'Perfect Sip Lid',
  'PTLD-OG': 'OG Air-tight Lid',
  'LDRACK': 'Lid Rack',
}

function getDisplayName(sku: string): string {
  const upper = sku.toUpperCase()
  for (const [prefix, name] of Object.entries(SKU_DISPLAY_NAMES)) {
    if (upper.startsWith(prefix)) return name
  }
  return sku
}

// ============================================================================
// Main Component
// ============================================================================

export default function SinglesOrdersTable({ orders }: SinglesOrdersTableProps) {
  const { expeditedFilter } = useExpeditedFilter()
  const { refreshOrders } = useOrders()

  // UI State
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null)
  const [selectedRawPayload, setSelectedRawPayload] = useState<any | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isPushDialogOpen, setIsPushDialogOpen] = useState(false)
  const [selectedSize, setSelectedSize] = useState<string>('all')
  const [selectedVariation, setSelectedVariation] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [pushMessage, setPushMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Process orders: extract main item, SKU, size, color
  const processedOrders = useMemo(() => {
    return orders
      .map((log) => {
        const payload = log.rawPayload as any
        const order = Array.isArray(payload) ? payload[0] : payload
        const items = order?.items || []
        
        const mainItem = items.find(
          (item: any) => !isShippingInsurance(item.sku || '', item.name || '')
        )
        
        if (!mainItem) return null
        
        // Already in a batch? Skip.
        if (log.batchId) return null

        // Personalized orders have their own tab - exclude here
        if (isOrderPersonalized(log.rawPayload)) return null

        const sku = mainItem.sku || ''
        const size = log.suggestedBox?.boxName || getSizeFromSku(sku)
        const color = getColorFromSku(sku, mainItem.name, mainItem.color)
        const customerName = order?.shipTo?.name || order?.billTo?.name || 'Unknown'
        
        return {
          log,
          order,
          mainItem,
          sku,
          size,
          color,
          customerName,
          orderDate: order?.orderDate || log.createdAt,
        } as ProcessedOrder
      })
      .filter((o): o is ProcessedOrder => o !== null)
  }, [orders])

  // Get unique sizes with counts
  const sizeCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    processedOrders.forEach((order) => {
      counts[order.size] = (counts[order.size] || 0) + 1
    })
    return counts
  }, [processedOrders])

  // Get unique variations (colors + accessories) with counts, filtered by selected size
  const variationCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    processedOrders.forEach((order) => {
      if (selectedSize !== 'all' && order.size !== selectedSize) return
      const variation = order.color || getDisplayName(order.sku)
      counts[variation] = (counts[variation] || 0) + 1
    })
    return counts
  }, [processedOrders, selectedSize])

  // Apply all filters
  const filteredOrders = useMemo(() => {
    return processedOrders.filter((order) => {
      if (order.log.status === 'ON_HOLD') return false

      const customerReachedOut = (order.log as any).customerReachedOut || false
      const isExpedited = isOrderExpedited(order.log.rawPayload, customerReachedOut, (order.log as any).orderType)

      // Expedited filter
      if (expeditedFilter === 'only' && !isExpedited) return false
      if (expeditedFilter === 'hide' && isExpedited) return false

      // Size filter
      if (selectedSize !== 'all' && order.size !== selectedSize) return false

      // Variation filter
      if (selectedVariation !== 'all') {
        const variation = order.color || getDisplayName(order.sku)
        if (variation !== selectedVariation) return false
      }

      // Search
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        if (
          !order.log.orderNumber.toLowerCase().includes(q) &&
          !order.customerName.toLowerCase().includes(q) &&
          !order.sku.toLowerCase().includes(q)
        ) {
          return false
        }
      }
      
      return true
    })
  }, [processedOrders, selectedSize, selectedVariation, searchQuery, expeditedFilter])

  // Group by SKU for the summary display
  const skuGroups = useMemo(() => {
    const groups = new Map<string, { sku: string; name: string; size: string; color: string; count: number; orders: ProcessedOrder[] }>()

    filteredOrders.forEach((order) => {
      const key = order.sku.toUpperCase()
      const existing = groups.get(key)
      if (existing) {
        existing.count++
        existing.orders.push(order)
        } else {
        groups.set(key, {
          sku: order.sku,
          name: order.mainItem.name || getDisplayName(order.sku),
          size: order.size,
          color: order.color,
          count: 1,
          orders: [order],
        })
      }
    })

    // Sort by count descending
    return Array.from(groups.values()).sort((a, b) => b.count - a.count)
  }, [filteredOrders])

  // Push to queue handler
  const handlePushToQueue = useCallback(async (cellIds: string[], customName?: string) => {
    const orderNumbers = filteredOrders.map(o => o.log.orderNumber)

    const res = await fetch('/api/batches', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderNumbers,
        cellIds,
        type: 'SINGLES',
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
      text: `Created batch "${data.batch.name}" with ${data.summary.totalOrders} orders → assigned to ${data.summary.cellsAssigned} cell(s)`,
    })

    // Refresh orders to reflect batch assignment
    if (refreshOrders) refreshOrders()
  }, [filteredOrders, refreshOrders])

  const handleRowClick = (processedOrder: ProcessedOrder) => {
    setSelectedOrder(processedOrder.order)
    setSelectedRawPayload(processedOrder.log.rawPayload)
    setIsDialogOpen(true)
  }

  // Sorted sizes for filter buttons
  const sortedSizes = Object.entries(sizeCounts).sort((a, b) => b[1] - a[1])
  const sortedVariations = Object.entries(variationCounts).sort((a, b) => b[1] - a[1])

    return (
    <div className="space-y-4">
      {/* Success/Error message */}
      {pushMessage && (
        <div className={`p-3 rounded-lg text-sm ${
          pushMessage.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
        }`}>
          {pushMessage.text}
          <button onClick={() => setPushMessage(null)} className="ml-2 underline">Dismiss</button>
      </div>
      )}

      {/* Size filter buttons with counts */}
        <div className="flex flex-wrap gap-2">
        <button
          onClick={() => { setSelectedSize('all'); setSelectedVariation('all') }}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            selectedSize === 'all'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          All Sizes ({processedOrders.length})
        </button>
        {sortedSizes.map(([size, count]) => (
            <button
              key={size}
            onClick={() => { setSelectedSize(size); setSelectedVariation('all') }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              selectedSize === size
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {size} ({count})
            </button>
          ))}
      </div>

      {/* Variation filter buttons with counts */}
        <div className="flex flex-wrap gap-2">
            <button
          onClick={() => setSelectedVariation('all')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            selectedVariation === 'all'
              ? 'bg-teal-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          All Variations ({filteredOrders.length})
        </button>
        {sortedVariations.map(([variation, count]) => (
          <button
            key={variation}
            onClick={() => setSelectedVariation(variation)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              selectedVariation === variation
                ? 'bg-teal-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {variation} ({count})
            </button>
          ))}
      </div>

      {/* Search + Action bar */}
      <div className="flex items-center justify-between gap-4">
            <input
          type="text"
          placeholder="Search by order #, customer, or SKU..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 max-w-md px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />

            <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">
            {filteredOrders.length} orders &middot; {skuGroups.length} SKU groups
                    </span>
          <PackingSlipButton
            getOrders={() => filteredOrders.map(o => ({
              orderNumber: o.log.orderNumber,
              customerName: o.customerName,
              shipTo: o.order?.shipTo || { name: o.customerName },
              items: [{ sku: o.sku, name: o.mainItem.name || o.sku, quantity: o.mainItem.quantity || 1 }],
            }))}
            disabled={filteredOrders.length === 0}
          />
                  <button
            onClick={() => setIsPushDialogOpen(true)}
            disabled={filteredOrders.length === 0}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm"
          >
            Push to Queue ({filteredOrders.length})
                    </button>
        </div>
                  </div>
                  
      {/* SKU Grouping Summary */}
      {skuGroups.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
            <h3 className="text-sm font-semibold text-gray-700">SKU Groupings ({skuGroups.length} groups, {filteredOrders.length} orders)</h3>
                  </div>
          <div className="divide-y divide-gray-100 max-h-[300px] overflow-y-auto">
            {skuGroups.map((group) => (
              <div key={group.sku} className="px-4 py-2 flex items-center justify-between hover:bg-gray-50">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm text-gray-600">{group.sku}</span>
                  <span className="text-sm text-gray-800">{group.name}</span>
                  <span className="text-xs text-gray-500">{group.size}</span>
                  {group.color && group.color !== 'Unknown' && (
                    <span className="text-xs text-gray-500">{group.color}</span>
              )}
            </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                    {group.count} order{group.count !== 1 ? 's' : ''}
                  </span>
                  {group.count > 24 && (
                    <span className="text-xs text-amber-600">
                      ({Math.ceil(group.count / 24)} bins)
              </span>
            )}
          </div>
            </div>
            ))}
          </div>
        </div>
      )}

      {/* Orders Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Order #</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">SKU</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Size</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Variation</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              </tr>
            </thead>
          <tbody className="divide-y divide-gray-200">
              {filteredOrders.length === 0 ? (
                <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  No orders match the current filters
                  </td>
                </tr>
              ) : (
              filteredOrders.slice(0, 200).map((processedOrder) => (
                  <tr
                    key={processedOrder.log.id}
                  onClick={() => handleRowClick(processedOrder)}
                  className="hover:bg-gray-50 cursor-pointer"
                >
                  <td className="px-4 py-2 text-sm font-mono text-gray-900">
                    {processedOrder.log.orderNumber}
                    </td>
                  <td className="px-4 py-2 text-sm font-mono text-gray-600">
                    {processedOrder.sku}
                    </td>
                  <td className="px-4 py-2 text-sm text-gray-800">
                    {processedOrder.mainItem.name || getDisplayName(processedOrder.sku)}
                    </td>
                  <td className="px-4 py-2 text-sm text-gray-600">
                    {processedOrder.size}
                    </td>
                  <td className="px-4 py-2 text-sm text-gray-600">
                    {processedOrder.color || '—'}
                    </td>
                  <td className="px-4 py-2 text-sm text-gray-800">
                    {processedOrder.customerName}
                    </td>
                  <td className="px-4 py-2 text-sm text-gray-500">
                      {new Date(processedOrder.orderDate).toLocaleDateString()}
                    </td>
                  </tr>
                ))
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
        orderCount={filteredOrders.length}
        batchType="SINGLES"
        isPersonalized={false}
        description={
          selectedSize !== 'all' || selectedVariation !== 'all'
            ? `${selectedSize !== 'all' ? selectedSize : 'All sizes'}${selectedVariation !== 'all' ? ` - ${selectedVariation}` : ''}`
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
