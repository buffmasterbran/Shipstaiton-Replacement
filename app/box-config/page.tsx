'use client'

import { useState, useEffect } from 'react'
import BoxTestDialog from '@/components/BoxTestDialog'

interface BoxDimensions {
  length: number
  width: number
  height: number
}

interface Box {
  id: string
  name: string
  internalDimensions: BoxDimensions
  volume: number
  priority: number
  active: boolean
  inStock: boolean
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
    priority: '',
    active: true,
    inStock: true,
  })

  // Test dialog state
  const [isTestDialogOpen, setIsTestDialogOpen] = useState(false)

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
      setProducts(prodData.products || [])
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
      priority: '',
      active: true,
      inStock: true,
    })
    setEditingBox(null)
    setIsAddingBox(false)
  }

  const openEditBoxForm = (box: Box) => {
    setBoxForm({
      name: box.name,
      length: String(box.internalDimensions.length),
      width: String(box.internalDimensions.width),
      height: String(box.internalDimensions.height),
      priority: String(box.priority),
      active: box.active,
      inStock: box.inStock,
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
          internalDimensions: {
            length: parseFloat(boxForm.length) || 0,
            width: parseFloat(boxForm.width) || 0,
            height: parseFloat(boxForm.height) || 0,
          },
          priority: parseInt(boxForm.priority) || 99,
          active: boxForm.active,
          inStock: boxForm.inStock,
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
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                <input
                  type="number"
                  value={boxForm.priority}
                  onChange={(e) => setBoxForm({ ...boxForm, priority: e.target.value })}
                  className="w-full border rounded px-3 py-2 text-sm"
                  placeholder="1 = try first"
                />
              </div>
              <div className="flex items-end gap-4">
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

        {/* Boxes Table */}
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Internal Dims</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Volume</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Usable ({(packingEfficiency * 100).toFixed(0)}%)</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Priority</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {boxes.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  No boxes configured. Click "Add Box" to create one.
                </td>
              </tr>
            ) : (
              boxes
                .sort((a, b) => a.priority - b.priority)
                .map((box) => (
                  <tr key={box.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{box.name}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {box.internalDimensions.length}" × {box.internalDimensions.width}" × {box.internalDimensions.height}"
                    </td>
                    <td className="px-4 py-3 text-gray-600">{box.volume.toFixed(0)} in³</td>
                    <td className="px-4 py-3 text-gray-600">{(box.volume * packingEfficiency).toFixed(0)} in³</td>
                    <td className="px-4 py-3 text-gray-600">{box.priority}</td>
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
                        onClick={() => openEditBoxForm(box)}
                        className="text-blue-600 hover:text-blue-800 text-sm mr-3"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteBox(box.id)}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
            )}
          </tbody>
        </table>
      </div>

      {/* ==================== FEEDBACK RULES SECTION ==================== */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">Learned Rules (Feedback History)</h2>
          <p className="text-sm text-gray-500">
            When you confirm or reject a box fit, the rule is saved here for future orders.
          </p>
        </div>

        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Combination</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Proposed Box</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fits?</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Correct Box</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tested</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {feedbackRules.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  No feedback rules yet. Use the Test Box Fit section above to create rules.
                </td>
              </tr>
            ) : (
              feedbackRules.map((rule) => {
                const box = boxes.find(b => b.id === rule.boxId)
                const correctBox = rule.correctBoxId ? boxes.find(b => b.id === rule.correctBoxId) : null

                // Parse combo signature for display
                const comboParts = rule.comboSignature.split('|').map(part => {
                  const [productId, qty] = part.split(':')
                  const product = products.find(p => p.id === productId)
                  return `${qty}× ${product?.name || productId}`
                })

                return (
                  <tr key={rule.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-900">
                      {comboParts.join(' + ')}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{box?.name || rule.boxId}</td>
                    <td className="px-4 py-3">
                      {rule.fits ? (
                        <span className="text-green-600 font-medium">Yes</span>
                      ) : (
                        <span className="text-red-600 font-medium">No</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {rule.fits ? '—' : (correctBox?.name || rule.correctBoxId || '—')}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {new Date(rule.testedAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => deleteFeedbackRule(rule.id)}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
