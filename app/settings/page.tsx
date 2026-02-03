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
    </div>
  )
}
