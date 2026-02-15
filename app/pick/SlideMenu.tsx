'use client'

import { getModeBadge } from './helpers'

export function SlideMenu({
  isOpen,
  onClose,
  pickerName,
  cartName,
  cellName,
  batchType,
  isPersonalized,
  onCancelPick,
}: {
  isOpen: boolean
  onClose: () => void
  pickerName: string
  cartName: string
  cellName: string
  batchType?: string
  isPersonalized?: boolean
  onCancelPick: () => void
}) {
  if (!isOpen) return null
  const badge = getModeBadge(batchType, isPersonalized)

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      <div className="fixed left-0 top-0 bottom-0 w-72 bg-white shadow-2xl z-50 flex flex-col">
        <div className="p-6 border-b bg-gray-50">
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 mb-4">
            Close
          </button>
          <h2 className="text-xl font-bold text-gray-900">Menu</h2>
        </div>
        <div className="p-6 space-y-4 border-b">
            <div>
              <div className="text-sm text-gray-500">Picker</div>
              <div className="font-bold text-gray-900">{pickerName}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Cart</div>
              <div className="font-bold text-gray-900">{cartName}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Cell</div>
              <div className="font-bold text-gray-900">{cellName}</div>
            </div>
          <div>
            <div className="text-sm text-gray-500">Mode</div>
            <span className={`inline-flex px-2 py-1 rounded text-xs font-bold text-white ${badge.bg}`}>
              {badge.label}
            </span>
          </div>
        </div>
        <div className="flex-1 p-4">
          <button
            onClick={() => { onClose(); onCancelPick() }}
            className="w-full py-4 px-4 text-left text-red-600 hover:bg-red-50 rounded-xl font-medium"
          >
            Cancel Pick
          </button>
        </div>
      </div>
    </>
  )
}
