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
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// ============================================================================
// Types
// ============================================================================

interface PickCell {
  id: string
  name: string
  active: boolean
}

interface CellAssignment {
  id: string
  cellId: string
  priority: number
  cell: PickCell
}

interface BulkBatchInfo {
  id: string
  groupSignature: string
  orderCount: number
  splitIndex: number
  totalSplits: number
  status: string
}

interface PickBatch {
  id: string
  name: string
  type: 'SINGLES' | 'BULK' | 'ORDER_BY_SIZE'
  status: 'ACTIVE' | 'IN_PROGRESS' | 'COMPLETED' | 'DRAFT' | 'RELEASED'
  priority: number
  isPersonalized: boolean
  totalOrders: number
  pickedOrders: number
  shippedOrders: number
  engravedOrders: number
  createdAt: string
  completedAt: string | null
  cellAssignments: CellAssignment[]
  bulkBatches?: BulkBatchInfo[]
  _count: {
    orders: number
    chunks: number
  }
}

// ============================================================================
// Helper functions
// ============================================================================

function getTypeBadge(type: string, isPersonalized: boolean) {
  if (isPersonalized) return { label: 'Personalized', bg: 'bg-purple-100 text-purple-700' }
  switch (type) {
    case 'SINGLES': return { label: 'Singles', bg: 'bg-blue-100 text-blue-700' }
    case 'BULK': return { label: 'Bulk', bg: 'bg-orange-100 text-orange-700' }
    case 'ORDER_BY_SIZE': return { label: 'Order by Size', bg: 'bg-teal-100 text-teal-700' }
    default: return { label: type, bg: 'bg-gray-100 text-gray-700' }
  }
}

// Deterministic color from batch ID for shared batch visual matching
const SHARED_COLORS = [
  '#6366f1', // indigo
  '#ec4899', // pink
  '#f59e0b', // amber
  '#10b981', // emerald
  '#8b5cf6', // violet
  '#ef4444', // red
  '#06b6d4', // cyan
  '#f97316', // orange
  '#14b8a6', // teal
  '#a855f7', // purple
]

function getSharedColor(batchId: string): string {
  let hash = 0
  for (let i = 0; i < batchId.length; i++) {
    hash = ((hash << 5) - hash) + batchId.charCodeAt(i)
    hash |= 0
  }
  return SHARED_COLORS[Math.abs(hash) % SHARED_COLORS.length]
}

function getStatusColor(status: string) {
  switch (status) {
    case 'ACTIVE': return 'bg-blue-100 text-blue-700'
    case 'IN_PROGRESS': return 'bg-yellow-100 text-yellow-700'
    case 'COMPLETED': return 'bg-green-100 text-green-700'
    // Legacy statuses
    case 'DRAFT': return 'bg-gray-100 text-gray-700'
    case 'RELEASED': return 'bg-blue-100 text-blue-700'
    default: return 'bg-gray-100 text-gray-700'
  }
}

// ============================================================================
// Batch Card Component (Sortable)
// ============================================================================

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
function BatchCardOverlay({ batch }: { batch: PickBatch }) {
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

// ============================================================================
// Cell Column Component
// ============================================================================

function CellColumn({
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

// ============================================================================
// Queue Summary Component
// ============================================================================

function QueueSummary({ batches }: { batches: PickBatch[] }) {
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

// ============================================================================
// Main Page
// ============================================================================

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
