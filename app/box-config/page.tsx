'use client'

import { useState, useEffect } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import BoxTestDialog from '@/components/BoxTestDialog'
import { formatWeight, lbsToLbOz, lbOzToLbs } from '@/lib/weight-utils'

interface Box {
  id: string
  name: string
  lengthInches: number
  widthInches: number
  heightInches: number
  weightLbs: number
  volume: number
  priority: number
  active: boolean
  inStock: boolean
  singleCupOnly: boolean
}

interface FeedbackRule {
  id: string
  comboSignature: string
  boxId: string
  fits: boolean
  correctBoxId?: string
  testedAt: string
}

interface BoxConfig {
  boxes: Box[]
  feedbackRules: FeedbackRule[]
  packingEfficiency: number
  version: string
}

interface Product {
  id: string
  name: string
  volume: number
  category: string
  singleBoxId?: string | null
}

// Sortable row component for drag-and-drop
function SortableBoxRow({
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

export default function BoxConfigPage() {
  const [boxConfig, setBoxConfig] = useState<BoxConfig | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Box form state
  const [editingBox, setEditingBox] = useState<Box | null>(null)
  const [isAddingBox, setIsAddingBox] = useState(false)
  const [boxForm, setBoxForm] = useState({
    name: '',
    length: '',
    width: '',
    height: '',
    weightLb: '',
    weightOz: '',
    active: true,
    inStock: true,
    singleCupOnly: false,
  })

  // Test dialog state
  const [isTestDialogOpen, setIsTestDialogOpen] = useState(false)

  // Matrix filter state
  const [hideConfirmed, setHideConfirmed] = useState(true)

  // Pagination for combinations matrix
  const [visibleCombos, setVisibleCombos] = useState(100)

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      const [boxRes, prodRes] = await Promise.all([
        fetch('/api/box-config'),
        fetch('/api/products'),
      ])
      const boxData = await boxRes.json()
      const prodData = await prodRes.json()

      if (!boxRes.ok) throw new Error(boxData.error || 'Failed to fetch box config')
      if (!prodRes.ok) throw new Error(prodData.error || 'Failed to fetch products')

      setBoxConfig(boxData)
      // v2 format returns sizes array, v1 returned products array
      setProducts(prodData.sizes || prodData.products || [])
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  // ==================== Box CRUD ====================

  const resetBoxForm = () => {
    setBoxForm({
      name: '',
      length: '',
      width: '',
      height: '',
      weightLb: '',
      weightOz: '',
      active: true,
      inStock: true,
      singleCupOnly: false,
    })
    setEditingBox(null)
    setIsAddingBox(false)
  }

  const openEditBoxForm = (box: Box) => {
    const { lb, oz } = box.weightLbs ? lbsToLbOz(box.weightLbs) : { lb: 0, oz: 0 }
    setBoxForm({
      name: box.name,
      length: String(box.lengthInches),
      width: String(box.widthInches),
      height: String(box.heightInches),
      weightLb: lb ? String(lb) : '',
      weightOz: oz ? String(oz) : '',
      active: box.active,
      inStock: box.inStock,
      singleCupOnly: box.singleCupOnly ?? false,
    })
    setEditingBox(box)
    setIsAddingBox(false)
  }

  const handleSaveBox = async () => {
    setSaving(true)
    setError(null)

    try {
      const res = await fetch('/api/box-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: editingBox ? 'update-box' : 'add-box',
          ...(editingBox ? { id: editingBox.id } : {}),
          name: boxForm.name,
          lengthInches: parseFloat(boxForm.length) || 0,
          widthInches: parseFloat(boxForm.width) || 0,
          heightInches: parseFloat(boxForm.height) || 0,
          weightLbs: lbOzToLbs(parseFloat(boxForm.weightLb) || 0, parseFloat(boxForm.weightOz) || 0),
          // Priority is now managed by drag-and-drop; new boxes get added at the end
          active: boxForm.active,
          inStock: boxForm.inStock,
          singleCupOnly: boxForm.singleCupOnly,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save box')

      await fetchData()
      resetBoxForm()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteBox = async (id: string) => {
    if (!confirm('Are you sure you want to delete this box?')) return

    setSaving(true)
    try {
      const res = await fetch('/api/box-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete-box', id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to delete')
      await fetchData()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  // Handle drag end for reordering boxes
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const sortedBoxes = [...boxes].sort((a, b) => a.priority - b.priority)
      const oldIndex = sortedBoxes.findIndex((b) => b.id === active.id)
      const newIndex = sortedBoxes.findIndex((b) => b.id === over.id)

      const reorderedBoxes = arrayMove(sortedBoxes, oldIndex, newIndex)
      const newBoxIds = reorderedBoxes.map((b) => b.id)

      // Optimistically update local state
      setBoxConfig((prev) => {
        if (!prev) return prev
        const updatedBoxes = reorderedBoxes.map((box, index) => ({
          ...box,
          priority: index + 1,
        }))
        return { ...prev, boxes: updatedBoxes }
      })

      // Save to server
      try {
        const res = await fetch('/api/box-config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'reorder-boxes', boxIds: newBoxIds }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to reorder')
      } catch (e) {
        setError((e as Error).message)
        // Revert on error
        await fetchData()
      }
    }
  }

  const deleteFeedbackRule = async (id: string) => {
    if (!confirm('Delete this feedback rule?')) return

    setSaving(true)
    try {
      const res = await fetch('/api/box-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete-feedback', id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to delete')
      await fetchData()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  // Quick save feedback from matrix
  const saveFeedbackQuick = async (comboSignature: string, boxId: string, fits: boolean) => {
    setSaving(true)
    try {
      const res = await fetch('/api/box-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add-feedback',
          comboSignature,
          boxId,
          fits,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')
      await fetchData()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  // ==================== Render ====================

  if (loading) {
    return (
      <div>
        <h1 className="text-xl font-bold text-gray-900 mb-4">Box Config</h1>
        <p className="text-gray-500">Loading...</p>
      </div>
    )
  }

  const boxes = boxConfig?.boxes || []
  const feedbackRules = boxConfig?.feedbackRules || []
  const packingEfficiency = boxConfig?.packingEfficiency || 0.7

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Box Config</h1>
        <p className="text-sm text-gray-500">
          Configure boxes and test which box fits product combinations. Packing efficiency: {(packingEfficiency * 100).toFixed(0)}%
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* ==================== TEST CONFIG BUTTON ==================== */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Test Box Fit</h2>
            <p className="text-sm text-gray-500">
              Build a test order to see which box it fits in. Then confirm or reject the result.
            </p>
          </div>
          <button
            onClick={() => setIsTestDialogOpen(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            Open Test Dialog
          </button>
        </div>
      </div>

      {/* Test Box Fit Dialog */}
      <BoxTestDialog
        isOpen={isTestDialogOpen}
        onClose={() => setIsTestDialogOpen(false)}
        products={products}
        boxes={boxes}
        packingEfficiency={packingEfficiency}
        feedbackRules={feedbackRules}
        onFeedbackSaved={fetchData}
      />

      {/* ==================== BOXES SECTION ==================== */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold">Boxes</h2>
          <button
            onClick={() => { resetBoxForm(); setIsAddingBox(true); }}
            className="px-3 py-1.5 bg-green-600 text-white rounded text-sm font-medium hover:bg-green-700"
          >
            + Add Box
          </button>
        </div>

        {/* Add/Edit Box Form */}
        {(isAddingBox || editingBox) && (
          <div className="p-4 bg-gray-50 border-b">
            <h3 className="font-medium mb-3">{editingBox ? `Edit: ${editingBox.name}` : 'Add New Box'}</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input
                  type="text"
                  value={boxForm.name}
                  onChange={(e) => setBoxForm({ ...boxForm, name: e.target.value })}
                  className="w-full border rounded px-3 py-2 text-sm"
                  placeholder="2/4 Box"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Length (in)</label>
                <input
                  type="number"
                  step="0.1"
                  value={boxForm.length}
                  onChange={(e) => setBoxForm({ ...boxForm, length: e.target.value })}
                  className="w-full border rounded px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Width (in)</label>
                <input
                  type="number"
                  step="0.1"
                  value={boxForm.width}
                  onChange={(e) => setBoxForm({ ...boxForm, width: e.target.value })}
                  className="w-full border rounded px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Height (in)</label>
                <input
                  type="number"
                  step="0.1"
                  value={boxForm.height}
                  onChange={(e) => setBoxForm({ ...boxForm, height: e.target.value })}
                  className="w-full border rounded px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Weight</label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    step="1"
                    value={boxForm.weightLb}
                    onChange={(e) => setBoxForm({ ...boxForm, weightLb: e.target.value })}
                    className="w-16 border rounded px-3 py-2 text-sm"
                    placeholder="0"
                  />
                  <span className="text-sm text-gray-500">lb</span>
                  <input
                    type="number"
                    step="0.1"
                    value={boxForm.weightOz}
                    onChange={(e) => setBoxForm({ ...boxForm, weightOz: e.target.value })}
                    className="w-16 border rounded px-3 py-2 text-sm"
                    placeholder="0"
                  />
                  <span className="text-sm text-gray-500">oz</span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
              <div className="flex items-end gap-4 flex-wrap">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={boxForm.active}
                    onChange={(e) => setBoxForm({ ...boxForm, active: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm">Active</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={boxForm.inStock}
                    onChange={(e) => setBoxForm({ ...boxForm, inStock: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm">In Stock</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={boxForm.singleCupOnly}
                    onChange={(e) => setBoxForm({ ...boxForm, singleCupOnly: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm">Single Cup Only</span>
                </label>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={handleSaveBox}
                disabled={saving || !boxForm.name}
                className="px-4 py-2 bg-green-600 text-white rounded text-sm font-medium hover:bg-green-700 disabled:opacity-50"
              >
                {saving ? 'Saving...' : editingBox ? 'Update Box' : 'Add Box'}
              </button>
              <button
                onClick={resetBoxForm}
                className="px-4 py-2 border border-gray-300 rounded text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Boxes Table with Drag-and-Drop */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 py-3 w-8"></th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Internal Dims</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Weight</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Volume</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Usable ({(packingEfficiency * 100).toFixed(0)}%)</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase text-gray-400">#</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {boxes.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                    No boxes configured. Click "Add Box" to create one.
                  </td>
                </tr>
              ) : (
                <SortableContext
                  items={[...boxes].sort((a, b) => a.priority - b.priority).map((b) => b.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {[...boxes]
                    .sort((a, b) => a.priority - b.priority)
                    .map((box) => (
                      <SortableBoxRow
                        key={box.id}
                        box={box}
                        packingEfficiency={packingEfficiency}
                        onEdit={openEditBoxForm}
                        onDelete={handleDeleteBox}
                      />
                    ))}
                </SortableContext>
              )}
            </tbody>
          </table>
        </DndContext>
        <p className="px-4 py-2 text-xs text-gray-500 bg-gray-50 border-t">
          Drag rows to reorder. Boxes are tried in order from top to bottom.
        </p>
      </div>

      {/* ==================== ALL COMBINATIONS MATRIX ==================== */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">All Product Combinations</h2>
            <p className="text-sm text-gray-500">
              <span className="text-green-600 font-bold">✓</span> = confirmed &nbsp;
              <span className="text-blue-400">○</span> = calculated (untested) &nbsp;
              <span className="text-gray-300">—</span> = too small/ineligible
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={hideConfirmed}
              onChange={(e) => {
                setHideConfirmed(e.target.checked)
                setVisibleCombos(100) // Reset pagination when filter changes
              }}
              className="rounded"
            />
            <span>Hide confirmed</span>
          </label>
        </div>

        <div className="overflow-x-auto" style={{ maxHeight: '600px' }}>
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase sticky left-0 bg-gray-50 z-20">
                  Combination
                </th>
                {boxes.sort((a, b) => a.priority - b.priority).map((box) => (
                  <th key={box.id} className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                    {box.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {(() => {
                // Generate ALL combinations from products (cups and accessories)
                const allProducts = products.filter(p => {
                  const cat = p.category?.toLowerCase() || ''
                  return cat === 'tumbler' || cat === 'bottle' || cat === 'accessory' || cat === 'other'
                })

                // Build combo signature helper
                const buildSig = (items: { productId: string; quantity: number }[]) => {
                  return items
                    .filter(i => i.quantity > 0)
                    .map(i => `${i.productId}:${i.quantity}`)
                    .sort()
                    .join('|')
                }

                // Generate all combos
                const allCombos: { signature: string; items: { productId: string; quantity: number }[]; displayName: string; orderVolume: number; cupCount: number }[] = []

                const maxTotal = 10 // Max total cups in a combo

                // Recursive function to generate combinations
                const generateCombos = (
                  productIndex: number,
                  currentItems: { productId: string; quantity: number }[],
                  totalQty: number
                ) => {
                  // Add current combo if it has items
                  if (currentItems.some(i => i.quantity > 0)) {
                    const sig = buildSig(currentItems)
                    const orderVolume = currentItems.reduce((total, item) => {
                      const product = products.find(p => p.id === item.productId)
                      return total + (product?.volume || 0) * item.quantity
                    }, 0)
                    // Calculate actual cup count (only tumblers/bottles, not accessories)
                    const cupCount = currentItems.reduce((count, item) => {
                      const product = products.find(p => p.id === item.productId)
                      const cat = product?.category?.toLowerCase() || ''
                      if (cat === 'tumbler' || cat === 'bottle') {
                        return count + item.quantity
                      }
                      return count
                    }, 0)
                    const displayParts = currentItems
                      .filter(i => i.quantity > 0)
                      .map(i => {
                        const product = products.find(p => p.id === i.productId)
                        return `${i.quantity}× ${product?.name || i.productId}`
                      })
                    allCombos.push({
                      signature: sig,
                      items: currentItems.filter(i => i.quantity > 0),
                      displayName: displayParts.join(' + '),
                      orderVolume,
                      cupCount,
                    })
                  }

                  // Try adding more products
                  for (let i = productIndex; i < allProducts.length; i++) {
                    const product = allProducts[i]
                    // Limit stickers to max 2 in combinations (we don't sell 5+ sticker orders)
                    const isSticker = product.name?.toLowerCase().includes('sticker')
                    const maxQtyForProduct = isSticker ? Math.min(2, maxTotal - totalQty) : maxTotal - totalQty
                    for (let qty = 1; qty <= maxQtyForProduct; qty++) {
                      generateCombos(
                        i + 1,
                        [...currentItems, { productId: product.id, quantity: qty }],
                        totalQty + qty
                      )
                    }
                  }
                }

                generateCombos(0, [], 0)

                // Sort by total volume (smallest first)
                allCombos.sort((a, b) => a.orderVolume - b.orderVolume)

                // Filter out confirmed if hideConfirmed is true
                const filteredCombos = hideConfirmed
                  ? allCombos.filter(combo => !feedbackRules.some(r => r.comboSignature === combo.signature && r.fits))
                  : allCombos

                // Apply pagination - only show first N combos
                const displayedCombos = filteredCombos.slice(0, visibleCombos)

                return displayedCombos.map((combo) => {
                  const comboRules = feedbackRules.filter(r => r.comboSignature === combo.signature)

                  return (
                    <tr key={combo.signature} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-gray-900 text-xs sticky left-0 bg-white">
                        {combo.displayName}
                        <span className="ml-1 text-gray-400">({combo.orderVolume.toFixed(0)})</span>
                        {comboRules.some(r => r.fits) && (
                          <span className="ml-1 text-green-600">●</span>
                        )}
                      </td>
                      {boxes.sort((a, b) => a.priority - b.priority).map((box) => {
                        const rule = comboRules.find(r => r.boxId === box.id)
                        const usableVolume = box.volume * packingEfficiency
                        const wouldFit = combo.orderVolume <= usableVolume
                        const isEligible = !box.singleCupOnly || combo.cupCount === 1

                        return (
                          <td key={box.id} className="px-1 py-1 text-center">
                            {rule?.fits ? (
                              <button
                                onClick={() => {
                                  if (confirm('Remove this confirmed fit?')) {
                                    deleteFeedbackRule(rule.id)
                                  }
                                }}
                                className="w-6 h-6 text-green-600 font-bold hover:bg-green-50 rounded"
                                title="Confirmed - click to remove"
                                disabled={saving}
                              >
                                ✓
                              </button>
                            ) : rule ? (
                              <button
                                onClick={() => saveFeedbackQuick(combo.signature, box.id, true)}
                                className="w-6 h-6 text-red-500 hover:bg-red-50 rounded"
                                title="Doesn't fit - click to mark as fits"
                                disabled={saving}
                              >
                                ✗
                              </button>
                            ) : !isEligible ? (
                              <span className="text-gray-200 text-xs">—</span>
                            ) : wouldFit ? (
                              <button
                                onClick={() => saveFeedbackQuick(combo.signature, box.id, true)}
                                className="w-6 h-6 text-blue-300 hover:text-green-600 hover:bg-green-50 rounded"
                                title={`Click to confirm fit (${combo.orderVolume.toFixed(0)} ≤ ${usableVolume.toFixed(0)})`}
                                disabled={saving}
                              >
                                ○
                              </button>
                            ) : (
                              <button
                                onClick={() => saveFeedbackQuick(combo.signature, box.id, true)}
                                className="w-6 h-6 text-gray-200 hover:text-green-600 hover:bg-green-50 rounded"
                                title={`Click to force fit (${combo.orderVolume.toFixed(0)} > ${usableVolume.toFixed(0)})`}
                                disabled={saving}
                              >
                                —
                              </button>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })
              })()}
            </tbody>
          </table>
        </div>
        <div className="p-3 border-t bg-gray-50 flex items-center justify-between">
          <div className="text-xs text-gray-500">
            {(() => {
              // Calculate total combinations (including accessories now)
              const allProducts = products.filter(p => {
                const cat = p.category?.toLowerCase() || ''
                return cat === 'tumbler' || cat === 'bottle' || cat === 'accessory' || cat === 'other'
              })
              // Quick count calculation
              let totalCount = 0
              const maxTotal = 10
              const generateCount = (idx: number, total: number) => {
                if (total > 0) totalCount++
                for (let i = idx; i < allProducts.length; i++) {
                  for (let qty = 1; qty <= maxTotal - total; qty++) {
                    generateCount(i + 1, total + qty)
                  }
                }
              }
              generateCount(0, 0)
              const confirmedCount = feedbackRules.filter(r => r.fits).length

              // Calculate filtered count based on hideConfirmed
              const unconfirmedCount = totalCount - confirmedCount
              const filteredTotal = hideConfirmed ? unconfirmedCount : totalCount
              const showingCount = Math.min(visibleCombos, filteredTotal)

              return (
                <>
                  Showing {showingCount} of {filteredTotal} {hideConfirmed ? 'unconfirmed ' : ''}combinations
                  {' '}({confirmedCount} confirmed total) - click any cell to confirm
                </>
              )
            })()}
          </div>
          {(() => {
            // Calculate if we need Load More button
            const allProducts = products.filter(p => {
              const cat = p.category?.toLowerCase() || ''
              return cat === 'tumbler' || cat === 'bottle' || cat === 'accessory' || cat === 'other'
            })
            let totalCount = 0
            const maxTotal = 10
            const generateCount = (idx: number, total: number) => {
              if (total > 0) totalCount++
              for (let i = idx; i < allProducts.length; i++) {
                for (let qty = 1; qty <= maxTotal - total; qty++) {
                  generateCount(i + 1, total + qty)
                }
              }
            }
            generateCount(0, 0)
            const confirmedCount = feedbackRules.filter(r => r.fits).length
            const unconfirmedCount = totalCount - confirmedCount
            const filteredTotal = hideConfirmed ? unconfirmedCount : totalCount

            if (visibleCombos < filteredTotal) {
              return (
                <button
                  onClick={() => setVisibleCombos(prev => prev + 100)}
                  className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                >
                  Load 100 More
                </button>
              )
            }
            return null
          })()}
        </div>
      </div>
    </div>
  )
}
