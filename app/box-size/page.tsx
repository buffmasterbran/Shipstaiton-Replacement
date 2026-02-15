'use client'

import BoxSizeSpecificTable from '@/components/orders/BoxSizeSpecificTable'
import { useOrders } from '@/context/OrdersContext'

export default function BoxSizePage() {
  const { orders, loading, error } = useOrders()

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Box Size Specific</h1>
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
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Box Size Specific</h1>
        <div className="bg-red-50 text-red-600 p-4 rounded-lg">
          Error loading orders: {error}
        </div>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Box Size Specific</h1>
      <BoxSizeSpecificTable orders={orders} />
    </div>
  )
}
