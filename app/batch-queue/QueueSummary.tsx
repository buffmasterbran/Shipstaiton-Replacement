'use client'

import { useMemo } from 'react'
import type { PickBatch } from './types'

export function QueueSummary({ batches }: { batches: PickBatch[] }) {
  const stats = useMemo(() => {
    const activeBatches = batches.filter(b => b.status !== 'COMPLETED')
    const totalOrders = activeBatches.reduce((sum, b) => sum + b.totalOrders, 0)
    const totalPicked = activeBatches.reduce((sum, b) => sum + b.pickedOrders, 0)
    const totalShipped = activeBatches.reduce((sum, b) => sum + b.shippedOrders, 0)
    const awaitingPick = totalOrders - totalPicked
    const awaitingShip = totalPicked - totalShipped

    // By type (deduplicate shared batches)
    const uniqueBatches = new Map<string, PickBatch>()
    activeBatches.forEach(b => uniqueBatches.set(b.id, b))
    
    let singlesOrders = 0, bulkOrders = 0, obsOrders = 0, personalizedOrders = 0
    uniqueBatches.forEach(b => {
      if (b.isPersonalized) personalizedOrders += b.totalOrders
      else if (b.type === 'SINGLES') singlesOrders += b.totalOrders
      else if (b.type === 'BULK') bulkOrders += b.totalOrders
      else obsOrders += b.totalOrders
    })

    return {
      totalOrders, awaitingPick, awaitingShip, totalShipped,
      singlesOrders, bulkOrders, obsOrders, personalizedOrders,
    }
  }, [batches])

  return (
    <div className="bg-white rounded-lg shadow p-4 mb-6">
      <h3 className="font-semibold text-gray-900 mb-3">Queue Summary</h3>
      <div className="grid grid-cols-4 gap-4 mb-3">
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-900">{stats.totalOrders}</div>
          <div className="text-xs text-gray-500">Total Orders</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-amber-600">{stats.awaitingPick}</div>
          <div className="text-xs text-gray-500">Awaiting Pick</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-blue-600">{stats.awaitingShip}</div>
          <div className="text-xs text-gray-500">Awaiting Ship</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-green-600">{stats.totalShipped}</div>
          <div className="text-xs text-gray-500">Shipped</div>
        </div>
      </div>
      <div className="flex gap-4 text-xs text-gray-600 border-t pt-3">
        {stats.singlesOrders > 0 && (
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            Singles: {stats.singlesOrders}
          </span>
        )}
        {stats.bulkOrders > 0 && (
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-orange-500" />
            Bulk: {stats.bulkOrders}
          </span>
        )}
        {stats.obsOrders > 0 && (
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-teal-500" />
            Order by Size: {stats.obsOrders}
          </span>
        )}
        {stats.personalizedOrders > 0 && (
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-purple-500" />
            Personalized: {stats.personalizedOrders}
          </span>
        )}
      </div>
    </div>
  )
}
