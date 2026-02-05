'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface PickCell {
  id: string
  name: string
  active: boolean
}

interface PickBatch {
  id: string
  name: string
  cellId: string
  status: 'DRAFT' | 'RELEASED' | 'IN_PROGRESS' | 'COMPLETED'
  priority: number
  totalOrders: number
  pickedOrders: number
  shippedOrders: number
  createdAt: string
  releasedAt: string | null
  completedAt: string | null
  cell: PickCell
  _count: {
    orders: number
    chunks: number
  }
}

// Sortable batch card component
function SortableBatchCard({ batch, onRelease, onDelete }: { 
  batch: PickBatch
  onRelease: (id: string) => void
  onDelete: (id: string) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: batch.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const progress = batch.totalOrders > 0 
    ? Math.round((batch.shippedOrders / batch.totalOrders) * 100) 
    : 0

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'DRAFT': return 'bg-gray-100 text-gray-700'
      case 'RELEASED': return 'bg-blue-100 text-blue-700'
      case 'IN_PROGRESS': return 'bg-yellow-100 text-yellow-700'
      case 'COMPLETED': return 'bg-green-100 text-green-700'
      default: return 'bg-gray-100 text-gray-700'
    }
  }

  const isOversized = batch.name.startsWith('O-')

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white rounded-lg border-2 ${isDragging ? 'border-blue-400 shadow-lg' : 'border-gray-200'} p-3 mb-2`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-1 hover:bg-gray-100 rounded"
          >
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
            </svg>
          </div>
          <span className="font-mono font-medium text-gray-900">{batch.name}</span>
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
            isOversized ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
          }`}>
            {isOversized ? 'Oversized' : 'Standard'}
          </span>
        </div>
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(batch.status)}`}>
          {batch.status}
        </span>
      </div>

      <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
        <span>{batch._count.orders} orders</span>
        <span>{batch.shippedOrders}/{batch.totalOrders} shipped</span>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
        <div
          className="bg-green-500 h-2 rounded-full transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {batch.status === 'DRAFT' && (
          <>
            <button
              onClick={() => onRelease(batch.id)}
              className="flex-1 px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            >
              Release
            </button>
            <button
              onClick={() => onDelete(batch.id)}
              className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded transition-colors"
            >
              Delete
            </button>
          </>
        )}
        {batch.status === 'RELEASED' && (
          <span className="text-xs text-blue-600">Ready for picking</span>
        )}
        {batch.status === 'IN_PROGRESS' && (
          <span className="text-xs text-yellow-600">Picking in progress</span>
        )}
        {batch.status === 'COMPLETED' && (
          <span className="text-xs text-green-600">Completed</span>
        )}
      </div>
    </div>
  )
}

// Batch card for drag overlay
function BatchCardOverlay({ batch }: { batch: PickBatch }) {
  const isOversized = batch.name.startsWith('O-')

  return (
    <div className="bg-white rounded-lg border-2 border-blue-400 shadow-xl p-3 w-64">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="font-mono font-medium text-gray-900">{batch.name}</span>
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
            isOversized ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
          }`}>
            {isOversized ? 'Oversized' : 'Standard'}
          </span>
        </div>
      </div>
      <div className="text-sm text-gray-600">
        {batch._count.orders} orders
      </div>
    </div>
  )
}

// Cell column component
function CellColumn({ 
  cell, 
  batches, 
  onRelease, 
  onDelete,
  isOver,
}: { 
  cell: PickCell
  batches: PickBatch[]
  onRelease: (id: string) => void
  onDelete: (id: string) => void
  isOver: boolean
}) {
  return (
    <div className={`flex-1 min-w-[280px] max-w-[350px] bg-gray-50 rounded-lg p-4 ${
      isOver ? 'ring-2 ring-blue-400 bg-blue-50' : ''
    }`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900">{cell.name}</h3>
        <span className="text-sm text-gray-500">{batches.length} batches</span>
      </div>
      
      <SortableContext items={batches.map(b => b.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2 min-h-[200px]">
          {batches.length === 0 ? (
            <div className="text-center text-gray-400 py-8 border-2 border-dashed border-gray-300 rounded-lg">
              <p>No batches</p>
              <p className="text-xs mt-1">Drag batches here</p>
            </div>
          ) : (
            batches.map((batch) => (
              <SortableBatchCard 
                key={batch.id} 
                batch={batch} 
                onRelease={onRelease}
                onDelete={onDelete}
              />
            ))
          )}
        </div>
      </SortableContext>
    </div>
  )
}

export default function BatchQueuePage() {
  const [cells, setCells] = useState<PickCell[]>([])
  const [batches, setBatches] = useState<PickBatch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeBatch, setActiveBatch] = useState<PickBatch | null>(null)
  const [overCellId, setOverCellId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [cellsRes, batchesRes] = await Promise.all([
        fetch('/api/cells'),
        fetch('/api/batches'),
      ])

      if (!cellsRes.ok || !batchesRes.ok) {
        throw new Error('Failed to fetch data')
      }

      const cellsData = await cellsRes.json()
      const batchesData = await batchesRes.json()

      setCells((cellsData.cells || []).filter((c: PickCell) => c.active))
      setBatches(batchesData.batches || [])
    } catch (err: any) {
      setError(err.message || 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Get batches for a specific cell, sorted by priority
  const getBatchesForCell = (cellId: string) => {
    return batches
      .filter(b => b.cellId === cellId)
      .sort((a, b) => a.priority - b.priority)
  }

  // Handle drag start
  const handleDragStart = (event: DragStartEvent) => {
    const batch = batches.find(b => b.id === event.active.id)
    if (batch) {
      setActiveBatch(batch)
    }
  }

  // Handle drag over
  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event
    if (over) {
      // Check if we're over a cell
      const overBatch = batches.find(b => b.id === over.id)
      if (overBatch) {
        setOverCellId(overBatch.cellId)
      }
    } else {
      setOverCellId(null)
    }
  }

  // Handle drag end
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveBatch(null)
    setOverCellId(null)

    if (!over) return

    const activeBatchData = batches.find(b => b.id === active.id)
    const overBatchData = batches.find(b => b.id === over.id)

    if (!activeBatchData) return

    // Determine target cell and position
    let targetCellId = activeBatchData.cellId
    let newPriority = activeBatchData.priority

    if (overBatchData) {
      targetCellId = overBatchData.cellId
      const cellBatches = getBatchesForCell(targetCellId)
      const overIndex = cellBatches.findIndex(b => b.id === over.id)
      
      if (activeBatchData.cellId === targetCellId) {
        // Same cell - reorder
        const activeIndex = cellBatches.findIndex(b => b.id === active.id)
        if (activeIndex !== overIndex) {
          newPriority = overBatchData.priority
        } else {
          return // No change needed
        }
      } else {
        // Different cell - move
        newPriority = overIndex
      }
    }

    // Optimistically update UI
    const updatedBatches = batches.map(b => {
      if (b.id === active.id) {
        return { ...b, cellId: targetCellId, priority: newPriority }
      }
      return b
    })
    setBatches(updatedBatches)

    // Send update to server
    try {
      const res = await fetch('/api/batches/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchId: active.id,
          newCellId: targetCellId !== activeBatchData.cellId ? targetCellId : undefined,
          newPriority,
        }),
      })

      if (!res.ok) {
        throw new Error('Failed to reorder')
      }

      // Refresh to get accurate state
      fetchData()
    } catch (err) {
      console.error('Failed to reorder batch:', err)
      // Revert on error
      fetchData()
    }
  }

  // Release a batch
  const handleRelease = async (batchId: string) => {
    try {
      const res = await fetch('/api/batches', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: batchId,
          status: 'RELEASED',
        }),
      })

      if (!res.ok) {
        throw new Error('Failed to release batch')
      }

      fetchData()
    } catch (err) {
      console.error('Failed to release batch:', err)
    }
  }

  // Delete a batch
  const handleDelete = async (batchId: string) => {
    if (!confirm('Are you sure you want to delete this batch? Orders will be returned to unassigned.')) {
      return
    }

    try {
      const res = await fetch(`/api/batches?id=${batchId}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        throw new Error('Failed to delete batch')
      }

      fetchData()
    } catch (err) {
      console.error('Failed to delete batch:', err)
    }
  }

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Batch Queue</h1>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
          <span className="ml-3 text-gray-600">Loading...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Batch Queue</h1>
        <div className="bg-red-50 text-red-600 p-4 rounded-lg">
          Error: {error}
        </div>
      </div>
    )
  }

  if (cells.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Batch Queue</h1>
        <div className="bg-amber-50 text-amber-700 p-4 rounded-lg">
          <p className="font-medium">No active cells found</p>
          <p className="text-sm mt-1">
            Create picking cells in Settings before managing batches.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Batch Queue</h1>
        <button
          onClick={fetchData}
          className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      <p className="text-gray-500 mb-6">
        Drag batches to reorder within a cell or move between cells. Release batches to make them available for picking.
      </p>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4">
          {cells.map((cell) => (
            <CellColumn
              key={cell.id}
              cell={cell}
              batches={getBatchesForCell(cell.id)}
              onRelease={handleRelease}
              onDelete={handleDelete}
              isOver={overCellId === cell.id}
            />
          ))}
        </div>

        <DragOverlay>
          {activeBatch ? <BatchCardOverlay batch={activeBatch} /> : null}
        </DragOverlay>
      </DndContext>

      {/* Summary */}
      <div className="mt-6 bg-white rounded-lg shadow p-4">
        <h3 className="font-semibold text-gray-900 mb-3">Queue Summary</h3>
        <div className="grid grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">
              {batches.filter(b => b.status === 'DRAFT').length}
            </div>
            <div className="text-sm text-gray-500">Draft</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">
              {batches.filter(b => b.status === 'RELEASED').length}
            </div>
            <div className="text-sm text-gray-500">Released</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-600">
              {batches.filter(b => b.status === 'IN_PROGRESS').length}
            </div>
            <div className="text-sm text-gray-500">In Progress</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {batches.filter(b => b.status === 'COMPLETED').length}
            </div>
            <div className="text-sm text-gray-500">Completed</div>
          </div>
        </div>
      </div>
    </div>
  )
}
