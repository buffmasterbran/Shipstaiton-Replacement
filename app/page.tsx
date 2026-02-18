'use client'

import { Suspense, useState, useEffect } from 'react'
import OrdersTable from '@/components/orders/OrdersTable'
import { useOrders } from '@/context/OrdersContext'

interface OrderHighlightSettings {
  orangeMinDays: number
  orangeMaxDays: number
  redMinDays: number
}

export default function AllOrdersPage() {
  const { orders, loading, error } = useOrders()
  const [orderHighlightSettings, setOrderHighlightSettings] = useState<OrderHighlightSettings | null>(null)

  // Fetch highlight settings (separate from orders)
  useEffect(() => {
    async function fetchSettings() {
      try {
        const res = await fetch('/api/settings')
        if (res.ok) {
          const data = await res.json()
          setOrderHighlightSettings(data.order_highlight || null)
        }
      } catch (err) {
        console.error('Error fetching settings:', err)
      }
    }
    fetchSettings()
  }, [])

  if (loading) {
    return (
      <div>
        <div className="flex items-center justify-between gap-3 mb-3">
          <h1 className="text-xl font-bold text-gray-900 whitespace-nowrap">All Orders</h1>
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
        <div className="flex items-center justify-between gap-3 mb-3">
          <h1 className="text-xl font-bold text-gray-900 whitespace-nowrap">All Orders</h1>
        </div>
        <div className="bg-red-50 text-red-600 p-4 rounded-lg">
          Error loading orders: {error}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3">
        <h1 className="text-xl font-bold text-gray-900 whitespace-nowrap">All Orders</h1>
      </div>

      <Suspense fallback={null}>
        <OrdersTable logs={orders} orderHighlightSettings={orderHighlightSettings} />
      </Suspense>
    </div>
  )
}
