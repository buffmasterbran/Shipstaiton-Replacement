'use client'

import { useState, useEffect } from 'react'
import type { OrderHighlightSettings } from '@/lib/settings'

interface CarrierService {
  carrierId: string
  carrierCode: string
  carrierName: string
  serviceCode: string
  serviceName: string
}

interface SinglesCarrier {
  carrierId: string
  carrierCode: string
  carrier: string
  serviceCode: string
  serviceName: string
}

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

export default function SettingsPage() {
  const [orderHighlight, setOrderHighlight] = useState<OrderHighlightSettings | null>(null)
  const [singlesCarrier, setSinglesCarrier] = useState<SinglesCarrier | null>(null)
  const [availableServices, setAvailableServices] = useState<CarrierService[]>([])
  const [loadingServices, setLoadingServices] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingSingles, setSavingSingles] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [singlesMessage, setSinglesMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Cell management state
  const [cells, setCells] = useState<PickCell[]>([])
  const [loadingCells, setLoadingCells] = useState(true)
  const [newCellName, setNewCellName] = useState('')
  const [savingCell, setSavingCell] = useState(false)
  const [cellMessage, setCellMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Cart management state
  const [carts, setCarts] = useState<PickCart[]>([])
  const [loadingCarts, setLoadingCarts] = useState(true)
  const [newCartName, setNewCartName] = useState('')
  const [newCartColor, setNewCartColor] = useState('')
  const [savingCart, setSavingCart] = useState(false)
  const [cartMessage, setCartMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    // Fetch settings
    fetch('/api/settings')
      .then((res) => res.json())
      .then((data) => {
        if (data.order_highlight) setOrderHighlight(data.order_highlight)
        if (data.singles_carrier) setSinglesCarrier(data.singles_carrier)
      })
      .catch(() => {
        setOrderHighlight(null)
        setSinglesCarrier(null)
      })
      .finally(() => setLoading(false))

    // Fetch available carriers/services
    fetch('/api/shipengine/carriers?includeServices=true')
      .then((res) => res.json())
      .then((data) => {
        const services: CarrierService[] = []
        for (const carrier of data.carriers || []) {
          for (const service of carrier.services || []) {
            services.push({
              carrierId: carrier.carrier_id,
              carrierCode: carrier.carrier_code,
              carrierName: carrier.friendly_name,
              serviceCode: service.service_code,
              serviceName: service.name,
            })
          }
        }
        setAvailableServices(services)
      })
      .catch(() => setAvailableServices([]))
      .finally(() => setLoadingServices(false))

    // Fetch cells
    fetch('/api/cells')
      .then((res) => res.json())
      .then((data) => setCells(data.cells || []))
      .catch(() => setCells([]))
      .finally(() => setLoadingCells(false))

    // Fetch carts
    fetch('/api/carts')
      .then((res) => res.json())
      .then((data) => setCarts(data.carts || []))
      .catch(() => setCarts([]))
      .finally(() => setLoadingCarts(false))
  }, [])

  const handleSave = async () => {
    if (!orderHighlight) return
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_highlight: orderHighlight }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')
      setOrderHighlight(data.order_highlight)
      setMessage({ type: 'success', text: 'Settings saved.' })
    } catch (e: unknown) {
      setMessage({ type: 'error', text: (e as Error)?.message || 'Failed to save' })
    } finally {
      setSaving(false)
    }
  }

  const handleSaveSinglesCarrier = async () => {
    if (!singlesCarrier) return
    setSavingSingles(true)
    setSinglesMessage(null)
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'singles_carrier', value: singlesCarrier }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')
      setSinglesMessage({ type: 'success', text: 'Singles carrier saved.' })
    } catch (e: unknown) {
      setSinglesMessage({ type: 'error', text: (e as Error)?.message || 'Failed to save' })
    } finally {
      setSavingSingles(false)
    }
  }

  const handleServiceChange = (serviceKey: string) => {
    const service = availableServices.find(
      (s) => `${s.carrierCode}:${s.serviceCode}` === serviceKey
    )
    if (service) {
      setSinglesCarrier({
        carrierId: service.carrierId,
        carrierCode: service.carrierCode,
        carrier: service.carrierName,
        serviceCode: service.serviceCode,
        serviceName: service.serviceName,
      })
    }
  }

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
      
      // Update cart in local state
      setCarts((prev) => prev.map((c) => (c.id === cart.id ? { ...c, status: 'AVAILABLE' } : c)))
      
      setCartMessage({ 
        type: 'success', 
        text: `Cart released. ${data.ordersReturned} order(s) returned to queue.` 
      })
    } catch (e: unknown) {
      setCartMessage({ type: 'error', text: (e as Error)?.message || 'Failed to release cart' })
    }
  }

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>
        <p className="text-gray-500">Loading…</p>
      </div>
    )
  }

  const oh = orderHighlight ?? {
    orangeMinDays: 3,
    orangeMaxDays: 5,
    redMinDays: 6,
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>

      <div className="bg-white rounded-lg shadow p-6 max-w-2xl mb-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-2">Order Highlight Colors</h2>
        <p className="text-sm text-gray-500 mb-6">
          Highlight orders on the All Orders tab based on how many days old they are. Similar to NetSuite saved search.
        </p>

        {/* Visual preview */}
        <div className="mb-6 p-4 bg-gray-50 rounded-lg border">
          <p className="text-xs font-medium text-gray-500 mb-3 uppercase tracking-wide">Preview</p>
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-32 h-8 bg-white border rounded flex items-center justify-center text-xs text-gray-600">
                0–{oh.orangeMinDays} days
              </div>
              <span className="text-sm text-gray-600">No highlight (newest)</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-32 h-8 bg-[#ff9900] rounded flex items-center justify-center text-xs text-white font-medium">
                {oh.orangeMinDays + 1}–{oh.orangeMaxDays} days
              </div>
              <span className="text-sm text-gray-600">Orange row</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-32 h-8 bg-[#ff0000] rounded flex items-center justify-center text-xs text-white font-medium">
                {oh.redMinDays}+ days
              </div>
              <span className="text-sm text-gray-600">Red row (oldest)</span>
            </div>
          </div>
        </div>

        {/* Settings inputs */}
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <span className="inline-block w-3 h-3 bg-[#ff9900] rounded mr-2"></span>
                Orange: start at
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={oh.orangeMinDays}
                  onChange={(e) =>
                    setOrderHighlight((prev) =>
                      prev ? { ...prev, orangeMinDays: Math.max(1, parseInt(e.target.value, 10) || 1) } : prev
                    )
                  }
                  className="w-20 border border-gray-300 rounded px-3 py-2 text-sm"
                />
                <span className="text-gray-500 text-sm">days old</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <span className="inline-block w-3 h-3 bg-[#ff9900] rounded mr-2"></span>
                Orange: end at
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={oh.orangeMaxDays}
                  onChange={(e) =>
                    setOrderHighlight((prev) =>
                      prev ? { ...prev, orangeMaxDays: Math.max(1, parseInt(e.target.value, 10) || 1) } : prev
                    )
                  }
                  className="w-20 border border-gray-300 rounded px-3 py-2 text-sm"
                />
                <span className="text-gray-500 text-sm">days old</span>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <span className="inline-block w-3 h-3 bg-[#ff0000] rounded mr-2"></span>
              Red: start at
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={365}
                value={oh.redMinDays}
                onChange={(e) =>
                  setOrderHighlight((prev) =>
                    prev ? { ...prev, redMinDays: Math.max(1, parseInt(e.target.value, 10) || 1) } : prev
                  )
                }
                className="w-20 border border-gray-300 rounded px-3 py-2 text-sm"
              />
              <span className="text-gray-500 text-sm">days old and older</span>
            </div>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t flex items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium"
          >
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
          {message && (
            <span className={message.type === 'success' ? 'text-green-600 text-sm' : 'text-red-600 text-sm'}>
              {message.text}
            </span>
          )}
        </div>
      </div>

      {/* Singles Carrier Setting */}
      <div className="bg-white rounded-lg shadow p-6 max-w-2xl mb-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-2">Singles Carrier</h2>
        <p className="text-sm text-gray-500 mb-6">
          The default shipping service used for single-item orders (1 item, quantity 1). These orders skip rate shopping and use this fixed carrier.
        </p>

        {loadingServices ? (
          <p className="text-gray-500 text-sm">Loading carriers...</p>
        ) : availableServices.length === 0 ? (
          <p className="text-amber-600 text-sm">No carriers available. Configure carriers in ShipEngine first.</p>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Shipping Service
              </label>
              <select
                value={singlesCarrier ? `${singlesCarrier.carrierCode}:${singlesCarrier.serviceCode}` : ''}
                onChange={(e) => handleServiceChange(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="">Select a service...</option>
                {availableServices.map((service) => (
                  <option
                    key={`${service.carrierCode}:${service.serviceCode}`}
                    value={`${service.carrierCode}:${service.serviceCode}`}
                  >
                    {service.carrierName} - {service.serviceName}
                  </option>
                ))}
              </select>
            </div>

            {singlesCarrier && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm text-green-700">
                  <span className="font-medium">Current:</span> {singlesCarrier.carrier} - {singlesCarrier.serviceName}
                </p>
              </div>
            )}

            {!singlesCarrier && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-700">
                  <span className="font-medium">Default:</span> USPS First Class Mail (no custom setting saved)
                </p>
              </div>
            )}
          </div>
        )}

        <div className="mt-6 pt-4 border-t flex items-center gap-3">
          <button
            type="button"
            onClick={handleSaveSinglesCarrier}
            disabled={savingSingles || !singlesCarrier}
            className="px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium"
          >
            {savingSingles ? 'Saving…' : 'Save Singles Carrier'}
          </button>
          {singlesMessage && (
            <span className={singlesMessage.type === 'success' ? 'text-green-600 text-sm' : 'text-red-600 text-sm'}>
              {singlesMessage.text}
            </span>
          )}
        </div>
      </div>

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
            {/* Existing cells */}
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

            {/* Add new cell */}
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
          Physical carts with 12 bins (4 wide × 3 shelves). Pickers place items into numbered bins on these carts.
        </p>

        {loadingCarts ? (
          <p className="text-gray-500 text-sm">Loading carts...</p>
        ) : (
          <>
            {/* Existing carts */}
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

            {/* Add new cart */}
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
