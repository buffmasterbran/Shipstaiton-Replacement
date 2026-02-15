'use client'

import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { PickCell, PickBatch } from './types'
import { SortableBatchCard } from './SortableBatchCard'

export function CellColumn({
  cell,
  batches,
  onDelete,
  onEditCells,
  allCells,
}: {
  cell: PickCell
  batches: PickBatch[]
  onDelete: (id: string) => void
  onEditCells: (batchId: string, cellIds: string[]) => void
  allCells: { id: string; name: string }[]
}) {
  const totalOrders = batches.reduce((sum, b) => sum + b.totalOrders, 0)
  const totalRemaining = batches.reduce((sum, b) => sum + (b.totalOrders - b.shippedOrders), 0)

  return (
    <div className="flex-1 min-w-[300px] max-w-[380px] bg-gray-50 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-semibold text-gray-900">{cell.name}</h3>
          <p className="text-xs text-gray-500">{batches.length} batches &middot; {totalOrders} orders ({totalRemaining} remaining)</p>
        </div>
      </div>

      <SortableContext items={batches.map(b => b.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2 min-h-[200px]">
          {batches.length === 0 ? (
            <div className="text-center text-gray-400 py-8 border-2 border-dashed border-gray-300 rounded-lg">
              <p>No batches</p>
              <p className="text-xs mt-1">Push batches from admin tabs</p>
            </div>
          ) : (
            batches.map((batch) => (
              <SortableBatchCard
                key={batch.id}
                batch={batch}
                onDelete={onDelete}
                onEditCells={onEditCells}
                allCells={allCells}
              />
            ))
          )}
        </div>
      </SortableContext>
    </div>
  )
}
