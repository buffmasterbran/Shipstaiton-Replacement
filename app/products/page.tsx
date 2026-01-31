'use client'

import { useState, useEffect } from 'react'

interface ProductDimensions {
  length: number
  width: number
  height: number
}

interface ProductSize {
  id: string
  name: string
  dimensions: ProductDimensions
  volume: number
  weight: number
  category: 'tumbler' | 'bottle' | 'accessory' | 'other'
  active: boolean
  fallbackSkuPatterns: string[]
}

interface ProductSku {
  sku: string
  sizeId: string
  name?: string
  barcode?: string
  active: boolean
}

interface ProductsConfig {
  sizes: ProductSize[]
  skus: ProductSku[]
  version: string
}

const CATEGORIES = ['tumbler', 'bottle', 'accessory', 'other'] as const

export default function ProductsPage() {
  const [config, setConfig] = useState<ProductsConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Expanded sizes state
  const [expandedSizes, setExpandedSizes] = useState<Set<string>>(new Set())

  // Size form state
  const [editingSize, setEditingSize] = useState<ProductSize | null>(null)
  const [isAddingSize, setIsAddingSize] = useState(false)
  const [sizeForm, setSizeForm] = useState({
    name: '',
    fallbackSkuPatterns: '',
    length: '',
    width: '',
    height: '',
    weight: '',
    category: 'tumbler' as ProductSize['category'],
    active: true,
  })

  // SKU form state
  const [editingSku, setEditingSku] = useState<ProductSku | null>(null)
  const [addingSkuForSizeId, setAddingSkuForSizeId] = useState<string | null>(null)
  const [skuForm, setSkuForm] = useState({
    sku: '',
    name: '',
    barcode: '',
    active: true,
  })

  useEffect(() => {
    fetchProducts()
  }, [])

  const fetchProducts = async () => {
    try {
      const res = await fetch('/api/products')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to fetch')
      setConfig(data)
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  // Toggle size expansion
  const toggleSize = (sizeId: string) => {
    setExpandedSizes(prev => {
      const next = new Set(prev)
      if (next.has(sizeId)) {
        next.delete(sizeId)
      } else {
        next.add(sizeId)
      }
      return next
    })
  }

  // Size form handlers
  const resetSizeForm = () => {
    setSizeForm({
      name: '',
      fallbackSkuPatterns: '',
      length: '',
      width: '',
      height: '',
      weight: '',
      category: 'tumbler',
      active: true,
    })
    setEditingSize(null)
    setIsAddingSize(false)
  }

  const openEditSizeForm = (size: ProductSize) => {
    setSizeForm({
      name: size.name,
      fallbackSkuPatterns: size.fallbackSkuPatterns.join(', '),
      length: String(size.dimensions.length),
      width: String(size.dimensions.width),
      height: String(size.dimensions.height),
      weight: String(size.weight),
      category: size.category,
      active: size.active,
    })
    setEditingSize(size)
    setIsAddingSize(false)
    // Close SKU form if open
    resetSkuForm()
  }

  const openAddSizeForm = () => {
    resetSizeForm()
    setIsAddingSize(true)
    // Close SKU form if open
    resetSkuForm()
  }

  const handleSaveSize = async () => {
    setSaving(true)
    setError(null)

    try {
      const fallbackSkuPatterns = sizeForm.fallbackSkuPatterns
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)

      const payload = {
        action: editingSize ? 'update-size' : 'add-size',
        ...(editingSize ? { id: editingSize.id } : {}),
        name: sizeForm.name,
        fallbackSkuPatterns,
        dimensions: {
          length: parseFloat(sizeForm.length) || 0,
          width: parseFloat(sizeForm.width) || 0,
          height: parseFloat(sizeForm.height) || 0,
        },
        weight: parseFloat(sizeForm.weight) || 0,
        category: sizeForm.category,
        active: sizeForm.active,
      }

      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')

      await fetchProducts()
      resetSizeForm()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteSize = async (id: string, name: string, skuCount: number) => {
    const msg = skuCount > 0
      ? `Delete "${name}" and its ${skuCount} SKU(s)?`
      : `Delete "${name}"?`
    if (!confirm(msg)) return

    setSaving(true)
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete-size', id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to delete')
      await fetchProducts()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  // SKU form handlers
  const resetSkuForm = () => {
    setSkuForm({
      sku: '',
      name: '',
      barcode: '',
      active: true,
    })
    setEditingSku(null)
    setAddingSkuForSizeId(null)
  }

  const openAddSkuForm = (sizeId: string) => {
    resetSkuForm()
    setAddingSkuForSizeId(sizeId)
    // Close size form if open
    resetSizeForm()
    // Make sure the size is expanded
    setExpandedSizes(prev => new Set(prev).add(sizeId))
  }

  const openEditSkuForm = (sku: ProductSku) => {
    setSkuForm({
      sku: sku.sku,
      name: sku.name || '',
      barcode: sku.barcode || '',
      active: sku.active,
    })
    setEditingSku(sku)
    setAddingSkuForSizeId(null)
    // Close size form if open
    resetSizeForm()
  }

  const handleSaveSku = async (sizeId: string) => {
    setSaving(true)
    setError(null)

    try {
      const payload = editingSku
        ? {
            action: 'update-sku',
            sku: editingSku.sku,
            newSku: skuForm.sku !== editingSku.sku ? skuForm.sku : undefined,
            sizeId,
            name: skuForm.name || undefined,
            barcode: skuForm.barcode || undefined,
            active: skuForm.active,
          }
        : {
            action: 'add-sku',
            sku: skuForm.sku,
            sizeId,
            name: skuForm.name || undefined,
            barcode: skuForm.barcode || undefined,
            active: skuForm.active,
          }

      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')

      await fetchProducts()
      resetSkuForm()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteSku = async (sku: string) => {
    if (!confirm(`Delete SKU "${sku}"?`)) return

    setSaving(true)
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete-sku', sku }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to delete')
      await fetchProducts()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  // Get SKUs for a size
  const getSkusForSize = (sizeId: string): ProductSku[] => {
    return config?.skus.filter(s => s.sizeId === sizeId) || []
  }

  if (loading) {
    return (
      <div>
        <h1 className="text-xl font-bold text-gray-900 mb-4">Products</h1>
        <p className="text-gray-500">Loading...</p>
      </div>
    )
  }

  const sizes = config?.sizes || []

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Products</h1>
          <p className="text-sm text-gray-500">
            Product sizes with dimensions (for box fitting) and SKU variants (for order matching).
          </p>
        </div>
        <button
          onClick={openAddSizeForm}
          className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700"
        >
          + Add Size
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Add/Edit Size Form */}
      {(isAddingSize || editingSize) && (
        <div className="mb-6 p-4 bg-gray-50 border rounded-lg">
          <h2 className="text-lg font-semibold mb-4">
            {editingSize ? `Edit Size: ${editingSize.name}` : 'Add New Size'}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input
                type="text"
                value={sizeForm.name}
                onChange={(e) => setSizeForm({ ...sizeForm, name: e.target.value })}
                className="w-full border rounded px-3 py-2 text-sm"
                placeholder="26oz Tumbler"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fallback SKU Patterns</label>
              <input
                type="text"
                value={sizeForm.fallbackSkuPatterns}
                onChange={(e) => setSizeForm({ ...sizeForm, fallbackSkuPatterns: e.target.value })}
                className="w-full border rounded px-3 py-2 text-sm"
                placeholder="^DPT26, ^PT26"
              />
              <p className="text-xs text-gray-500 mt-1">Regex patterns for orders without exact SKU</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select
                value={sizeForm.category}
                onChange={(e) => setSizeForm({ ...sizeForm, category: e.target.value as ProductSize['category'] })}
                className="w-full border rounded px-3 py-2 text-sm"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Weight (lbs)</label>
              <input
                type="number"
                step="0.1"
                value={sizeForm.weight}
                onChange={(e) => setSizeForm({ ...sizeForm, weight: e.target.value })}
                className="w-full border rounded px-3 py-2 text-sm"
                placeholder="0.9"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Length (in)</label>
              <input
                type="number"
                step="0.1"
                value={sizeForm.length}
                onChange={(e) => setSizeForm({ ...sizeForm, length: e.target.value })}
                className="w-full border rounded px-3 py-2 text-sm"
                placeholder="4"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Width (in)</label>
              <input
                type="number"
                step="0.1"
                value={sizeForm.width}
                onChange={(e) => setSizeForm({ ...sizeForm, width: e.target.value })}
                className="w-full border rounded px-3 py-2 text-sm"
                placeholder="4"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Height (in)</label>
              <input
                type="number"
                step="0.1"
                value={sizeForm.height}
                onChange={(e) => setSizeForm({ ...sizeForm, height: e.target.value })}
                className="w-full border rounded px-3 py-2 text-sm"
                placeholder="8"
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={sizeForm.active}
                  onChange={(e) => setSizeForm({ ...sizeForm, active: e.target.checked })}
                  className="rounded"
                />
                <span className="text-sm text-gray-700">Active</span>
              </label>
              {sizeForm.length && sizeForm.width && sizeForm.height && (
                <span className="text-sm text-gray-500 ml-4">
                  Volume: {(parseFloat(sizeForm.length) * parseFloat(sizeForm.width) * parseFloat(sizeForm.height)).toFixed(1)} in³
                </span>
              )}
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              onClick={handleSaveSize}
              disabled={saving || !sizeForm.name}
              className="px-4 py-2 bg-green-600 text-white rounded text-sm font-medium hover:bg-green-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : editingSize ? 'Update Size' : 'Add Size'}
            </button>
            <button
              onClick={resetSizeForm}
              className="px-4 py-2 border border-gray-300 rounded text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Sizes List */}
      <div className="space-y-4">
        {sizes.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
            No product sizes yet. Click "Add Size" to create one.
          </div>
        ) : (
          sizes.map((size) => {
            const skus = getSkusForSize(size.id)
            const isExpanded = expandedSizes.has(size.id)
            const isAddingSku = addingSkuForSizeId === size.id
            const isEditingSkuForThisSize = editingSku && editingSku.sizeId === size.id

            return (
              <div key={size.id} className="bg-white rounded-lg shadow overflow-hidden">
                {/* Size Header */}
                <div
                  className={`px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50 ${
                    !size.active ? 'opacity-60' : ''
                  }`}
                  onClick={() => toggleSize(size.id)}
                >
                  <div className="flex items-center gap-4">
                    <span className="text-gray-400">
                      {isExpanded ? '▼' : '▶'}
                    </span>
                    <div>
                      <div className="font-medium text-gray-900">{size.name}</div>
                      <div className="text-sm text-gray-500">
                        {size.dimensions.length}" × {size.dimensions.width}" × {size.dimensions.height}"
                        <span className="mx-2">|</span>
                        {size.volume.toFixed(1)} in³
                        <span className="mx-2">|</span>
                        {size.weight} lb
                        {size.fallbackSkuPatterns.length > 0 && (
                          <>
                            <span className="mx-2">|</span>
                            <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">
                              {size.fallbackSkuPatterns.join(', ')}
                            </code>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      size.category === 'tumbler' ? 'bg-blue-100 text-blue-800' :
                      size.category === 'bottle' ? 'bg-cyan-100 text-cyan-800' :
                      size.category === 'accessory' ? 'bg-purple-100 text-purple-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {size.category}
                    </span>
                    <span className="text-sm text-gray-500">{skus.length} SKU{skus.length !== 1 ? 's' : ''}</span>
                    {!size.active && (
                      <span className="text-xs text-gray-400">Inactive</span>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); openEditSizeForm(size) }}
                      className="text-blue-600 hover:text-blue-800 text-sm"
                    >
                      Edit
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteSize(size.id, size.name, skus.length) }}
                      className="text-red-600 hover:text-red-800 text-sm"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {/* SKUs Section (expanded) */}
                {isExpanded && (
                  <div className="border-t bg-gray-50 px-4 py-3">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-medium text-gray-700">SKUs / Variants</span>
                      <button
                        onClick={() => openAddSkuForm(size.id)}
                        className="text-sm text-green-600 hover:text-green-800 font-medium"
                      >
                        + Add SKU
                      </button>
                    </div>

                    {/* Add/Edit SKU Form */}
                    {(isAddingSku || isEditingSkuForThisSize) && (
                      <div className="mb-4 p-3 bg-white border rounded">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">SKU Code *</label>
                            <input
                              type="text"
                              value={skuForm.sku}
                              onChange={(e) => setSkuForm({ ...skuForm, sku: e.target.value })}
                              className="w-full border rounded px-2 py-1.5 text-sm"
                              placeholder="DPT26-RED"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Variant Name</label>
                            <input
                              type="text"
                              value={skuForm.name}
                              onChange={(e) => setSkuForm({ ...skuForm, name: e.target.value })}
                              className="w-full border rounded px-2 py-1.5 text-sm"
                              placeholder="Red"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Barcode</label>
                            <input
                              type="text"
                              value={skuForm.barcode}
                              onChange={(e) => setSkuForm({ ...skuForm, barcode: e.target.value })}
                              className="w-full border rounded px-2 py-1.5 text-sm"
                              placeholder="123456789"
                            />
                          </div>
                          <div className="flex items-end gap-2">
                            <label className="flex items-center gap-1">
                              <input
                                type="checkbox"
                                checked={skuForm.active}
                                onChange={(e) => setSkuForm({ ...skuForm, active: e.target.checked })}
                                className="rounded"
                              />
                              <span className="text-xs text-gray-700">Active</span>
                            </label>
                            <button
                              onClick={() => handleSaveSku(size.id)}
                              disabled={saving || !skuForm.sku}
                              className="px-3 py-1.5 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 disabled:opacity-50"
                            >
                              {saving ? '...' : editingSku ? 'Update' : 'Add'}
                            </button>
                            <button
                              onClick={resetSkuForm}
                              className="px-3 py-1.5 border border-gray-300 rounded text-xs font-medium text-gray-700 hover:bg-gray-50"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* SKUs Table */}
                    {skus.length === 0 ? (
                      <p className="text-sm text-gray-500 italic">
                        No SKUs added yet. Orders will use fallback patterns.
                      </p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-gray-500 uppercase">
                            <th className="text-left py-1">SKU</th>
                            <th className="text-left py-1">Variant</th>
                            <th className="text-left py-1">Barcode</th>
                            <th className="text-left py-1">Status</th>
                            <th className="text-right py-1">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {skus.map((sku) => (
                            <tr key={sku.sku} className={!sku.active ? 'opacity-50' : ''}>
                              <td className="py-2 font-mono text-gray-900">{sku.sku}</td>
                              <td className="py-2 text-gray-600">{sku.name || '—'}</td>
                              <td className="py-2 text-gray-600 font-mono">{sku.barcode || '—'}</td>
                              <td className="py-2">
                                {sku.active ? (
                                  <span className="text-green-600 text-xs">Active</span>
                                ) : (
                                  <span className="text-gray-400 text-xs">Inactive</span>
                                )}
                              </td>
                              <td className="py-2 text-right">
                                <button
                                  onClick={() => openEditSkuForm(sku)}
                                  className="text-blue-600 hover:text-blue-800 text-xs mr-2"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleDeleteSku(sku.sku)}
                                  className="text-red-600 hover:text-red-800 text-xs"
                                >
                                  Delete
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      <p className="mt-4 text-sm text-gray-500">
        {sizes.length} size{sizes.length !== 1 ? 's' : ''}, {config?.skus.length || 0} SKU{(config?.skus.length || 0) !== 1 ? 's' : ''} configured
      </p>
    </div>
  )
}
