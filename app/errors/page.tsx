'use client'

import { useState, useEffect, useMemo } from 'react'
import { useOrders } from '@/context/OrdersContext'
import OrderDialog from '@/components/OrderDialog'

interface OrderLog {
  id: string
  orderNumber: string
  status: string
  rawPayload: any
  suggestedBox?: any
  orderType?: string
  rateShopStatus?: string
  rateShopError?: string
  preShoppedRate?: any
  createdAt: Date | string
  updatedAt: Date | string
}

export default function ErrorOrdersPage() {
  const { orders, loading, error, refreshOrders } = useOrders()
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null)
  const [selectedRawPayload, setSelectedRawPayload] = useState<any | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [retryingOrder, setRetryingOrder] = useState<string | null>(null)

  // Filter to only show orders with rate shop errors
  const errorOrders = useMemo(() => {
    return orders.filter((order: any) => order.rateShopStatus === 'FAILED')
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
    setIsDialogOpen(true)
  }

  const handleCloseDialog = () => {
    setIsDialogOpen(false)
    setSelectedOrder(null)
    setSelectedRawPayload(null)
  }

  const handleRetryRateShopping = async (orderNumber: string) => {
    setRetryingOrder(orderNumber)
    try {
      // Re-ingest the order to trigger rate shopping again
      const order = orders.find((o: any) => o.orderNumber === orderNumber)
      if (!order) return

      const response = await fetch('/api/ingest-batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-secret': 'internal-retry', // This will fail auth but we need a different approach
        },
        body: JSON.stringify(order.rawPayload),
      })

      // Refresh orders to see updated status
      await refreshOrders()
    } catch (err) {
      console.error('Failed to retry rate shopping:', err)
    } finally {
      setRetryingOrder(null)
    }
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
            Orders where rate shopping failed. Usually due to address issues.
          </p>
          {errorOrders.length > 0 && (
            <p className="text-sm text-red-600 font-medium mt-1">
              {errorOrders.length} order{errorOrders.length !== 1 ? 's' : ''} need attention
            </p>
          )}
        </div>
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
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                          {log.orderType || 'UNKNOWN'}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleRowClick(log)
                          }}
                          className="text-blue-600 hover:text-blue-900 mr-3"
                        >
                          View
                        </button>
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
      />
    </div>
  )
}
