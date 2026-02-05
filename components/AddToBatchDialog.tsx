'use client'

import { useState, useEffect } from 'react'

interface PickCell {
  id: string
  name: string
  active: boolean
}

interface BatchCreationResult {
  batches: Array<{
    id: string
    name: string
    type: 'standard' | 'oversized'
    orderCount: number
  }>
  summary: {
    standardOrders: number
    oversizedOrders: number
    printOnlyOrders: number
    printOnlyOrderNumbers: string[]
  }
}

interface AddToBatchDialogProps {
  isOpen: boolean
  onClose: () => void
  selectedOrderNumbers: string[]
  onBatchCreated: () => void
}

export default function AddToBatchDialog({
  isOpen,
  onClose,
  selectedOrderNumbers,
  onBatchCreated,
}: AddToBatchDialogProps) {
  const [cells, setCells] = useState<PickCell[]>([])
  const [loadingCells, setLoadingCells] = useState(true)
  const [selectedCellId, setSelectedCellId] = useState<string>('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<BatchCreationResult | null>(null)

  // Fetch cells when dialog opens
  useEffect(() => {
    if (isOpen) {
      setError(null)
      setResult(null)
      fetchCells()
    }
  }, [isOpen])

  const fetchCells = async () => {
    setLoadingCells(true)
    try {
      const res = await fetch('/api/cells')
      if (res.ok) {
        const data = await res.json()
        const activeCells = (data.cells || []).filter((c: PickCell) => c.active)
        setCells(activeCells)
        // Auto-select first cell if available
        if (activeCells.length > 0 && !selectedCellId) {
          setSelectedCellId(activeCells[0].id)
        }
      }
    } catch (err) {
      console.error('Failed to fetch cells:', err)
    } finally {
      setLoadingCells(false)
    }
  }

  const handleCreateBatch = async () => {
    if (!selectedCellId) {
      setError('Please select a cell')
      return
    }

    setCreating(true)
    setError(null)

    try {
      const res = await fetch('/api/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderNumbers: selectedOrderNumbers,
          cellId: selectedCellId,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create batch')
      }

      setResult(data)
    } catch (err: any) {
      setError(err.message || 'Failed to create batch')
    } finally {
      setCreating(false)
    }
  }

  const handleDone = () => {
    onBatchCreated()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
          onClick={onClose}
        />

        {/* Modal */}
        <div className="inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Add to Picking Batch
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          {result ? (
            // Success state
            <div className="space-y-4">
              <div className="flex items-center gap-3 text-green-600">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-lg font-medium">Batches Created Successfully!</span>
              </div>

              <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                <h4 className="font-medium text-gray-900">Summary:</h4>
                
                {result.batches.map((batch) => (
                  <div key={batch.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        batch.type === 'standard' ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800'
                      }`}>
                        {batch.type === 'standard' ? 'Standard' : 'Oversized'}
                      </span>
                      <span className="text-gray-900 font-mono">{batch.name}</span>
                    </div>
                    <span className="text-gray-600">{batch.orderCount} orders</span>
                  </div>
                ))}

                {result.summary.printOnlyOrders > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <div className="flex items-center gap-2 text-amber-600">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <span className="font-medium">
                        {result.summary.printOnlyOrders} order(s) excluded (25+ items)
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      These orders have too many items for digital picking. Print packing slips for manual handling.
                    </p>
                    <div className="mt-2 text-xs text-gray-500 font-mono">
                      {result.summary.printOnlyOrderNumbers.join(', ')}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-4">
                <button
                  onClick={handleDone}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            // Form state
            <div className="space-y-4">
              <div className="bg-blue-50 rounded-lg p-4">
                <div className="flex items-center gap-2 text-blue-800">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="font-medium">{selectedOrderNumbers.length} orders selected</span>
                </div>
                <p className="text-sm text-blue-600 mt-1">
                  Orders will be automatically categorized by item count:
                </p>
                <ul className="text-sm text-blue-600 mt-2 ml-6 list-disc">
                  <li>1-12 items: Standard batch (12 orders/chunk)</li>
                  <li>13-24 items: Oversized batch (6 orders/chunk)</li>
                  <li>25+ items: Excluded (print packing slip)</li>
                </ul>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Cell
                </label>
                {loadingCells ? (
                  <div className="flex items-center gap-2 text-gray-500">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600"></div>
                    <span>Loading cells...</span>
                  </div>
                ) : cells.length === 0 ? (
                  <div className="text-amber-600 bg-amber-50 rounded-lg p-3">
                    <p className="font-medium">No active cells found</p>
                    <p className="text-sm mt-1">
                      Please create a cell in Settings before creating batches.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {cells.map((cell) => (
                      <button
                        key={cell.id}
                        onClick={() => setSelectedCellId(cell.id)}
                        className={`p-3 rounded-lg border-2 text-left transition-colors ${
                          selectedCellId === cell.id
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-gray-200 hover:border-gray-300 text-gray-700'
                        }`}
                      >
                        <div className="font-medium">{cell.name}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {error && (
                <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateBatch}
                  disabled={creating || cells.length === 0 || !selectedCellId}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {creating ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Creating...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                      Create Batch
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
