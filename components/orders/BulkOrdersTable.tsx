'use client'

import { useState, useMemo, useCallback } from 'react'
import OrderDialog from '../dialogs/OrderDialog'
import PushToQueueDialog from '../dialogs/PushToQueueDialog'
import PackingSlipButton from '../shared/PackingSlipButton'
import { getSizeFromSku, getColorFromSku, isShippingInsurance } from '@/lib/order-utils'
import { computeOrderSignature, splitBulkGroup, type ClassifiableItem } from '@/lib/order-classifier'
import { useExpeditedFilter, isOrderExpedited, isOrderPersonalized } from '@/context/ExpeditedFilterContext'
import { useOrders } from '@/context/OrdersContext'
import type { OrderLog } from '@/context/OrdersContext'
import { checkOrderReadiness, countReady } from '@/lib/order-readiness'

// ============================================================================
// Types
// ============================================================================

interface BulkOrdersTableProps {
  orders: OrderLog[]
}

interface BulkOrderGroup {
  signature: string
  items: Array<{ sku: string; name: string; quantity: number; size: string; color: string }>
  orders: Array<{ log: OrderLog; order: any; customerName: string; orderDate: string }>
  totalOrders: number
  itemsPerOrder: number
  boxName: string | null
  /** How many splits needed if pushed to queue (max 24 per bin) */
  splits: number[]
}

// ============================================================================
// Main Component
// ============================================================================

export default function BulkOrdersTable({ orders }: BulkOrdersTableProps) {
  const { expeditedFilter } = useExpeditedFilter()
  const { refreshOrders } = useOrders()

  // UI State
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null)
  const [selectedRawPayload, setSelectedRawPayload] = useState<any | null>(null)
  const [selectedLog, setSelectedLog] = useState<OrderLog | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isPushDialogOpen, setIsPushDialogOpen] = useState(false)
  const [selectedGroup, setSelectedGroup] = useState<BulkOrderGroup | null>(null)
  const [selectedGroupSigs, setSelectedGroupSigs] = useState<Set<string>>(new Set())
  const [pushAllMode, setPushAllMode] = useState(false)
  const [pushSelectedMode, setPushSelectedMode] = useState(false)
  const [bulkThreshold, setBulkThreshold] = useState(4)
  const [selectedBoxFilter, setSelectedBoxFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [readinessFilter, setReadinessFilter] = useState<'all' | 'ready' | 'not-ready'>('all')
  const [pushMessage, setPushMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Process and group orders by identical signature
  const bulkGroups = useMemo(() => {
    const groupMap = new Map<string, BulkOrderGroup>()

    orders.forEach((log) => {
      // Skip already-batched or on-hold orders
      if (log.batchId || log.status === 'ON_HOLD') return

      const payload = log.rawPayload as any
      const order = Array.isArray(payload) ? payload[0] : payload
      const items = (order?.items || []).filter(
        (item: any) => !isShippingInsurance(item.sku || '', item.name || '')
      )

      // Bulk requires 2-4 items
      const totalItems = items.reduce((sum: number, item: any) => sum + (item.quantity || 1), 0)
      if (totalItems < 2 || totalItems > 4) return

      // Personalized orders have their own tab - exclude here
      if (isOrderPersonalized(log.rawPayload)) return

      // Check filters
      const customerReachedOut = (log as any).customerReachedOut || false
      const isExpedited = isOrderExpedited(log.rawPayload, customerReachedOut, (log as any).orderType)
      if (expeditedFilter === 'only' && !isExpedited) return
      if (expeditedFilter === 'hide' && isExpedited) return

      // Compute signature for identical matching
      const classifiableItems: ClassifiableItem[] = items.map((item: any) => ({
        sku: item.sku || '',
        name: item.name || '',
        quantity: item.quantity || 1,
      }))
      const sig = computeOrderSignature(classifiableItems)

      const customerName = order?.shipTo?.name || order?.billTo?.name || 'Unknown'
      const existing = groupMap.get(sig.signature)

      if (existing) {
        existing.orders.push({ log, order, customerName, orderDate: order?.orderDate || log.createdAt })
        existing.totalOrders++
      } else {
        const groupItems = items.map((item: any) => ({
          sku: item.sku || '',
          name: item.name || '',
          quantity: item.quantity || 1,
          size: getSizeFromSku(item.sku || ''),
          color: getColorFromSku(item.sku || '', item.name, item.color),
        }))

        groupMap.set(sig.signature, {
          signature: sig.signature,
          items: groupItems,
          orders: [{ log, order, customerName, orderDate: order?.orderDate || log.createdAt }],
          totalOrders: 1,
          itemsPerOrder: totalItems,
          boxName: log.suggestedBox?.boxName || null,
          splits: [1], // Will be recalculated
        })
      }
    })

    // Filter by threshold and calculate splits
    const groups = Array.from(groupMap.values())
      .filter(g => g.totalOrders >= bulkThreshold)
      .map(g => ({
        ...g,
        splits: splitBulkGroup(g.totalOrders),
      }))
      .sort((a, b) => b.totalOrders - a.totalOrders)

    return groups
  }, [orders, bulkThreshold, expeditedFilter])

  // Box size filter
  const boxSizes = useMemo(() => {
    const sizes = new Set<string>()
    bulkGroups.forEach(g => {
      if (g.boxName) sizes.add(g.boxName)
    })
    return Array.from(sizes).sort()
  }, [bulkGroups])

  const filteredGroups = useMemo(() => {
    let result = bulkGroups

    // Box size filter
    if (selectedBoxFilter !== 'all') {
      result = result.filter(g => g.boxName === selectedBoxFilter)
    }

    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(g =>
        g.items.some(i => i.sku.toLowerCase().includes(q) || i.name.toLowerCase().includes(q)) ||
        g.orders.some(o => o.log.orderNumber.toLowerCase().includes(q) || o.customerName.toLowerCase().includes(q))
      )
    }

    // Readiness filter: keep groups where at least one order matches
    if (readinessFilter !== 'all') {
      result = result.filter(g => {
        if (readinessFilter === 'ready') return g.orders.some(o => checkOrderReadiness(o.log).ready)
        return g.orders.some(o => !checkOrderReadiness(o.log).ready)
      })
    }

    return result
  }, [bulkGroups, selectedBoxFilter, searchQuery, readinessFilter])

  // Total orders across all visible groups
  const totalVisibleOrders = filteredGroups.reduce((sum, g) => sum + g.totalOrders, 0)

  // Selection helpers
  const toggleGroupSelection = (sig: string) => {
    setSelectedGroupSigs(prev => {
      const next = new Set(prev)
      if (next.has(sig)) next.delete(sig)
      else next.add(sig)
      return next
    })
  }

  const allGroupsSelected = filteredGroups.length > 0 && filteredGroups.every(g => selectedGroupSigs.has(g.signature))
  const toggleSelectAll = () => {
    if (allGroupsSelected) {
      setSelectedGroupSigs(new Set())
    } else {
      setSelectedGroupSigs(new Set(filteredGroups.map(g => g.signature)))
    }
  }

  const selectedGroups = filteredGroups.filter(g => selectedGroupSigs.has(g.signature))
  const selectedOrderCount = selectedGroups.reduce((sum, g) => sum + g.totalOrders, 0)

  const [pushProgress, setPushProgress] = useState<string | null>(null)

  // Push handler for a single group
  const handlePushGroup = useCallback(async (cellIds: string[], customName?: string) => {
    if (!selectedGroup && !pushAllMode && !pushSelectedMode) return

    const groups = pushAllMode
      ? filteredGroups
      : pushSelectedMode
        ? selectedGroups
        : selectedGroup ? [selectedGroup] : []
    const allOrderNumbers = groups.flatMap(g => g.orders.map(o => o.log.orderNumber))

    setPushProgress(`Sending ${allOrderNumbers.length} orders from ${groups.length} group(s) to queue...`)

    const startTime = Date.now()
    const res = await fetch('/api/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
        orderNumbers: allOrderNumbers,
        cellIds,
        type: 'BULK',
        customName,
        }),
      })

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

    if (!res.ok) {
      const data = await res.json()
      console.error(`[BULK PUSH] FAILED after ${elapsed}s:`, data.error)
      setPushProgress(null)
      throw new Error(data.error || 'Failed to create batch')
    }

    const data = await res.json()

    setPushProgress(null)
    const skippedInfo = data.summary.skippedOrders > 0
      ? ` ⚠️ ${data.summary.skippedOrders} orders skipped (${data.summary.alreadyBatched} already batched, ${data.summary.wrongStatus} wrong status, ${data.summary.notFound} not found)`
      : ''
    setPushMessage({
      type: data.summary.skippedOrders > 0 ? 'error' : 'success',
      text: `Created batch "${data.batch.name}" with ${data.summary.totalOrders} of ${data.summary.requestedOrders} orders (${data.summary.bulkBatches} bulk groups) → ${data.summary.cellsAssigned} cell(s) [${elapsed}s]${skippedInfo}`,
    })

    // Reset and refresh orders so batched orders disappear from the list
    setSelectedGroup(null)
    setPushAllMode(false)
    setPushSelectedMode(false)
    setSelectedGroupSigs(new Set())
    if (refreshOrders) refreshOrders()
  }, [selectedGroup, pushAllMode, pushSelectedMode, filteredGroups, selectedGroups, refreshOrders])

  const handleRowClick = (order: any, rawPayload: any, log: OrderLog) => {
    setSelectedOrder(order)
    setSelectedRawPayload(rawPayload)
    setSelectedLog(log)
    setIsDialogOpen(true)
  }

  const handleOrderSaved = useCallback((updatedOrder: any) => {
    if (updatedOrder?.id && refreshOrders) refreshOrders()
  }, [refreshOrders])

  const flatOrders = useMemo(() => filteredGroups.flatMap(g => g.orders), [filteredGroups])
  const viewedIndex = selectedLog ? flatOrders.findIndex(o => o.log.id === selectedLog.id) : -1
  const navigateTo = useCallback((idx: number) => {
    const o = flatOrders[idx]
    if (!o) return
    setSelectedOrder(o.order)
    setSelectedRawPayload(o.log.rawPayload)
    setSelectedLog(o.log)
  }, [flatOrders])
  const handleNavPrev = useCallback(() => { if (viewedIndex > 0) navigateTo(viewedIndex - 1) }, [viewedIndex, navigateTo])
  const handleNavNext = useCallback(() => { if (viewedIndex < flatOrders.length - 1) navigateTo(viewedIndex + 1) }, [viewedIndex, flatOrders.length, navigateTo])

  return (
    <div className="space-y-4">
      {/* Progress indicator */}
      {pushProgress && (
        <div className="p-3 rounded-lg text-sm bg-blue-50 text-blue-700 flex items-center gap-3">
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent" />
          {pushProgress}
        </div>
      )}

      {/* Success/Error message */}
      {pushMessage && (
        <div className={`p-3 rounded-lg text-sm ${
          pushMessage.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
        }`}>
          {pushMessage.text}
          <button onClick={() => setPushMessage(null)} className="ml-2 underline">Dismiss</button>
        </div>
      )}

      {/* Threshold slider + filters */}
      <div className="flex items-center gap-6 flex-wrap">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700">Minimum identical orders:</label>
          <input
            type="range"
            min={4}
            max={200}
            value={bulkThreshold}
            onChange={(e) => setBulkThreshold(parseInt(e.target.value))}
            className="w-40"
          />
          <span className="text-sm font-mono font-medium text-gray-900 w-8">{bulkThreshold}</span>
      </div>
  
        {/* Box size filter */}
        {boxSizes.length > 0 && (
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-500">Box:</label>
            <select
              value={selectedBoxFilter}
              onChange={(e) => setSelectedBoxFilter(e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-2 py-1"
            >
              <option value="all">All Sizes</option>
              {boxSizes.map(size => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
      </div>
        )}

        {/* Search */}
            <input
          type="text"
          placeholder="Search SKU, order #, customer..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm flex-1 max-w-xs"
        />
      </div>

      {/* Readiness filter */}
      {(() => {
        const allGroupOrders = bulkGroups.flatMap(g => g.orders.map(o => o.log))
        const { ready, notReady } = countReady(allGroupOrders)
        return (
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-500 uppercase mr-1">Label Ready:</span>
            {([
              { key: 'all' as const, label: 'All', count: ready + notReady, color: 'gray' },
              { key: 'ready' as const, label: 'Ready', count: ready, color: 'green' },
              { key: 'not-ready' as const, label: 'Not Ready', count: notReady, color: 'red' },
            ]).map(({ key, label, count, color }) => (
              <button
                key={key}
                onClick={() => setReadinessFilter(key)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  readinessFilter === key
                    ? color === 'green' ? 'bg-green-600 text-white'
                      : color === 'red' ? 'bg-red-600 text-white'
                      : 'bg-gray-700 text-white'
                    : color === 'green' ? 'bg-green-50 text-green-700 hover:bg-green-100'
                      : color === 'red' ? 'bg-red-50 text-red-700 hover:bg-red-100'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {label} ({count})
              </button>
            ))}
          </div>
        )
      })()}

      {/* Action bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
              checked={allGroupsSelected}
              onChange={toggleSelectAll}
              className="rounded border-gray-300"
            />
            Select all
            </label>
          <span className="text-sm text-gray-500">
            {filteredGroups.length} group{filteredGroups.length !== 1 ? 's' : ''} &middot; {totalVisibleOrders} orders
            {selectedGroupSigs.size > 0 && ` (${selectedGroupSigs.size} selected, ${selectedOrderCount} orders)`}
          </span>
        </div>
              <div className="flex items-center gap-2">
          <PackingSlipButton
            getOrders={() => {
              const allOrders: Array<{ orderNumber: string; customerName: string; shipTo: any; items: Array<{ sku: string; name: string; quantity: number }> }> = []
              filteredGroups.forEach(g => g.orders.forEach(o => {
                const order = Array.isArray(o.log.rawPayload) ? o.log.rawPayload[0] : o.log.rawPayload
                const items = (order?.items || []).filter((i: any) => !(i.sku || '').toUpperCase().includes('INSURANCE'))
                allOrders.push({
                  orderNumber: o.log.orderNumber,
                  customerName: o.customerName,
                  shipTo: order?.shipTo || { name: o.customerName },
                  items: items.map((i: any) => ({ sku: i.sku || '', name: i.name || '', quantity: i.quantity || 1 })),
                })
              }))
              return allOrders
            }}
            disabled={filteredGroups.length === 0}
          />
          {selectedGroupSigs.size > 0 && (
            <button
              onClick={() => { setPushSelectedMode(true); setPushAllMode(false); setIsPushDialogOpen(true) }}
              className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors font-medium text-sm"
            >
              Push Selected ({selectedOrderCount})
            </button>
          )}
          <button
            onClick={() => { setPushAllMode(true); setPushSelectedMode(false); setIsPushDialogOpen(true) }}
            disabled={filteredGroups.length === 0}
            className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm"
          >
            Push All ({totalVisibleOrders})
          </button>
        </div>
      </div>

      {/* Bulk Groups */}
      <div className="space-y-3">
        {filteredGroups.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-500">
            {bulkThreshold > 4
              ? `No groups with ${bulkThreshold}+ identical orders. Try lowering the threshold.`
              : 'No bulk-eligible orders found (need 2-4 items per order with identical duplicates).'
            }
        </div>
        ) : (
          filteredGroups.map((group) => (
            <div key={group.signature} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              {/* Group header */}
              <div className="bg-gray-50 px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
          <input
                    type="checkbox"
                    checked={selectedGroupSigs.has(group.signature)}
                    onChange={() => toggleGroupSelection(group.signature)}
                    className="rounded border-gray-300"
                  />
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-sm font-bold bg-orange-100 text-orange-700">
                          {group.totalOrders} orders
                        </span>
                  <span className="text-sm text-gray-600">
                    {group.itemsPerOrder} item{group.itemsPerOrder !== 1 ? 's' : ''}/order
                      </span>
                  {group.boxName && (
                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{group.boxName}</span>
                  )}
                  {group.splits.length > 1 && (
                    <span className="text-xs text-amber-600">
                      → {group.splits.length} splits ({group.splits.join(', ')})
                          </span>
                  )}
                  {(() => {
                    const { ready, notReady } = countReady(group.orders.map(o => o.log))
                    return ready === group.totalOrders ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                        All Ready
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-600">
                        {ready}/{group.totalOrders} ready
                      </span>
                    )
                  })()}
                              </div>
                        <button
                  onClick={() => { setSelectedGroup(group); setPushAllMode(false); setIsPushDialogOpen(true) }}
                  className="px-3 py-1.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 text-sm font-medium transition-colors"
                >
                  Push Group
                          </button>
                        </div>

              {/* Items in the order */}
              <div className="px-4 py-2 border-b border-gray-100">
                <div className="flex flex-wrap gap-3">
                  {group.items.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-1.5 text-sm">
                      <span className="font-mono text-gray-600">{item.sku}</span>
                      <span className="text-gray-400">×{item.quantity}</span>
                      {item.color && item.color !== 'Unknown' && (
                        <span className="text-gray-500">{item.color}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Sample orders (collapsed) */}
              <details className="px-4 py-2">
                <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
                  Show {group.orders.length} order{group.orders.length !== 1 ? 's' : ''}
                </summary>
                <div className="mt-2 space-y-1 max-h-[200px] overflow-y-auto">
                  {group.orders.map((o) => {
                    const readiness = checkOrderReadiness(o.log)
                    return (
                    <div
                      key={o.log.id}
                      onClick={() => handleRowClick(o.order, o.log.rawPayload, o.log)}
                        className="flex items-center gap-2 text-sm py-1 hover:bg-gray-50 cursor-pointer rounded px-2"
                    >
                        {readiness.ready ? (
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-100 text-green-600 flex-shrink-0">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                          </span>
                        ) : (
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-100 text-red-500 flex-shrink-0">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          </span>
                        )}
                        <span className="font-mono text-gray-600">{o.log.orderNumber}</span>
                        {readiness.missing.length > 0 && (
                          <span className="text-xs text-red-500">{readiness.missing.join(', ')}</span>
                        )}
                        <span className="text-gray-500 ml-auto">{o.customerName}</span>
                      <span className="text-gray-400 text-xs">{new Date(o.orderDate).toLocaleDateString()}</span>
                        </div>
                    )
                  })}
        </div>
              </details>
            </div>
          ))
        )}
      </div>

      {/* Push to Queue Dialog */}
      <PushToQueueDialog
        isOpen={isPushDialogOpen}
        onClose={() => { setIsPushDialogOpen(false); setSelectedGroup(null); setPushAllMode(false); setPushSelectedMode(false) }}
        onConfirm={handlePushGroup}
        orderCount={pushAllMode ? totalVisibleOrders : pushSelectedMode ? selectedOrderCount : selectedGroup?.totalOrders || 0}
        batchType="BULK"
        description={
          pushAllMode
            ? `${filteredGroups.length} bulk groups`
            : pushSelectedMode
              ? `${selectedGroups.length} selected groups`
              : selectedGroup
                ? `${selectedGroup.items.map(i => `${i.quantity}× ${i.sku}`).join(', ')}`
                : undefined
        }
      />

      {/* Order Detail Dialog */}
      <OrderDialog
        isOpen={isDialogOpen}
        onClose={() => { setIsDialogOpen(false); setSelectedOrder(null); setSelectedRawPayload(null); setSelectedLog(null) }}
        order={selectedOrder}
        rawPayload={selectedRawPayload}
        orderLog={selectedLog}
        onSaved={handleOrderSaved}
        onPrev={viewedIndex > 0 ? handleNavPrev : null}
        onNext={viewedIndex >= 0 && viewedIndex < flatOrders.length - 1 ? handleNavNext : null}
      />
    </div>
  )
}
