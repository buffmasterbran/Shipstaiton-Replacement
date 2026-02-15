'use client'

import ExpeditedOrdersTable from '@/components/orders/ExpeditedOrdersTable'
import { useOrders } from '@/context/OrdersContext'

export default function ExpeditedOrdersPage() {
  const { orders, loading, error } = useOrders()

  if (loading) {
    return (
      <div>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Expedited Orders</h1>
            <p className="text-sm text-gray-500 mt-1">
              Orders with UPS Next Day, 2 Day, or 3 Day shipping. Also shows orders where the customer has reached out.
            </p>
          </div>
        </div>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
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
            <h1 className="text-2xl font-bold text-gray-900">Expedited Orders</h1>
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
          <h1 className="text-2xl font-bold text-gray-900">Expedited Orders</h1>
          <p className="text-sm text-gray-500 mt-1">
            Orders with UPS Next Day, 2 Day, or 3 Day shipping. Also shows orders where the customer has reached out.
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            Click &quot;Customer Reached Out&quot; to mark an order as priority - it will be shipped ASAP.
          </p>
        </div>
      </div>

      <ExpeditedOrdersTable logs={orders} />
    </div>
  )
}
