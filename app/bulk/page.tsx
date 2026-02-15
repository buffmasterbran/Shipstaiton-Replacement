'use client'

import BulkOrdersTable from '@/components/orders/BulkOrdersTable'
import { useOrders } from '@/context/OrdersContext'

export default function BulkOrdersPage() {
  const { orders, loading, error } = useOrders()

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Bulk Orders</h1>
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
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Bulk Orders</h1>
        <div className="bg-red-50 text-red-600 p-4 rounded-lg">
          Error loading orders: {error}
        </div>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Bulk Orders</h1>
      <BulkOrdersTable orders={orders} />
    </div>
  )
}
