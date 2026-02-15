'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { formatWeight } from '@/lib/weight-utils'
import type { Box } from './types'

// Sortable row component for drag-and-drop
export function SortableBoxRow({
  box,
  packingEfficiency,
  onEdit,
  onDelete,
}: {
  box: Box
  packingEfficiency: number
  onEdit: (box: Box) => void
  onDelete: (id: string) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: box.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <tr ref={setNodeRef} style={style} className="hover:bg-gray-50 bg-white">
      <td className="px-2 py-3 w-8">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1 text-gray-400 hover:text-gray-600"
          title="Drag to reorder"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
          </svg>
        </button>
      </td>
      <td className="px-4 py-3 font-medium text-gray-900">
        {box.name}
        {box.singleCupOnly && (
          <span className="ml-2 px-1.5 py-0.5 text-xs bg-purple-100 text-purple-700 rounded">
            Single
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-gray-600">
        {box.lengthInches}" × {box.widthInches}" × {box.heightInches}"
      </td>
      <td className="px-4 py-3 text-gray-600">{box.weightLbs ? formatWeight(box.weightLbs) : '-'}</td>
      <td className="px-4 py-3 text-gray-600">{box.volume.toFixed(0)} in³</td>
      <td className="px-4 py-3 text-gray-600">{(box.volume * packingEfficiency).toFixed(0)} in³</td>
      <td className="px-4 py-3 text-gray-500 text-xs">{box.priority}</td>
      <td className="px-4 py-3">
        {box.active && box.inStock ? (
          <span className="text-green-600">Active</span>
        ) : !box.active ? (
          <span className="text-gray-400">Inactive</span>
        ) : (
          <span className="text-yellow-600">Out of Stock</span>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <button
          onClick={() => onEdit(box)}
          className="text-blue-600 hover:text-blue-800 text-sm mr-3"
        >
          Edit
        </button>
        <button
          onClick={() => onDelete(box.id)}
          className="text-red-600 hover:text-red-800 text-sm"
        >
          Delete
        </button>
      </td>
    </tr>
  )
}
