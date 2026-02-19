'use client'

import { useState, useEffect } from 'react'
import type { OrderHighlightSettings } from '@/lib/settings'
import type { CarrierService } from '@/hooks/useReferenceData'
import ServiceSelect from '@/components/ui/ServiceSelect'

interface SinglesCarrier {
  carrierId: string
  carrierCode: string
  carrier: string
  serviceCode: string
  serviceName: string
}

export default function GeneralSettingsPage() {
  const [orderHighlight, setOrderHighlight] = useState<OrderHighlightSettings | null>(null)
  const [singlesCarrier, setSinglesCarrier] = useState<SinglesCarrier | null>(null)
  const [availableServices, setAvailableServices] = useState<CarrierService[]>([])
  const [loadingServices, setLoadingServices] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingSingles, setSavingSingles] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [singlesMessage, setSinglesMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [engravingPauseEnabled, setEngravingPauseEnabled] = useState(false)
  const [savingPause, setSavingPause] = useState(false)

  useEffect(() => {
    fetch('/api/settings')
      .then((res) => res.json())
      .then((data) => {
        if (data.order_highlight) setOrderHighlight(data.order_highlight)
        if (data.singles_carrier) setSinglesCarrier(data.singles_carrier)
        const pauseSetting = (data.settings || []).find((s: any) => s.key === 'engraving_pause_enabled')
        if (pauseSetting?.value?.enabled) setEngravingPauseEnabled(true)
      })
      .catch(() => {
        setOrderHighlight(null)
        setSinglesCarrier(null)
      })
      .finally(() => setLoading(false))

    fetch('/api/settings')
      .then((res) => res.json())
      .then((data) => {
        const setting = data.settings?.find((s: { key: string }) => s.key === 'selected_services')
        if (setting?.value?.services) {
          const seen = new Set<string>()
          const deduped = setting.value.services.filter((s: CarrierService) => {
            const key = `${s.carrierCode}:${s.serviceCode}`
            if (seen.has(key)) return false
            seen.add(key)
            return true
          })
          setAvailableServices(deduped)
        }
      })
      .catch(() => setAvailableServices([]))
      .finally(() => setLoadingServices(false))
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

  const handleServiceChange = (serviceCode: string) => {
    const service = availableServices.find(s => s.serviceCode === serviceCode)
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

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">General Settings</h1>
        <p className="text-gray-500">Loading...</p>
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
      <h1 className="text-2xl font-bold text-gray-900 mb-6">General Settings</h1>

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
                0&ndash;{oh.orangeMinDays} days
              </div>
              <span className="text-sm text-gray-600">No highlight (newest)</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-32 h-8 bg-white border-l-4 border-l-yellow-400 border rounded flex items-center justify-center text-xs text-gray-700 font-medium">
                {oh.orangeMinDays + 1}&ndash;{oh.orangeMaxDays} days
              </div>
              <span className="text-sm text-gray-600">Yellow accent</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-32 h-8 bg-white border-l-4 border-l-red-500 border rounded flex items-center justify-center text-xs text-gray-700 font-medium">
                {oh.redMinDays}+ days
              </div>
              <span className="text-sm text-gray-600">Red accent (oldest)</span>
            </div>
          </div>
        </div>

        {/* Settings inputs */}
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <span className="inline-block w-3 h-3 bg-yellow-400 rounded mr-2"></span>
                Yellow: start at
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
                <span className="inline-block w-3 h-3 bg-yellow-400 rounded mr-2"></span>
                Yellow: end at
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
              <span className="inline-block w-3 h-3 bg-red-500 rounded mr-2"></span>
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
            {saving ? 'Saving...' : 'Save Settings'}
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
          <p className="text-amber-600 text-sm">No services selected. Go to <a href="/settings/carriers" className="underline font-medium">Carriers</a> to select which services to use.</p>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Shipping Service
              </label>
              <ServiceSelect
                value={singlesCarrier?.serviceCode || ''}
                onChange={handleServiceChange}
                carrierServices={availableServices}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="Select a service..."
                showRateShop={false}
              />
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
            {savingSingles ? 'Saving...' : 'Save Singles Carrier'}
          </button>
          {singlesMessage && (
            <span className={singlesMessage.type === 'success' ? 'text-green-600 text-sm' : 'text-red-600 text-sm'}>
              {singlesMessage.text}
            </span>
          )}
        </div>
      </div>

      {/* SKU Display Names */}
      <div className="bg-white rounded-lg shadow p-6 max-w-2xl mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">SKU Display Names</h2>
        <p className="text-sm text-gray-500 mb-4">
          These mappings translate SKU prefixes into readable names for the admin tabs and picker screens.
        </p>
        <div className="bg-gray-50 rounded-lg p-4">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="pb-2 font-medium">SKU Prefix</th>
                <th className="pb-2 font-medium">Display Name</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              <tr><td className="py-1.5 font-mono">LID-AT</td><td className="py-1.5">Air-tight Lid</td></tr>
              <tr><td className="py-1.5 font-mono">LID-PS</td><td className="py-1.5">Perfect Sip Lid</td></tr>
              <tr><td className="py-1.5 font-mono">PTLD-OG</td><td className="py-1.5">OG Air-tight Lid</td></tr>
              <tr><td className="py-1.5 font-mono">LDRACK</td><td className="py-1.5">Lid Rack</td></tr>
            </tbody>
          </table>
          <p className="text-xs text-gray-400 mt-3">
            To add more mappings, update the SKU_DISPLAY_NAMES constant in SinglesOrdersTable.tsx
          </p>
            </div>
      </div>

      {/* Engraving Station */}
      <div className="bg-white rounded-lg shadow p-6 max-w-2xl mb-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-2">Engraving Station</h2>
        <p className="text-sm text-gray-500 mb-4">
          Controls for the engraving station workflow.
        </p>
        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <div>
            <span className="text-gray-700 text-sm font-medium">Allow engravers to pause mid-cart</span>
            <p className="text-xs text-gray-400 mt-0.5">When enabled, a Pause button appears during engraving. Timer stops while paused.</p>
          </div>
          <button
            onClick={async () => {
              const newValue = !engravingPauseEnabled
              setSavingPause(true)
              try {
                await fetch('/api/settings', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ key: 'engraving_pause_enabled', value: { enabled: newValue } }),
                })
                setEngravingPauseEnabled(newValue)
              } catch {}
              setSavingPause(false)
            }}
            disabled={savingPause}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              engravingPauseEnabled ? 'bg-purple-600' : 'bg-gray-300'
            } ${savingPause ? 'opacity-50' : ''}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              engravingPauseEnabled ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </button>
        </div>
      </div>

      {/* Picking Configuration */}
      <div className="bg-white rounded-lg shadow p-6 max-w-2xl">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Picking Configuration</h2>
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <span className="text-gray-700">Max items per bin (Standard)</span>
            <span className="font-mono font-bold text-gray-900">24</span>
          </div>
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <span className="text-gray-700">Max items per bin (Water bottles)</span>
            <span className="font-mono font-bold text-gray-900">9</span>
          </div>
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <span className="text-gray-700">Bins per cart</span>
            <span className="font-mono font-bold text-gray-900">12 (4 wide x 3 tall)</span>
                      </div>
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <span className="text-gray-700">Bulk shelves per cart</span>
            <span className="font-mono font-bold text-gray-900">3 (4 bins per shelf)</span>
                      </div>
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <span className="text-gray-700">Singles spot-check rate</span>
            <span className="font-mono font-bold text-gray-900">20%</span>
                    </div>
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <span className="text-gray-700">Bulk threshold (min identical orders)</span>
            <span className="font-mono font-bold text-gray-900">4 (configurable via slider)</span>
              </div>
            </div>
      </div>
    </div>
  )
}
