'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
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
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { PickCell, CellAssignment, BulkBatchInfo, PickBatch } from './types'
import { getTypeBadge, getSharedColor, getStatusColor } from './helpers'
import { SortableBatchCard, BatchCardOverlay } from './SortableBatchCard'
import { CellColumn } from './CellColumn'
import { QueueSummary } from './QueueSummary'

export default function BatchQueuePage() {
  const [cells, setCells] = useState<PickCell[]>([])
  const [batches, setBatches] = useState<PickBatch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeBatch, setActiveBatch] = useState<PickBatch | null>(null)
  const [showCompleted, setShowCompleted] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [archiving, setArchiving] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
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
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [fetchData])

  // Get personalized batches (not assigned to any cell)
  const personalizedBatches = useMemo(() => {
    const filtered = batches.filter(b => {
      if (!b.isPersonalized) return false
      // Personalized batches have no cell assignments
      const hasCells = b.cellAssignments && b.cellAssignments.length > 0
      if (hasCells) return false
      return true
    })
    const visible = showCompleted ? filtered : filtered.filter(b => b.status !== 'COMPLETED')
    return visible.sort((a, b) => a.priority - b.priority)
  }, [batches, showCompleted])

  // Get batches assigned to a specific cell (via cellAssignments)
  const getBatchesForCell = useCallback((cellId: string) => {
    const filtered = batches.filter(b => {
      // Check new cellAssignments relation
      if (b.cellAssignments && b.cellAssignments.length > 0) {
        return b.cellAssignments.some(a => a.cellId === cellId)
      }
      // Fallback to legacy cellId for old batches
      return (b as any).cellId === cellId
    })

    // Filter completed if toggle is off
    const visible = showCompleted ? filtered : filtered.filter(b => b.status !== 'COMPLETED')

    // Sort by priority
    return visible.sort((a, b) => {
      // Find priority for this specific cell
      const aPriority = a.cellAssignments?.find(ca => ca.cellId === cellId)?.priority ?? a.priority
      const bPriority = b.cellAssignments?.find(ca => ca.cellId === cellId)?.priority ?? b.priority
      return aPriority - bPriority
    })
  }, [batches, showCompleted])

  // Drag handlers
  const handleDragStart = (event: DragStartEvent) => {
    const batch = batches.find(b => b.id === event.active.id)
    if (batch) setActiveBatch(batch)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveBatch(null)

    if (!over || active.id === over.id) return

    const activeBatchData = batches.find(b => b.id === active.id)
    const overBatchData = batches.find(b => b.id === over.id)
    if (!activeBatchData || !overBatchData) return

    // Find which cell the over batch is in (use first assignment)
    const overCellId = overBatchData.cellAssignments?.[0]?.cellId || (overBatchData as any).cellId
    if (!overCellId) return

    const cellBatches = getBatchesForCell(overCellId)
    const overIndex = cellBatches.findIndex(b => b.id === over.id)
    const newPriority = overIndex >= 0 ? overIndex : 0

    try {
      const res = await fetch('/api/batches/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchId: active.id,
          cellId: overCellId,
          newPriority,
        }),
      })

      if (!res.ok) throw new Error('Failed to reorder')
      fetchData()
    } catch (err) {
      console.error('Failed to reorder batch:', err)
      fetchData()
    }
  }

  // Delete a batch
  const handleDelete = async (batchId: string) => {
    if (!confirm('Delete this batch? Orders will return to the admin tabs.')) return

    try {
      const res = await fetch(`/api/batches?id=${batchId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete batch')
      fetchData()
    } catch (err) {
      console.error('Failed to delete batch:', err)
    }
  }

  // Edit cell assignments for a batch
  const handleEditCells = async (batchId: string, cellIds: string[]) => {
    try {
      const res = await fetch('/api/batches/cells', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId, cellIds }),
      })
      if (!res.ok) throw new Error('Failed to update cell assignments')
      fetchData()
    } catch (err) {
      console.error('Failed to update cell assignments:', err)
    }
  }

  const handleClearShipped = async () => {
    if (!confirm('⚠️ TESTING ONLY: This will reset ALL shipped orders back to "awaiting shipment" and clear their tracking/label data. Continue?')) return

    setArchiving(true)
    try {
      const res = await fetch('/api/orders/archive-shipped', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Clear failed')
      alert(`Reset ${data.cleared} shipped orders back to awaiting shipment.`)
    } catch (err: any) {
      alert('Clear failed: ' + (err.message || 'Unknown error'))
    } finally {
      setArchiving(false)
    }
  }

  const handleResetBatches = async () => {
    if (!confirm('⚠️ This will DELETE all batches, chunks, and bulk batches, unlink all orders, and reset all carts. Are you sure?')) return
    if (!confirm('This cannot be undone. Type OK to confirm you want to clear ALL batch data.')) return

    setResetting(true)
    try {
      const res = await fetch('/api/batches/reset', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Reset failed')
      alert(`Reset complete!\n\n• ${data.ordersUnlinked} orders unlinked\n• ${data.batchesDeleted} batches deleted\n• ${data.chunksDeleted} chunks deleted\n• ${data.bulkBatchesDeleted} bulk batches deleted\n• ${data.cartsReset} carts reset`)
      fetchData()
    } catch (err: any) {
      alert('Reset failed: ' + (err.message || 'Unknown error'))
    } finally {
      setResetting(false)
    }
  }

  // Loading / Error states
  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Batch Queue</h1>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
          <span className="ml-3 text-gray-600">Loading...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Batch Queue</h1>
        <div className="bg-red-50 text-red-600 p-4 rounded-lg">Error: {error}</div>
      </div>
    )
  }

  if (cells.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Batch Queue</h1>
        <div className="bg-amber-50 text-amber-700 p-4 rounded-lg">
          <p className="font-medium">No active cells found</p>
          <p className="text-sm mt-1">Create picking cells in Settings before managing batches.</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Batch Queue</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={handleClearShipped}
            disabled={archiving}
            className="px-3 py-2 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors disabled:opacity-50"
          >
            {archiving ? 'Archiving...' : 'Clear Shipped Orders'}
          </button>
          <button
            onClick={handleResetBatches}
            disabled={resetting}
            className="px-3 py-2 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors disabled:opacity-50"
          >
            {resetting ? 'Resetting...' : 'Reset All Batches'}
          </button>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={showCompleted}
              onChange={(e) => setShowCompleted(e.target.checked)}
              className="rounded border-gray-300"
            />
            Show completed
          </label>
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
      </div>

      {/* Queue Summary - at the top */}
      <QueueSummary batches={batches} />

      {/* Cell columns */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4">
          {cells.map((cell) => (
            <CellColumn
              key={cell.id}
              cell={cell}
              batches={getBatchesForCell(cell.id)}
              onDelete={handleDelete}
              onEditCells={handleEditCells}
              allCells={cells}
            />
          ))}

          {/* Personalized column (separate pool, not tied to any cell) */}
          <div className="flex-1 min-w-[300px] max-w-[380px] bg-purple-50 rounded-lg p-4 border-2 border-purple-200">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-semibold text-purple-900">Personalized</h3>
                <p className="text-xs text-purple-600">
                  {personalizedBatches.length} batch{personalizedBatches.length !== 1 ? 'es' : ''} &middot;{' '}
                  {personalizedBatches.reduce((sum, b) => sum + b.totalOrders, 0)} orders
                  {' '}({personalizedBatches.reduce((sum, b) => sum + (b.totalOrders - b.shippedOrders), 0)} remaining)
                </p>
              </div>
            </div>

            <SortableContext items={personalizedBatches.map(b => b.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2 min-h-[200px]">
                {personalizedBatches.length === 0 ? (
                  <div className="text-center text-purple-400 py-8 border-2 border-dashed border-purple-300 rounded-lg">
                    <p>No personalized batches</p>
                    <p className="text-xs mt-1">Push from Personalized Orders tab</p>
                  </div>
                ) : (
                  personalizedBatches.map((batch) => (
                    <SortableBatchCard
                      key={batch.id}
                      batch={batch}
                      onDelete={handleDelete}
                      onEditCells={handleEditCells}
                      allCells={cells}
                    />
                  ))
                )}
              </div>
            </SortableContext>
          </div>
        </div>

        <DragOverlay>
          {activeBatch ? <BatchCardOverlay batch={activeBatch} /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
