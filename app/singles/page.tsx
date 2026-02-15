'use client'

import { useMemo } from 'react'
import SinglesOrdersTable from '@/components/orders/SinglesOrdersTable'
import { useOrders, isSingleItemOrder } from '@/context/OrdersContext'

export default function SinglesOrdersPage() {
  const { orders, loading, error } = useOrders()

  // Filter to only single-item orders
  const singleItemOrders = useMemo(() => {
    return orders.filter(isSingleItemOrder)
  }, [orders])

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Singles Orders</h1>
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
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Singles Orders</h1>
        <div className="bg-red-50 text-red-600 p-4 rounded-lg">
          Error loading orders: {error}
        </div>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Singles Orders</h1>
      <SinglesOrdersTable orders={singleItemOrders} />
    </div>
  )
}
