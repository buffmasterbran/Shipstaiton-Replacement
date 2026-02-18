'use client'

import { useState, useMemo, useCallback } from 'react'
import { useOrders, type OrderLog } from '@/context/OrdersContext'
import OrderDialog from '@/components/dialogs/OrderDialog'

function getErrorHint(error: string | null | undefined): string | null {
  if (!error) return null
  const lower = error.toLowerCase()
  if (lower.includes('carrier_id') || lower.includes('carrier')) {
    return 'Carrier ID may be invalid or stale. Try editing the carrier assignment.'
  }
  if (lower.includes('address') || lower.includes('postal') || lower.includes('missing required')) {
    return 'Address may be incomplete or invalid. Try editing the shipping address.'
  }
  if (lower.includes('box') || lower.includes('no box')) {
    return 'No box suggestion available. Check Products and Box Config.'
  }
  if (lower.includes('no rates') || lower.includes('no services')) {
    return 'No rates returned for selected services. Try editing the carrier or check Rate Shopping config.'
  }
  return null
}

export default function ErrorOrdersPage() {
  const { orders, loading, error, refreshOrders, updateOrderInPlace } = useOrders()
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null)
  const [selectedRawPayload, setSelectedRawPayload] = useState<any | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [viewedLog, setViewedLog] = useState<OrderLog | null>(null)

  // Retry state
  const [retryingId, setRetryingId] = useState<string | null>(null)

  // Bulk retry state
  const [bulkRetrying, setBulkRetrying] = useState(false)
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null)

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Filter to only show orders with rate shop errors (excluding held orders)
  const errorOrders = useMemo(() => {
    return orders.filter((order: any) =>
      order.rateShopStatus === 'FAILED' && order.status !== 'ON_HOLD'
    )
  }, [orders])

  const handleRowClick = (log: OrderLog) => {
    const payload = log.rawPayload as any
    const order = Array.isArray(payload) ? payload[0] : payload
    setSelectedOrder({
      orderNumber: log.orderNumber,
      orderKey: log.orderNumber,
      ...order,
    })
    setSelectedRawPayload(log.rawPayload)
    setViewedLog(log)
    setIsDialogOpen(true)
  }

  const handleCloseDialog = () => {
    setIsDialogOpen(false)
    setSelectedOrder(null)
    setSelectedRawPayload(null)
    setViewedLog(null)
  }

  const handleOrderSaved = useCallback((updatedOrder: any) => {
    if (updatedOrder?.id) updateOrderInPlace(updatedOrder.id, updatedOrder as Partial<OrderLog>)
  }, [updateOrderInPlace])

  const handleRetry = async (log: OrderLog, e: React.MouseEvent) => {
    e.stopPropagation()
    setRetryingId(log.id)
    try {
      const res = await fetch(`/api/orders/${log.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ retryRateShopping: true }),
      })
      const data = await res.json()
      if (res.ok && data.order) {
        updateOrderInPlace(data.order.id, data.order as Partial<OrderLog>)
      } else {
        alert(data.error || 'Retry failed')
      }
    } catch (err) {
      console.error('Failed to retry rate shopping:', err)
      alert('Failed to retry rate shopping')
    } finally {
      setRetryingId(null)
    }
  }

  const handleDelete = async (log: OrderLog, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm(`Delete order ${log.orderNumber}? This cannot be undone.`)) return
    setDeletingId(log.id)
    try {
      const res = await fetch('/api/orders', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIds: [log.id] }),
      })
      if (res.ok) {
        refreshOrders()
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to delete order')
      }
    } catch (err) {
      console.error('Error deleting order:', err)
      alert('Failed to delete order')
    } finally {
      setDeletingId(null)
    }
  }

  const handleBulkRetry = async () => {
    if (bulkRetrying || errorOrders.length === 0) return
    if (!confirm(`Re-run ingest for all ${errorOrders.length} error orders?`)) return
    setBulkRetrying(true)
    setBulkProgress({ done: 0, total: errorOrders.length })
    for (let i = 0; i < errorOrders.length; i++) {
      try {
        const res = await fetch(`/api/orders/${errorOrders[i].id}/reingest`, { method: 'POST' })
        const data = await res.json()
        if (data.order) updateOrderInPlace(data.order.id, data.order as Partial<OrderLog>)
      } catch (e) { console.error(`Bulk reingest error for ${errorOrders[i].orderNumber}:`, e) }
      setBulkProgress({ done: i + 1, total: errorOrders.length })
    }
    setBulkRetrying(false)
    setBulkProgress(null)
    refreshOrders()
  }

  if (loading) {
    return (
      <div>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Error Orders</h1>
            <p className="text-sm text-gray-500 mt-1">
              Orders where rate shopping failed. Review and resolve issues.
            </p>
          </div>
        </div>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600"></div>
          <span className="ml-3 text-gray-600">Loading orders...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Error Orders</h1>
          </div>
        </div>
        <div className="bg-red-50 text-red-600 p-4 rounded-lg">
          Error loading orders: {error}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Error Orders</h1>
          <p className="text-sm text-gray-500 mt-1">
            Orders where rate shopping failed. Edit to fix issues or retry rate shopping.
          </p>
          {errorOrders.length > 0 && (
            <p className="text-sm text-red-600 font-medium mt-1">
              {errorOrders.length} order{errorOrders.length !== 1 ? 's' : ''} need attention
            </p>
          )}
        </div>
        {errorOrders.length > 0 && (
          <button
            onClick={handleBulkRetry}
            disabled={bulkRetrying}
            className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-semibold hover:bg-purple-700 disabled:opacity-60 transition-colors"
          >
            {bulkRetrying ? (
              <>
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                Re-ingesting {bulkProgress?.done}/{bulkProgress?.total}...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" /></svg>
                Retry All ({errorOrders.length})
              </>
            )}
          </button>
        )}
      </div>

      {errorOrders.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <div className="text-green-500 mb-4">
            <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-gray-500 text-lg">No error orders</p>
          <p className="text-gray-400 text-sm mt-2">
            All orders have been rate shopped successfully
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Order
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ship To
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Error
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Order Type
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {errorOrders.map((log: any) => {
                  const payload = log.rawPayload as any
                  const order = Array.isArray(payload) ? payload[0] : payload
                  const shipTo = order?.shipTo || {}
                  const customerName = shipTo.name || order?.billTo?.name || 'Unknown'
                  const address = [
                    shipTo.city,
                    shipTo.state,
                    shipTo.postalCode,
                  ].filter(Boolean).join(', ')
                  const hint = getErrorHint(log.rateShopError)

                  return (
                    <tr
                      key={log.id}
                      className="hover:bg-red-50 cursor-pointer border-l-4 border-red-500"
                      onClick={() => handleRowClick(log)}
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {log.orderNumber}
                        </div>
                        <div className="text-xs text-gray-500">
                          {new Date(log.createdAt).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{customerName}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{address || 'No address'}</div>
                        <div className="text-xs text-gray-500">
                          {shipTo.street1 || 'Missing street'}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-red-600 font-medium max-w-xs truncate" title={log.rateShopError || 'Unknown error'}>
                          {log.rateShopError || 'Unknown error'}
                        </div>
                        {hint && (
                          <div className="text-xs text-gray-500 mt-1 max-w-xs truncate" title={hint}>
                            {hint}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                          {log.orderType || 'UNKNOWN'}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end gap-1">
                          {/* View & Edit */}
                          <button
                            onClick={(e) => { e.stopPropagation(); handleRowClick(log) }}
                            className="p-1.5 rounded text-blue-600 hover:bg-blue-100 transition-colors"
                            title="View & Edit"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          {/* Retry Rate Shopping */}
                          <button
                            onClick={(e) => handleRetry(log, e)}
                            disabled={retryingId === log.id}
                            className="p-1.5 rounded text-green-600 hover:bg-green-100 transition-colors disabled:opacity-50"
                            title="Retry Rate Shopping"
                          >
                            {retryingId === log.id ? (
                              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                              </svg>
                            ) : (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                            )}
                          </button>
                          {/* Delete */}
                          <button
                            onClick={(e) => handleDelete(log, e)}
                            disabled={deletingId === log.id}
                            className="p-1.5 rounded text-red-500 hover:bg-red-100 transition-colors disabled:opacity-50"
                            title="Delete order"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <OrderDialog
        isOpen={isDialogOpen}
        onClose={handleCloseDialog}
        order={selectedOrder}
        rawPayload={selectedRawPayload}
        orderLog={viewedLog}
        onSaved={handleOrderSaved}
      />
    </div>
  )
}
