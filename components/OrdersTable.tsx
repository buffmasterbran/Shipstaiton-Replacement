'use client'

import { useState, useMemo, useEffect } from 'react'
import OrderDialog from './OrderDialog'
import BoxConfirmDialog from './BoxConfirmDialog'
import { useExpeditedFilter, isOrderExpedited, isOrderPersonalized } from '@/context/ExpeditedFilterContext'

const PAGE_SIZES = [25, 50, 100] as const
const DEFAULT_PAGE_SIZE = 25

type SortKey = 'orderNumber' | 'customer' | 'items' | 'amount' | 'orderDate' | 'received' | 'status'
type SortDir = 'asc' | 'desc'
type OrderTypeFilter = 'all' | 'single' | 'bulk' | 'box' | 'batched' | 'uncategorized'

const ORDER_TYPE_TABS: { key: OrderTypeFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'single', label: 'Single' },
  { key: 'bulk', label: 'Bulk' },
  { key: 'box', label: 'Box' },
  { key: 'batched', label: 'Batched' },
  { key: 'uncategorized', label: 'Uncategorized' },
]

interface OrderLog {
  id: string
  orderNumber: string
  status: string
  rawPayload: any
  customerReachedOut?: boolean
  suggestedBox?: {
    boxId: string | null
    boxName: string | null
    confidence: 'confirmed' | 'calculated' | 'unknown'
    reason?: string
  } | null
  createdAt: Date | string
  updatedAt: Date | string
}

/** Same shape as lib/settings OrderHighlightSettings (passed from server). */
interface OrderHighlightSettings {
  orangeMinDays: number
  orangeMaxDays: number
  redMinDays: number
}

interface OrdersTableProps {
  logs: OrderLog[]
  orderHighlightSettings?: OrderHighlightSettings | null
}

function formatCurrency(amount: number | string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(amount))
}

/** Normalize to local calendar date (midnight) so "days old" is consistent regardless of UTC vs local parsing. */
function toCalendarDate(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** Days between order date and today (floor). Uses orderDate or createdAt. Calendar-day based so sort-by-date gives blocks. */
function getDaysOld(log: OrderLog): number {
  const payload = log.rawPayload as any
  const order = Array.isArray(payload) ? payload[0] : payload
  const raw = order?.orderDate ? new Date(order.orderDate) : new Date(log.createdAt)
  const orderDate = toCalendarDate(raw)
  const today = toCalendarDate(new Date())
  const diffMs = today.getTime() - orderDate.getTime()
  return Math.floor(diffMs / 86400000)
}

/** Row color = age only (so sort-by-date gives clear red / orange / white blocks). Red = 6+ days, Orange = 3–6 days. */
function getOrderHighlightType(
  log: OrderLog,
  settings: OrderHighlightSettings | null | undefined
): 'red' | 'orange' | null {
  if (!settings) return null
  const days = getDaysOld(log)
  if (days >= settings.redMinDays) return 'red'
  if (days > settings.orangeMinDays && days <= settings.orangeMaxDays) return 'orange'
  return null
}

function getOrderDate(log: OrderLog): Date {
  const payload = log.rawPayload as any
  const order = Array.isArray(payload) ? payload[0] : payload
  const d = order?.orderDate ? new Date(order.orderDate) : new Date(log.createdAt)
  return toCalendarDate(d)
}

function getCustomerName(log: OrderLog): string {
  const payload = log.rawPayload as any
  const order = Array.isArray(payload) ? payload[0] : payload
  return order?.shipTo?.name || order?.billTo?.name || 'N/A'
}

function getOrderNumber(log: OrderLog): string {
  const payload = log.rawPayload as any
  const order = Array.isArray(payload) ? payload[0] : payload
  return String(order?.orderNumber ?? log.orderNumber ?? '')
}

function getAmount(log: OrderLog): number {
  const payload = log.rawPayload as any
  const order = Array.isArray(payload) ? payload[0] : payload
  return typeof order?.amountPaid === 'number' ? order.amountPaid : 0
}

/** Categorize order type based on items, shipping, etc. Adjust logic as needed. */
function getOrderType(log: OrderLog): OrderTypeFilter {
  const payload = log.rawPayload as any
  const order = Array.isArray(payload) ? payload[0] : payload
  const items = order?.items || []
  const totalQty = items.reduce((sum: number, item: any) => sum + (item.quantity || 1), 0)
  const shippingMethod = (order?.requestedShippingService || order?.shippingMethod || '').toLowerCase()
  
  // Check if batched (has batchId or batch info)
  if (order?.batchId || order?.batch || log.status?.toUpperCase().includes('BATCH')) {
    return 'batched'
  }
  
  // Single = 1 item total quantity
  if (totalQty === 1) {
    return 'single'
  }
  
  // Box = orders that need box packaging (2-5 items, or shipping method indicates box)
  if (totalQty >= 2 && totalQty <= 5) {
    return 'box'
  }
  
  // Bulk = larger orders (6+ items)
  if (totalQty >= 6) {
    return 'bulk'
  }
  
  // Uncategorized = anything else
  return 'uncategorized'
}

export default function OrdersTable({ logs, orderHighlightSettings }: OrdersTableProps) {
  const { expeditedFilter, personalizedFilter } = useExpeditedFilter()
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null)
  const [selectedRawPayload, setSelectedRawPayload] = useState<any | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<OrderTypeFilter>('all')
  const [sortKey, setSortKey] = useState<SortKey>('orderDate')

  // Box confirm dialog state
  const [isBoxConfirmOpen, setIsBoxConfirmOpen] = useState(false)
  const [boxConfirmLog, setBoxConfirmLog] = useState<OrderLog | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)

  const filteredAndSortedLogs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    let list = logs

    // Filter by personalized (3-state: all, only, hide)
    if (personalizedFilter === 'only') {
      list = list.filter((log) => isOrderPersonalized(log.rawPayload))
    } else if (personalizedFilter === 'hide') {
      list = list.filter((log) => !isOrderPersonalized(log.rawPayload))
    }

    // Filter by expedited (3-state: all, only, hide)
    if (expeditedFilter === 'only') {
      list = list.filter((log) => isOrderExpedited(log.rawPayload, log.customerReachedOut))
    } else if (expeditedFilter === 'hide') {
      list = list.filter((log) => !isOrderExpedited(log.rawPayload, log.customerReachedOut))
    }

    // Filter by type
    if (typeFilter !== 'all') {
      list = list.filter((log) => getOrderType(log) === typeFilter)
    }

    // Filter by search query
    if (q) {
      list = list.filter((log) => {
        const num = getOrderNumber(log).toLowerCase()
        const customer = getCustomerName(log).toLowerCase()
        return num.includes(q) || customer.includes(q)
      })
    }

    return [...list].sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'orderNumber':
          cmp = getOrderNumber(a).localeCompare(getOrderNumber(b))
          break
        case 'customer':
          cmp = getCustomerName(a).localeCompare(getCustomerName(b))
          break
        case 'items': {
          const pa = (a.rawPayload as any)
          const oa = Array.isArray(pa) ? pa[0] : pa
          const pb = (b.rawPayload as any)
          const ob = Array.isArray(pb) ? pb[0] : pb
          const na = oa?.items?.length ?? 0
          const nb = ob?.items?.length ?? 0
          cmp = na - nb
          break
        }
        case 'amount':
          cmp = getAmount(a) - getAmount(b)
          break
        case 'orderDate':
          cmp = getOrderDate(a).getTime() - getOrderDate(b).getTime()
          break
        case 'received':
          cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          break
        case 'status':
          cmp = (a.status ?? '').localeCompare(b.status ?? '')
          break
        default:
          break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [logs, personalizedFilter, expeditedFilter, searchQuery, typeFilter, sortKey, sortDir])
  
  // Count orders by type for tab badges
  const typeCounts = useMemo(() => {
    // Apply global filters first
    let baseList = logs

    // Filter by personalized (3-state)
    if (personalizedFilter === 'only') {
      baseList = baseList.filter((log) => isOrderPersonalized(log.rawPayload))
    } else if (personalizedFilter === 'hide') {
      baseList = baseList.filter((log) => !isOrderPersonalized(log.rawPayload))
    }

    // Filter by expedited (3-state)
    if (expeditedFilter === 'only') {
      baseList = baseList.filter((log) => isOrderExpedited(log.rawPayload, log.customerReachedOut))
    } else if (expeditedFilter === 'hide') {
      baseList = baseList.filter((log) => !isOrderExpedited(log.rawPayload, log.customerReachedOut))
    }

    const counts: Record<OrderTypeFilter, number> = {
      all: baseList.length,
      single: 0,
      bulk: 0,
      box: 0,
      batched: 0,
      uncategorized: 0,
    }
    baseList.forEach((log) => {
      const t = getOrderType(log)
      counts[t]++
    })
    return counts
  }, [logs, personalizedFilter, expeditedFilter])

  const totalFiltered = filteredAndSortedLogs.length
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize))
  const pageLogs = useMemo(
    () => filteredAndSortedLogs.slice((page - 1) * pageSize, page * pageSize),
    [filteredAndSortedLogs, page, pageSize]
  )

  useEffect(() => {
    setPage(1)
  }, [personalizedFilter, expeditedFilter, searchQuery, typeFilter, sortKey, sortDir])

  useEffect(() => {
    if (page > totalPages) setPage(1)
  }, [page, totalPages])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
    setPage(1)
  }

  const handleRowClick = (log: OrderLog) => {
    const payload = log.rawPayload as any
    const order = Array.isArray(payload) ? payload[0] : payload
    setSelectedOrder(order)
    setSelectedRawPayload(payload)
    setIsDialogOpen(true)
  }

  const handleCloseDialog = () => {
    setIsDialogOpen(false)
    setSelectedOrder(null)
    setSelectedRawPayload(null)
  }

  const handleBoxClick = (log: OrderLog, e: React.MouseEvent) => {
    e.stopPropagation() // Prevent row click from opening order dialog
    setBoxConfirmLog(log)
    setIsBoxConfirmOpen(true)
  }

  const handleBoxConfirmClose = () => {
    setIsBoxConfirmOpen(false)
    setBoxConfirmLog(null)
  }

  const handleBoxFeedbackSaved = () => {
    // Refresh the page to get updated box assignments
    window.location.reload()
  }

  if (logs.length === 0) {
    return (
      <div className="bg-white rounded shadow p-6 text-center">
        <p className="text-gray-500">No order logs found</p>
        <p className="text-gray-400 text-sm mt-1">Orders will appear once sent from NetSuite</p>
      </div>
    )
  }

  const Th = ({ columnKey, children }: { columnKey: SortKey; children: React.ReactNode }) => (
    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
      <button
        type="button"
        onClick={() => handleSort(columnKey)}
        className="inline-flex items-center gap-0.5 hover:text-gray-700 focus:outline-none"
      >
        {children}
        {sortKey === columnKey && (
          <span className="text-gray-400">{sortDir === 'asc' ? '↑' : '↓'}</span>
        )}
      </button>
    </th>
  )

  return (
    <>
      {/* Type filter tabs */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {ORDER_TYPE_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setTypeFilter(tab.key)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              typeFilter === tab.key
                ? 'bg-green-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {tab.label}
            <span className={`ml-1.5 text-xs ${typeFilter === tab.key ? 'text-green-100' : 'text-gray-500'}`}>
              {typeCounts[tab.key]}
            </span>
          </button>
        ))}
      </div>

      {/* Compact toolbar: search + pagination in one row */}
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <input
          id="orders-search"
          type="search"
          placeholder="Search order # or customer..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 min-w-[180px] max-w-xs border border-gray-300 rounded px-2 py-1 text-sm placeholder-gray-400 focus:ring-1 focus:ring-green-500 focus:border-green-500"
        />
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span className="hidden sm:inline">Show</span>
          <select
            id="page-size"
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value))
              setPage(1)
            }}
            className="border border-gray-300 rounded px-1.5 py-1 text-sm"
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
        <span className="text-xs text-gray-500">
          {searchQuery.trim() ? `${totalFiltered}/${logs.length}` : `${logs.length} orders`}
        </span>
      </div>

      <div className="bg-white rounded shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <Th columnKey="orderNumber">Order #</Th>
                <Th columnKey="customer">Customer</Th>
                <Th columnKey="items">Items</Th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Box
                </th>
                <Th columnKey="amount">Amount</Th>
                <Th columnKey="orderDate">Order Date</Th>
                <Th columnKey="received">Received</Th>
                <Th columnKey="status">Status</Th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {pageLogs.map((log) => {
                const payload = log.rawPayload as any
                const order = Array.isArray(payload) ? payload[0] : payload
                const itemCount = order?.items?.length || 0
                const customerName = order?.shipTo?.name || order?.billTo?.name || 'N/A'
                const highlightType = getOrderHighlightType(log, orderHighlightSettings)
                // Whole row = solid red or orange; force white text on cells and all descendants (overrides text-gray-*).
                const rowStyle =
                  highlightType === 'red'
                    ? 'bg-[#ff0000] hover:opacity-90 [&_td]:!text-white [&_td_*]:!text-white'
                    : highlightType === 'orange'
                      ? 'bg-[#ff9900] hover:opacity-90 [&_td]:!text-white [&_td_*]:!text-white'
                      : 'hover:bg-blue-50'

                return (
                  <tr
                    key={log.id}
                    onClick={() => handleRowClick(log)}
                    className={`cursor-pointer transition-colors ${rowStyle}`}
                  >
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-sm font-semibold text-gray-900">
                        {order?.orderNumber || log.orderNumber}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{customerName}</div>
                      {order?.shipTo?.city && order?.shipTo?.state && (
                        <div className="text-xs text-gray-500">
                          {order.shipTo.city}, {order.shipTo.state}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {itemCount}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {(() => {
                        const suggestion = log.suggestedBox
                        if (!suggestion) {
                          return (
                            <button
                              onClick={(e) => handleBoxClick(log, e)}
                              className="text-sm text-gray-400 hover:text-gray-600 hover:underline"
                              title="Click to set box"
                            >
                              — Set
                            </button>
                          )
                        }
                        if (!suggestion.boxName) {
                          return (
                            <button
                              onClick={(e) => handleBoxClick(log, e)}
                              className="text-sm text-red-600 font-medium hover:text-red-800 hover:underline"
                              title="Click to set box"
                            >
                              No fit →
                            </button>
                          )
                        }
                        // Confirmed = not clickable
                        if (suggestion.confidence === 'confirmed') {
                          return (
                            <span className="text-sm font-medium text-green-600">
                              {suggestion.boxName}
                            </span>
                          )
                        }
                        // Calculated or Unknown = clickable
                        const colorClass = suggestion.confidence === 'calculated'
                          ? 'text-amber-600 hover:text-amber-800'
                          : 'text-red-600 hover:text-red-800'
                        return (
                          <button
                            onClick={(e) => handleBoxClick(log, e)}
                            className={`text-sm font-medium ${colorClass} hover:underline`}
                            title="Click to confirm or change box"
                          >
                            {suggestion.boxName} →
                          </button>
                        )
                      })()}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                      {order?.amountPaid !== undefined ? formatCurrency(order.amountPaid) : '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                      {order?.orderDate ? new Date(order.orderDate).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                      {new Date(log.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                          highlightType === 'red' || highlightType === 'orange'
                            ? 'bg-black/50 text-white'
                            : 'bg-green-100 text-green-800'
                        }`}
                      >
                        {log.status}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Compact pagination */}
      <div className="mt-2 flex items-center justify-between text-sm">
        <span className="text-gray-500">
          {totalFiltered === 0 ? 'No orders' : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, totalFiltered)} of ${totalFiltered}`}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-2 py-1 border border-gray-300 rounded text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Prev
          </button>
          <span className="px-2 text-gray-600">{page}/{totalPages}</span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-2 py-1 border border-gray-300 rounded text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      </div>

      <OrderDialog
        isOpen={isDialogOpen}
        onClose={handleCloseDialog}
        order={selectedOrder}
        rawPayload={selectedRawPayload}
      />
      {boxConfirmLog && (() => {
        const payload = boxConfirmLog.rawPayload as any
        const order = Array.isArray(payload) ? payload[0] : payload
        const items = (order?.items || []).map((item: any) => ({
          sku: item.sku || 'N/A',
          name: item.name || 'Unknown',
          quantity: item.quantity || 1,
        }))
        return (
          <BoxConfirmDialog
            isOpen={isBoxConfirmOpen}
            onClose={handleBoxConfirmClose}
            orderNumber={order?.orderNumber || boxConfirmLog.orderNumber}
            items={items}
            currentBoxName={boxConfirmLog.suggestedBox?.boxName || null}
            currentConfidence={boxConfirmLog.suggestedBox?.confidence || 'unknown'}
            onFeedbackSaved={handleBoxFeedbackSaved}
          />
        )
      })()}
    </>
  )
}


