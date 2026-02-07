'use client'

import { useState, useEffect } from 'react'

interface PickCell {
  id: string
  name: string
  active: boolean
}

interface PushToQueueDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (cellIds: string[], customName?: string) => Promise<void>
  orderCount: number
  batchType: 'SINGLES' | 'BULK' | 'ORDER_BY_SIZE'
  isPersonalized?: boolean
  /** Optional description of what's being batched */
  description?: string
  /** Suggested auto-generated name */
  suggestedName?: string
}

export default function PushToQueueDialog({
  isOpen,
  onClose,
  onConfirm,
  orderCount,
  batchType,
  isPersonalized = false,
  description,
  suggestedName,
}: PushToQueueDialogProps) {
  const [cells, setCells] = useState<PickCell[]>([])
  const [selectedCellIds, setSelectedCellIds] = useState<string[]>([])
  const [selectAll, setSelectAll] = useState(false)
  const [customName, setCustomName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadingCells, setLoadingCells] = useState(true)

  // Fetch cells when dialog opens
  useEffect(() => {
    if (isOpen) {
      setLoadingCells(true)
      setError(null)
      setCustomName(suggestedName || '')
      setSelectedCellIds([])
      setSelectAll(false)

      fetch('/api/cells')
        .then(res => res.json())
        .then(data => {
          const activeCells = (data.cells || []).filter((c: PickCell) => c.active)
          setCells(activeCells)
          // Auto-select all if only one cell
          if (activeCells.length === 1) {
            setSelectedCellIds([activeCells[0].id])
          }
          setLoadingCells(false)
        })
        .catch(() => {
          setError('Failed to load cells')
          setLoadingCells(false)
        })
    }
  }, [isOpen, suggestedName])

  const handleToggleCell = (cellId: string) => {
    setSelectedCellIds(prev =>
      prev.includes(cellId)
        ? prev.filter(id => id !== cellId)
        : [...prev, cellId]
    )
  }

  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedCellIds([])
    } else {
      setSelectedCellIds(cells.map(c => c.id))
    }
    setSelectAll(!selectAll)
  }

  const handleConfirm = async () => {
    if (selectedCellIds.length === 0) {
      setError('Select at least one cell')
      return
    }

    setLoading(true)
    setError(null)
    try {
      await onConfirm(selectedCellIds, customName || undefined)
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to create batch')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  const typeLabel = isPersonalized ? 'Personalized' :
    batchType === 'SINGLES' ? 'Singles' :
    batchType === 'BULK' ? 'Bulk' : 'Order by Size'

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Push to Queue</h2>
        <p className="text-sm text-gray-500 mb-4">
          Create a <span className="font-medium">{typeLabel}</span> batch with{' '}
          <span className="font-medium">{orderCount}</span> order{orderCount !== 1 ? 's' : ''}
          {description && <> &mdash; {description}</>}
        </p>

        {/* Batch name */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Batch Name</label>
          <input
            type="text"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            placeholder="Auto-generated if empty"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Cell selection */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">Assign to Cells</label>
            {cells.length > 1 && (
              <button
                onClick={handleSelectAll}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                {selectAll ? 'Deselect All' : 'Select All'}
              </button>
            )}
          </div>

          {loadingCells ? (
            <div className="text-sm text-gray-500 py-2">Loading cells...</div>
          ) : cells.length === 0 ? (
            <div className="text-sm text-amber-600 py-2">
              No active cells. Create cells in Settings first.
            </div>
          ) : (
            <div className="space-y-2">
              {cells.map(cell => (
                <label
                  key={cell.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                    selectedCellIds.includes(cell.id)
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedCellIds.includes(cell.id)}
                    onChange={() => handleToggleCell(cell.id)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="font-medium text-gray-900">{cell.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {selectedCellIds.length > 1 && (
          <div className="mb-4 p-3 bg-indigo-50 rounded-lg text-sm text-indigo-700">
            This batch will be shared across {selectedCellIds.length} cells. Pickers in any assigned cell can work on it.
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-50 rounded-lg text-sm text-red-600">{error}</div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading || selectedCellIds.length === 0 || loadingCells}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                Creating...
              </>
            ) : (
              `Push ${orderCount} Orders`
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
