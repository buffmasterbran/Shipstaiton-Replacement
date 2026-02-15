'use client'

import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { PickBatch } from './types'
import { getTypeBadge, getSharedColor, getStatusColor } from './helpers'

function SortableBatchCard({ batch, onDelete, onEditCells, allCells }: {
  batch: PickBatch
  onDelete: (id: string) => void
  onEditCells: (batchId: string, cellIds: string[]) => void
  allCells: { id: string; name: string }[]
}) {
  const [showCellEditor, setShowCellEditor] = useState(false)
  const canDrag = batch.status === 'ACTIVE' || batch.status === 'DRAFT' || batch.status === 'RELEASED'

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: batch.id,
    disabled: !canDrag,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const progress = batch.totalOrders > 0
    ? Math.round((batch.shippedOrders / batch.totalOrders) * 100)
    : 0

  const typeBadge = getTypeBadge(batch.type, batch.isPersonalized)
  const remainingToPick = batch.totalOrders - batch.pickedOrders
  const remainingToShip = batch.pickedOrders - batch.shippedOrders
  const isShared = batch.cellAssignments.length > 1
  const sharedColor = isShared ? getSharedColor(batch.id) : undefined

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        borderLeftColor: sharedColor,
        borderLeftWidth: sharedColor ? '4px' : undefined,
      }}
      className={`bg-white rounded-lg border-2 ${isDragging ? 'border-blue-400 shadow-lg' : 'border-gray-200'} p-3 mb-2`}
    >
      {/* Header: drag handle + name + badges */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {canDrag ? (
            <div
              {...attributes}
              {...listeners}
              className="cursor-grab active:cursor-grabbing p-1 hover:bg-gray-100 rounded"
              title="Drag to reorder"
            >
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
              </svg>
            </div>
          ) : (
            <div className="p-1 w-6" />
          )}
          <span className="font-mono font-medium text-gray-900 text-sm">{batch.name}</span>
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${typeBadge.bg}`}>
            {typeBadge.label}
          </span>
          {isShared && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-700" title="Shared across multiple cells">
              Shared
            </span>
          )}
        </div>
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(batch.status)}`}>
          {batch.status === 'ACTIVE' ? 'Active' : batch.status}
        </span>
      </div>

      {/* Stats: orders + remaining */}
      <div className="grid grid-cols-3 gap-1 text-xs text-gray-600 mb-2">
        <div>
          <span className="text-gray-400">Total:</span> {batch.totalOrders}
        </div>
        <div>
          <span className="text-gray-400">Pick:</span>{' '}
          <span className={remainingToPick > 0 ? 'text-amber-600 font-medium' : 'text-green-600'}>
            {remainingToPick > 0 ? remainingToPick : '✓'}
          </span>
        </div>
        <div>
          <span className="text-gray-400">Ship:</span>{' '}
          <span className={remainingToShip > 0 ? 'text-blue-600 font-medium' : batch.shippedOrders > 0 ? 'text-green-600' : ''}>
            {remainingToShip > 0 ? remainingToShip : batch.shippedOrders > 0 ? '✓' : '—'}
          </span>
        </div>
      </div>

      {/* Engraving stat for personalized */}
      {batch.isPersonalized && (
        <div className="text-xs text-gray-600 mb-2">
          <span className="text-gray-400">Engrave:</span>{' '}
          <span className={batch.pickedOrders - batch.engravedOrders > 0 ? 'text-purple-600 font-medium' : 'text-green-600'}>
            {batch.pickedOrders - batch.engravedOrders > 0
              ? `${batch.pickedOrders - batch.engravedOrders} remaining`
              : batch.engravedOrders > 0 ? '✓' : '—'}
          </span>
        </div>
      )}

      {/* Bulk batches info */}
      {batch.type === 'BULK' && batch.bulkBatches && batch.bulkBatches.length > 0 && (
        <div className="text-xs text-gray-500 mb-2">
          {batch.bulkBatches.length} bulk group{batch.bulkBatches.length !== 1 ? 's' : ''}
        </div>
      )}

      {/* Progress bar */}
      <div className="w-full bg-gray-200 rounded-full h-1.5 mb-2">
        <div
          className="bg-green-500 h-1.5 rounded-full transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        {batch.status === 'IN_PROGRESS' && (
          <span className="text-xs text-yellow-600">Picking in progress</span>
        )}
        {batch.status === 'COMPLETED' && (
          <span className="text-xs text-green-600">Completed</span>
        )}
        {(batch.status === 'ACTIVE' || batch.status === 'DRAFT' || batch.status === 'RELEASED') && (
          <span className="text-xs text-blue-600">Ready for picking</span>
        )}
        <div className="flex items-center gap-1">
          {batch.status !== 'IN_PROGRESS' && batch.status !== 'COMPLETED' && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); setShowCellEditor(!showCellEditor) }}
                className="px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded transition-colors"
                title="Edit cell assignments"
              >
                Cells
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(batch.id) }}
                className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded transition-colors"
              >
                Delete
              </button>
            </>
          )}
        </div>
      </div>

      {/* Cell assignment editor */}
      {showCellEditor && (
        <div className="mt-2 p-2 bg-gray-50 rounded-lg border border-gray-200" onClick={(e) => e.stopPropagation()}>
          <div className="text-xs font-medium text-gray-500 mb-1.5">Assign to cells:</div>
          <div className="flex flex-wrap gap-1.5">
            {allCells.map(cell => {
              const isAssigned = batch.cellAssignments.some(a => a.cellId === cell.id)
              return (
                <button
                  key={cell.id}
                  onClick={() => {
                    const currentIds = batch.cellAssignments.map(a => a.cellId)
                    let newIds: string[]
                    if (isAssigned) {
                      // Don't allow removing the last cell
                      if (currentIds.length <= 1) return
                      newIds = currentIds.filter(id => id !== cell.id)
                    } else {
                      newIds = [...currentIds, cell.id]
                    }
                    onEditCells(batch.id, newIds)
                    setShowCellEditor(false)
                  }}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                    isAssigned
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-600 border border-gray-300 hover:border-blue-400'
                  }`}
                >
                  {cell.name}
                </button>
              )
            })}
          </div>
          {batch.cellAssignments.length <= 1 && (
            <div className="text-xs text-gray-400 mt-1">Click a cell to add. Must have at least 1.</div>
          )}
        </div>
      )}
    </div>
  )
}

// Overlay card for dragging
export function BatchCardOverlay({ batch }: { batch: PickBatch }) {
  const typeBadge = getTypeBadge(batch.type, batch.isPersonalized)
  const isShared = batch.cellAssignments.length > 1
  const sharedColor = isShared ? getSharedColor(batch.id) : undefined
  return (
    <div
      className="bg-white rounded-lg border-2 border-blue-400 shadow-xl p-3 w-72"
      style={{ borderLeftColor: sharedColor, borderLeftWidth: sharedColor ? '4px' : undefined }}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="font-mono font-medium text-gray-900 text-sm">{batch.name}</span>
        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${typeBadge.bg}`}>
          {typeBadge.label}
        </span>
      </div>
      <div className="text-sm text-gray-600">{batch.totalOrders} orders</div>
    </div>
  )
}

export { SortableBatchCard }
