'use client'

import { useState } from 'react'
import OrderDialog from './OrderDialog'

interface OrderLog {
  id: string
  orderNumber: string
  status: string
  rawPayload: any
  createdAt: Date
  updatedAt: Date
}

interface OrdersTableProps {
  logs: OrderLog[]
}

function formatCurrency(amount: number | string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(amount))
}

/** Late = not shipped and (ship-by date passed, or order date is 1+ days ago). Similar to NS saved search. */
function isOrderLate(log: OrderLog): boolean {
  const status = (log.status || '').toUpperCase()
  if (status === 'SHIPPED') return false

  const payload = log.rawPayload as any
  const order = Array.isArray(payload) ? payload[0] : payload
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const shipBy = order?.shipByDate ? new Date(order.shipByDate) : null
  if (shipBy) {
    shipBy.setHours(0, 0, 0, 0)
    return shipBy < today
  }

  const orderDate = order?.orderDate ? new Date(order.orderDate) : new Date(log.createdAt)
  orderDate.setHours(0, 0, 0, 0)
  const oneDayAgo = new Date(today)
  oneDayAgo.setDate(oneDayAgo.getDate() - 1)
  return orderDate <= oneDayAgo
}

export default function OrdersTable({ logs }: OrdersTableProps) {
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)

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

  if (logs.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-12 text-center">
        <p className="text-gray-500 text-lg">No order logs found</p>
        <p className="text-gray-400 text-sm mt-2">
          Orders will appear here once they're sent from NetSuite
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Order #
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Customer
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Items
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Order Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Received
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {logs.map((log) => {
                const payload = log.rawPayload as any
                const order = Array.isArray(payload) ? payload[0] : payload
                const itemCount = order?.items?.length || 0
                const customerName = order?.shipTo?.name || order?.billTo?.name || 'N/A'
                const late = isOrderLate(log)

                return (
                  <tr
                    key={log.id}
                    onClick={() => handleRowClick(log)}
                    className={`cursor-pointer transition-colors ${
                      late ? 'bg-amber-50 hover:bg-amber-100 border-l-4 border-l-amber-500' : 'hover:bg-blue-50'
                    }`}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-semibold text-gray-900">
                        {order?.orderNumber || log.orderNumber}
                      </div>
                      {order?.orderKey && (
                        <div className="text-xs text-gray-500">{order.orderKey}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{customerName}</div>
                      {order?.shipTo?.city && order?.shipTo?.state && (
                        <div className="text-xs text-gray-500">
                          {order.shipTo.city}, {order.shipTo.state}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {itemCount} {itemCount === 1 ? 'item' : 'items'}
                      </div>
                      {order?.items && order.items.length > 0 && (
                        <div className="text-xs text-gray-500">
                          {order.items
                            .slice(0, 2)
                            .map((item: any) => item.sku || 'N/A')
                            .join(', ')}
                          {order.items.length > 2 && '...'}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {order?.amountPaid !== undefined
                          ? formatCurrency(order.amountPaid)
                          : 'N/A'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {order?.orderDate
                        ? new Date(order.orderDate).toLocaleDateString()
                        : 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(log.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {late && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-200 text-amber-900" title="Past ship-by or order date, not yet shipped">
                            Late
                          </span>
                        )}
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${late ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'}`}>
                          {log.status}
                        </span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <OrderDialog
        isOpen={isDialogOpen}
        onClose={handleCloseDialog}
        order={selectedOrder}
      />
    </>
  )
}


