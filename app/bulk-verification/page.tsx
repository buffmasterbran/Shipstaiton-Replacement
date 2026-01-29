'use client'

import { useState, useEffect } from 'react'
import BulkVerificationDialog from '@/components/BulkVerificationDialog'

const MAX_ORDERS_PER_CHUNK = 24

interface BulkQueueItem {
  id: string
  batchId: string | null
  bulkGroupSignature: string
  chunkIndex: number
  totalChunks: number
  orderNumbers: string[]
  packageInfo: {
    carrier: string
    service: string
    packaging: string
    weight: string
    dimensions: { length: string; width: string; height: string }
  }
  status: string
  createdAt: string
  updatedAt: string
}

export default function BulkVerificationPage() {
  const [items, setItems] = useState<BulkQueueItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const fetchItems = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/bulk-queue?status=PENDING')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load queue')
      setItems(data.items || [])
    } catch (e: any) {
      setError(e?.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchItems()
  }, [])

  const handleStartBulk = (id: string) => {
    setSelectedItemId(id)
    setDialogOpen(true)
  }

  const handleDialogClose = () => {
    setDialogOpen(false)
    setSelectedItemId(null)
  }

  const handleComplete = () => {
    fetchItems()
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Bulk Verification</h1>
      <p className="text-gray-600 mb-6">
        List of bulk packer batches (max {MAX_ORDERS_PER_CHUNK} orders each) sent by Admin. Verify items and print labels.
      </p>

      {loading && <p className="text-gray-500">Loading…</p>}
      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
      {!loading && items.length === 0 && (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <p className="text-gray-500 text-lg">No pending bulk batches</p>
          <p className="text-gray-400 text-sm mt-2">Admin sends bulk groups to the queue from Bulk Orders. Pending items appear here.</p>
        </div>
      )}

      {!loading && items.length > 0 && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Batch ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Chunk
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Orders
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Service
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {items.map((item) => {
                const orderNumbers = (item.orderNumbers || []) as string[]
                const orderCount = orderNumbers.length
                const pkg = item.packageInfo || {}
                return (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-semibold text-gray-900 font-mono">
                        {item.batchId ?? '—'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-600">
                        {item.chunkIndex + 1} of {item.totalChunks}
                      </span>
                      <div className="text-xs text-gray-500 font-mono truncate max-w-[180px]" title={item.bulkGroupSignature}>
                        {item.bulkGroupSignature}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        {orderCount} orders
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {pkg.carrier} {pkg.service}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => handleStartBulk(item.id)}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                      >
                        Start bulk
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <BulkVerificationDialog
        isOpen={dialogOpen}
        onClose={handleDialogClose}
        queueItemId={selectedItemId}
        onComplete={handleComplete}
      />
    </div>
  )
}
