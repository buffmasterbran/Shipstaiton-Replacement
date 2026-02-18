'use client'

import { useState } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface ColumnSettingsDialogProps {
  open: boolean
  onClose: () => void
  columns: { id: string; label: string }[]
  columnOrder: string[]
  hiddenColumns: Set<string>
  pinnedColumns: Set<string>
  onSave: (order: string[], hidden: Set<string>) => void
}

function SortableColumnRow({
  id,
  label,
  hidden,
  pinned,
  onToggle,
}: {
  id: string
  label: string
  hidden: boolean
  pinned: boolean
  onToggle: () => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: pinned })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${
        isDragging ? 'bg-blue-50 border-blue-300 shadow-md z-10' : 'bg-white border-gray-200'
      } ${pinned ? 'opacity-60' : ''}`}
    >
      {!pinned ? (
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 shrink-0"
          title="Drag to reorder"
        >
          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="5" cy="3" r="1.5" />
            <circle cx="11" cy="3" r="1.5" />
            <circle cx="5" cy="8" r="1.5" />
            <circle cx="11" cy="8" r="1.5" />
            <circle cx="5" cy="13" r="1.5" />
            <circle cx="11" cy="13" r="1.5" />
          </svg>
        </button>
      ) : (
        <div className="w-4 shrink-0" />
      )}
      <span className="flex-1 text-sm font-medium text-gray-700">{label}</span>
      {pinned ? (
        <span className="text-xs text-gray-400">Pinned</span>
      ) : (
        <button
          onClick={onToggle}
          className={`relative w-9 h-5 rounded-full transition-colors ${
            hidden ? 'bg-gray-300' : 'bg-green-500'
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
              hidden ? '' : 'translate-x-4'
            }`}
          />
        </button>
      )}
    </div>
  )
}

export default function ColumnSettingsDialog({
  open,
  onClose,
  columns,
  columnOrder,
  hiddenColumns,
  pinnedColumns,
  onSave,
}: ColumnSettingsDialogProps) {
  const [localOrder, setLocalOrder] = useState<string[]>(columnOrder)
  const [localHidden, setLocalHidden] = useState<Set<string>>(new Set(hiddenColumns))

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  if (!open) return null

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setLocalOrder((prev) => {
        const oldIdx = prev.indexOf(active.id as string)
        const newIdx = prev.indexOf(over.id as string)
        return arrayMove(prev, oldIdx, newIdx)
      })
    }
  }

  const toggleColumn = (id: string) => {
    setLocalHidden((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleSave = () => {
    onSave(localOrder, localHidden)
    onClose()
  }

  const handleReset = () => {
    setLocalOrder(columns.map((c) => c.id))
    setLocalHidden(new Set())
  }

  const columnLookup = new Map(columns.map((c) => [c.id, c]))

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-800">Table Columns</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">
            &times;
          </button>
        </div>
        <div className="px-4 py-3 max-h-[60vh] overflow-y-auto">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={localOrder} strategy={verticalListSortingStrategy}>
              <div className="space-y-1.5">
                {localOrder.map((id) => {
                  const col = columnLookup.get(id)
                  if (!col) return null
                  return (
                    <SortableColumnRow
                      key={id}
                      id={id}
                      label={col.label}
                      hidden={localHidden.has(id)}
                      pinned={pinnedColumns.has(id)}
                      onToggle={() => toggleColumn(id)}
                    />
                  )
                })}
              </div>
            </SortableContext>
          </DndContext>
        </div>
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
          <button
            onClick={handleReset}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            Reset to Default
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-1.5 text-sm font-medium bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
