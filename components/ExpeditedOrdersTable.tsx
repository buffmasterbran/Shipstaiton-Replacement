'use client'

import { useState, useMemo, useEffect } from 'react'
import OrderDialog from './OrderDialog'

const PAGE_SIZES = [25, 50, 100] as const
const DEFAULT_PAGE_SIZE = 25

// Expedited shipping methods to filter for
const EXPEDITED_SHIPPING_METHODS = [
  'ups next day',
  'ups next day air',
  'ups 2nd day',
  'ups 2nd day air',
  'ups 2 day',
  'ups 2 day air',
  'ups 3 day',
  'ups 3 day select',
  'next day',
  '2nd day',
  '2 day',
  '3 day',
  // Add more variations as needed
]

type SortKey = 'orderNumber' | 'customer' | 'shippingMethod' | 'amount' | 'orderDate' | 'received' | 'customerReachedOut' | 'status'
type SortDir = 'asc' | 'desc'

interface OrderLog {
  id: string
  orderNumber: string
  status: string
  rawPayload: any
  customerReachedOut: boolean
  createdAt: Date
  updatedAt: Date
}

interface ExpeditedOrdersTableProps {
  logs: OrderLog[]
}

function formatCurrency(amount: number | string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(amount))
}

function toCalendarDate(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
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

function getShippingMethod(log: OrderLog): string {
  const payload = log.rawPayload as any
  const order = Array.isArray(payload) ? payload[0] : payload
  return order?.requestedShippingService || order?.shippingMethod || order?.carrierCode || ''
}

function isExpeditedShipping(log: OrderLog): boolean {
  const method = getShippingMethod(log).toLowerCase()
  return EXPEDITED_SHIPPING_METHODS.some(exp => method.includes(exp))
}

export default function ExpeditedOrdersTable({ logs }: ExpeditedOrdersTableProps) {
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('orderDate')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  
  // Local state for "customer reached out" toggles (in production, this would sync to API)
  const [reachedOutOverrides, setReachedOutOverrides] = useState<Record<string, boolean>>({})

  // Filter to only expedited shipping methods OR customer reached out
  const expeditedLogs = useMemo(() => {
    return logs.filter((log) => {
      const isExpedited = isExpeditedShipping(log)
      const reachedOut = reachedOutOverrides[log.id] ?? log.customerReachedOut
      return isExpedited || reachedOut
    })
  }, [logs, reachedOutOverrides])

  const filteredAndSortedLogs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    let list = expeditedLogs
    
    if (q) {
      list = list.filter((log) => {
        const num = getOrderNumber(log).toLowerCase()
        const customer = getCustomerName(log).toLowerCase()
        const shipping = getShippingMethod(log).toLowerCase()
        return num.includes(q) || customer.includes(q) || shipping.includes(q)
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
        case 'shippingMethod':
          cmp = getShippingMethod(a).localeCompare(getShippingMethod(b))
          break
        case 'amount':
          cmp = getAmount(a) - getAmount(b)
          break
        case 'orderDate':
          cmp = getOrderDate(a).getTime() - getOrderDate(b).getTime()
          break
        case 'received':
          cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          break
        case 'customerReachedOut': {
          const ra = reachedOutOverrides[a.id] ?? a.customerReachedOut
          const rb = reachedOutOverrides[b.id] ?? b.customerReachedOut
          cmp = (ra ? 1 : 0) - (rb ? 1 : 0)
          break
        }
        case 'status':
          cmp = (a.status ?? '').localeCompare(b.status ?? '')
          break
        default:
          break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [expeditedLogs, searchQuery, sortKey, sortDir, reachedOutOverrides])

  const totalFiltered = filteredAndSortedLogs.length
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize))
  const pageLogs = useMemo(
    () => filteredAndSortedLogs.slice((page - 1) * pageSize, page * pageSize),
    [filteredAndSortedLogs, page, pageSize]
  )

  useEffect(() => {
    setPage(1)
  }, [searchQuery, sortKey, sortDir])

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
    setIsDialogOpen(true)
  }

  const handleCloseDialog = () => {
    setIsDialogOpen(false)
    setSelectedOrder(null)
  }

  const toggleReachedOut = async (log: OrderLog, e: React.MouseEvent) => {
    e.stopPropagation() // Don't open the row dialog
    const currentValue = reachedOutOverrides[log.id] ?? log.customerReachedOut
    const newValue = !currentValue
    
    // Optimistically update UI
    setReachedOutOverrides((prev) => ({ ...prev, [log.id]: newValue }))
    
    try {
      const res = await fetch('/api/orders/customer-reached-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: log.id, reachedOut: newValue }),
      })
      
      if (!res.ok) {
        throw new Error('API request failed')
      }
    } catch (error) {
      console.error('Failed to update customer reached out status:', error)
      // Revert on error
      setReachedOutOverrides((prev) => ({ ...prev, [log.id]: currentValue }))
    }
  }

  // Count stats
  const stats = useMemo(() => {
    let reachedOutCount = 0
    expeditedLogs.forEach((log) => {
      if (reachedOutOverrides[log.id] ?? log.customerReachedOut) {
        reachedOutCount++
      }
    })
    return {
      total: expeditedLogs.length,
      reachedOut: reachedOutCount,
      expeditedShipping: expeditedLogs.length - reachedOutCount,
    }
  }, [expeditedLogs, reachedOutOverrides])

  if (expeditedLogs.length === 0) {
    return (
      <div className="bg-white rounded shadow p-6 text-center">
        <p className="text-gray-500">No expedited orders found</p>
        <p className="text-gray-400 text-sm mt-1">
          Orders with UPS Next Day, 2 Day, or 3 Day shipping will appear here.
          <br />
          Orders marked as "Customer Reached Out" will also appear here.
        </p>
      </div>
    )
  }

  const Th = ({ columnKey, children }: { columnKey: SortKey; children: React.ReactNode }) => (
    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
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
      {/* Stats badges */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
          Total: {stats.total}
        </span>
        <span className="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium bg-orange-100 text-orange-800">
          Customer Reached Out: {stats.reachedOut}
        </span>
        <span className="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium bg-purple-100 text-purple-800">
          Expedited Shipping: {stats.expeditedShipping}
        </span>
      </div>

      {/* Toolbar */}
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <input
          id="expedited-search"
          type="search"
          placeholder="Search order #, customer, or shipping..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 min-w-[200px] max-w-md border border-gray-300 rounded px-2 py-1 text-sm placeholder-gray-400 focus:ring-1 focus:ring-green-500 focus:border-green-500"
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
          {totalFiltered} orders
        </span>
      </div>

      {/* Table */}
      <div className="bg-white rounded shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <Th columnKey="orderNumber">Order #</Th>
                <Th columnKey="customer">Customer</Th>
                <Th columnKey="shippingMethod">Shipping Method</Th>
                <Th columnKey="amount">Amount</Th>
                <Th columnKey="orderDate">Order Date</Th>
                <Th columnKey="received">Received</Th>
                <Th columnKey="customerReachedOut">Customer Reached Out</Th>
                <Th columnKey="status">Status</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pageLogs.map((log) => {
                const payload = log.rawPayload as any
                const order = Array.isArray(payload) ? payload[0] : payload
                const customerName = order?.shipTo?.name || order?.billTo?.name || 'N/A'
                const shippingMethod = getShippingMethod(log)
                const reachedOut = reachedOutOverrides[log.id] ?? log.customerReachedOut

                return (
                  <tr
                    key={log.id}
                    onClick={() => handleRowClick(log)}
                    className={`cursor-pointer transition-colors ${
                      reachedOut
                        ? 'bg-orange-50 hover:bg-orange-100'
                        : 'hover:bg-blue-50'
                    }`}
                  >
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="text-sm font-semibold text-gray-900">
                        {order?.orderNumber || log.orderNumber}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{customerName}</div>
                      {order?.shipTo?.city && order?.shipTo?.state && (
                        <div className="text-xs text-gray-500">
                          {order.shipTo.city}, {order.shipTo.state}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                        {shippingMethod || 'N/A'}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900">
                      {order?.amountPaid !== undefined ? formatCurrency(order.amountPaid) : '—'}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">
                      {order?.orderDate ? new Date(order.orderDate).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">
                      {new Date(log.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={(e) => toggleReachedOut(log, e)}
                        className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                          reachedOut
                            ? 'bg-orange-500 text-white hover:bg-orange-600'
                            : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                        }`}
                      >
                        {reachedOut ? 'Yes' : 'No'}
                      </button>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
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

      {/* Pagination */}
      <div className="mt-3 flex items-center justify-between text-sm">
        <span className="text-gray-600">
          {totalFiltered === 0
            ? 'No orders'
            : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, totalFiltered)} of ${totalFiltered}`}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-2 py-1 border border-gray-300 rounded text-xs hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Prev
          </button>
          <span className="text-gray-500">{page}/{totalPages}</span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-2 py-1 border border-gray-300 rounded text-xs hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      </div>

      {/* Order Dialog */}
      <OrderDialog order={selectedOrder} isOpen={isDialogOpen} onClose={handleCloseDialog} />
    </>
  )
}
