'use client'

import { useState, useEffect } from 'react'
import BulkOrdersTable from '@/components/BulkOrdersTable'
import { useOrders } from '@/context/OrdersContext'

export default function BulkOrdersPage() {
  const { orders, loading, error } = useOrders()
  const [queueStatusBySignature, setQueueStatusBySignature] = useState<
    Record<string, 'pending' | 'in_queue' | 'completed'>
  >({})
  const [queueLoading, setQueueLoading] = useState(true)

  // Fetch queue status (separate from orders since it's only needed here)
  useEffect(() => {
    async function fetchQueueStatus() {
      try {
        const res = await fetch('/api/bulk-queue')
        if (res.ok) {
          const data = await res.json()
          const items = data.items || []

          // Group queue items by signature and derive status
          const bySignature = new Map<string, { pending: number; completed: number }>()
          items.forEach((item: { bulkGroupSignature: string; status: string }) => {
            const cur = bySignature.get(item.bulkGroupSignature) ?? { pending: 0, completed: 0 }
            if (item.status === 'PENDING') cur.pending++
            else if (item.status === 'COMPLETED') cur.completed++
            bySignature.set(item.bulkGroupSignature, cur)
          })

          const statusMap: Record<string, 'pending' | 'in_queue' | 'completed'> = {}
          bySignature.forEach((counts, sig) => {
            if (counts.pending > 0) statusMap[sig] = 'in_queue'
            else if (counts.completed > 0) statusMap[sig] = 'completed'
          })
          setQueueStatusBySignature(statusMap)
        }
      } catch (err) {
        console.error('Error fetching queue status:', err)
      } finally {
        setQueueLoading(false)
      }
    }

    fetchQueueStatus()
  }, [])

  if (loading || queueLoading) {
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
      <BulkOrdersTable orders={orders} queueStatusBySignature={queueStatusBySignature} />
    </div>
  )
}
