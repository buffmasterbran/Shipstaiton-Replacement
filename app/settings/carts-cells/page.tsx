'use client'

import { useState, useEffect } from 'react'

interface PickCell {
  id: string
  name: string
  active: boolean
}

interface PickCart {
  id: string
  name: string
  color: string | null
  status: string
  active: boolean
}

export default function CartsCellsSettingsPage() {
  const [cells, setCells] = useState<PickCell[]>([])
  const [loadingCells, setLoadingCells] = useState(true)
  const [newCellName, setNewCellName] = useState('')
  const [savingCell, setSavingCell] = useState(false)
  const [cellMessage, setCellMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [carts, setCarts] = useState<PickCart[]>([])
  const [loadingCarts, setLoadingCarts] = useState(true)
  const [newCartName, setNewCartName] = useState('')
  const [newCartColor, setNewCartColor] = useState('')
  const [savingCart, setSavingCart] = useState(false)
  const [cartMessage, setCartMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    fetch('/api/cells')
      .then((res) => res.json())
      .then((data) => setCells(data.cells || []))
      .catch(() => setCells([]))
      .finally(() => setLoadingCells(false))

    fetch('/api/carts')
      .then((res) => res.json())
      .then((data) => setCarts(data.carts || []))
      .catch(() => setCarts([]))
      .finally(() => setLoadingCarts(false))
  }, [])

  // Cell handlers
  const handleAddCell = async () => {
    if (!newCellName.trim()) return
    setSavingCell(true)
    setCellMessage(null)
    try {
      const res = await fetch('/api/cells', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCellName.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create cell')
      setCells((prev) => [...prev, data.cell].sort((a, b) => a.name.localeCompare(b.name)))
      setNewCellName('')
      setCellMessage({ type: 'success', text: 'Cell created' })
    } catch (e: unknown) {
      setCellMessage({ type: 'error', text: (e as Error)?.message || 'Failed to create cell' })
    } finally {
      setSavingCell(false)
    }
  }

  const handleToggleCell = async (cell: PickCell) => {
    try {
      const res = await fetch('/api/cells', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: cell.id, active: !cell.active }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setCells((prev) => prev.map((c) => (c.id === cell.id ? data.cell : c)))
    } catch (e) {
      console.error('Failed to toggle cell:', e)
    }
  }

  const handleDeleteCell = async (cell: PickCell) => {
    if (!confirm(`Delete cell "${cell.name}"?`)) return
    try {
      const res = await fetch(`/api/cells?id=${cell.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setCells((prev) => prev.filter((c) => c.id !== cell.id))
    } catch (e: unknown) {
      alert((e as Error)?.message || 'Failed to delete cell')
    }
  }

  // Cart handlers
  const handleAddCart = async () => {
    if (!newCartName.trim()) return
    setSavingCart(true)
    setCartMessage(null)
    try {
      const res = await fetch('/api/carts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCartName.trim(), color: newCartColor.trim() || null }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create cart')
      setCarts((prev) => [...prev, data.cart].sort((a, b) => a.name.localeCompare(b.name)))
      setNewCartName('')
      setNewCartColor('')
      setCartMessage({ type: 'success', text: 'Cart created' })
    } catch (e: unknown) {
      setCartMessage({ type: 'error', text: (e as Error)?.message || 'Failed to create cart' })
    } finally {
      setSavingCart(false)
    }
  }

  const handleToggleCart = async (cart: PickCart) => {
    try {
      const res = await fetch('/api/carts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: cart.id, active: !cart.active }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setCarts((prev) => prev.map((c) => (c.id === cart.id ? data.cart : c)))
    } catch (e) {
      console.error('Failed to toggle cart:', e)
    }
  }

  const handleDeleteCart = async (cart: PickCart) => {
    if (!confirm(`Delete cart "${cart.name}"?`)) return
    try {
      const res = await fetch(`/api/carts?id=${cart.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setCarts((prev) => prev.filter((c) => c.id !== cart.id))
    } catch (e: unknown) {
      alert((e as Error)?.message || 'Failed to delete cart')
    }
  }

  const handleReleaseCart = async (cart: PickCart) => {
    const statusText = cart.status === 'PICKING' ? 'being picked' : 'ready for shipping'
    const confirmed = confirm(
      `Release cart "${cart.name}"?\n\n` +
      `This cart is currently ${statusText}.\n\n` +
      `Releasing will:\n` +
      `• Cancel any active picks\n` +
      `• Return orders to the batch queue\n` +
      `• Make the cart available again\n\n` +
      `Physical items in the cart must be returned to shelves manually.`
    )
    
    if (!confirmed) return
    
    try {
      const res = await fetch('/api/carts/release', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cartId: cart.id, reason: 'admin_release' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      
      setCarts((prev) => prev.map((c) => (c.id === cart.id ? { ...c, status: 'AVAILABLE' } : c)))
      
      setCartMessage({ 
        type: 'success', 
        text: `Cart released. ${data.ordersReturned} order(s) returned to queue.` 
      })
    } catch (e: unknown) {
      setCartMessage({ type: 'error', text: (e as Error)?.message || 'Failed to release cart' })
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Carts & Cells</h1>

      {/* Picking Cells */}
      <div className="bg-white rounded-lg shadow p-6 max-w-2xl mb-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-2">Picking Cells</h2>
        <p className="text-sm text-gray-500 mb-6">
          Physical picking cells in the warehouse. Each cell handles specific box sizes for clean pallet stacking.
        </p>

        {loadingCells ? (
          <p className="text-gray-500 text-sm">Loading cells...</p>
        ) : (
          <>
            {cells.length > 0 && (
              <div className="mb-4 space-y-2">
                {cells.map((cell) => (
                  <div
                    key={cell.id}
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      cell.active ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`font-medium ${cell.active ? 'text-gray-900' : 'text-gray-400'}`}>
                        {cell.name}
                      </span>
                      {!cell.active && (
                        <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded">Inactive</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleToggleCell(cell)}
                        className={`text-xs px-2 py-1 rounded ${
                          cell.active
                            ? 'text-amber-600 hover:bg-amber-50'
                            : 'text-green-600 hover:bg-green-50'
                        }`}
                      >
                        {cell.active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        onClick={() => handleDeleteCell(cell)}
                        className="text-xs text-red-600 hover:bg-red-50 px-2 py-1 rounded"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Cell name (e.g., Cell A)"
                value={newCellName}
                onChange={(e) => setNewCellName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddCell()}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <button
                onClick={handleAddCell}
                disabled={savingCell || !newCellName.trim()}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium"
              >
                {savingCell ? 'Adding...' : 'Add Cell'}
              </button>
            </div>
            {cellMessage && (
              <p className={`mt-2 text-sm ${cellMessage.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                {cellMessage.text}
              </p>
            )}
          </>
        )}
      </div>

      {/* Picking Carts */}
      <div className="bg-white rounded-lg shadow p-6 max-w-2xl mb-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-2">Picking Carts</h2>
        <p className="text-sm text-gray-500 mb-6">
          Physical carts with 12 bins (4 wide x 3 shelves). Pickers place items into numbered bins on these carts.
        </p>

        {loadingCarts ? (
          <p className="text-gray-500 text-sm">Loading carts...</p>
        ) : (
          <>
            {carts.length > 0 && (
              <div className="mb-4 space-y-2">
                {carts.map((cart) => {
                  const isInUse = cart.status === 'PICKING'
                  const isReady = cart.status === 'PICKED_READY'
                  const canRelease = isInUse || isReady
                  
                  return (
                    <div
                      key={cart.id}
                      className={`flex items-center justify-between p-3 rounded-lg border ${
                        cart.active ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-200'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {cart.color && (
                          <div
                            className="w-4 h-4 rounded-full border border-gray-300"
                            style={{ backgroundColor: cart.color }}
                            title={cart.color}
                          />
                        )}
                        <span className={`font-medium ${cart.active ? 'text-gray-900' : 'text-gray-400'}`}>
                          {cart.name}
                        </span>
                        {!cart.active && (
                          <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded">Inactive</span>
                        )}
                        {cart.status === 'AVAILABLE' && cart.active && (
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                            Available
                          </span>
                        )}
                        {isInUse && (
                          <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded">
                            In Use (Picking)
                          </span>
                        )}
                        {isReady && (
                          <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">
                            Ready for Shipping
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {canRelease && (
                          <button
                            onClick={() => handleReleaseCart(cart)}
                            className="text-xs px-3 py-1.5 rounded bg-orange-100 text-orange-700 hover:bg-orange-200 font-semibold border border-orange-300"
                          >
                            Release Cart
                          </button>
                        )}
                        <button
                          onClick={() => handleToggleCart(cart)}
                          className={`text-xs px-2 py-1 rounded ${
                            cart.active
                              ? 'text-amber-600 hover:bg-amber-50'
                              : 'text-green-600 hover:bg-green-50'
                          }`}
                        >
                          {cart.active ? 'Deactivate' : 'Activate'}
                        </button>
                        {!canRelease && (
                          <button
                            onClick={() => handleDeleteCart(cart)}
                            className="text-xs text-red-600 hover:bg-red-50 px-2 py-1 rounded"
                          >
                            Delete
                          </button>
                        )}
                        {canRelease && (
                          <span className="text-xs text-gray-400" title="Release the cart first before deleting">
                            (Release to delete)
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Cart name (e.g., Cart 1)"
                value={newCartName}
                onChange={(e) => setNewCartName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddCart()}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <input
                type="text"
                placeholder="Color (optional)"
                value={newCartColor}
                onChange={(e) => setNewCartColor(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddCart()}
                className="w-32 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <button
                onClick={handleAddCart}
                disabled={savingCart || !newCartName.trim()}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium"
              >
                {savingCart ? 'Adding...' : 'Add Cart'}
              </button>
            </div>
            {cartMessage && (
              <p className={`mt-2 text-sm ${cartMessage.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                {cartMessage.text}
              </p>
            )}

            {carts.length === 0 && (
              <p className="mt-4 text-sm text-gray-500">
                No carts configured. Add carts like &quot;Cart 1&quot;, &quot;Cart 2&quot;, etc.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
