'use client'

import { useState } from 'react'

const defaultShipFrom = {
  name: 'Test Sender',
  company: 'Test Co',
  street1: '4009 Marathon Blvd',
  street2: '',
  city: 'Austin',
  state: 'TX',
  postalCode: '78756',
  country: 'US',
  phone: '',
}

const defaultShipTo = {
  name: 'Test Recipient',
  company: '',
  street1: '123 Main St',
  street2: '',
  city: 'Austin',
  state: 'TX',
  postalCode: '78701',
  country: 'US',
  phone: '',
}

export default function ShipEngineTestPage() {
  const [shipFrom, setShipFrom] = useState(defaultShipFrom)
  const [shipTo, setShipTo] = useState(defaultShipTo)
  const [weight, setWeight] = useState({ value: 1, unit: 'pound' })
  const [dimensions, setDimensions] = useState({ length: 7, width: 7, height: 7, unit: 'inch' })
  const [serviceCode, setServiceCode] = useState('usps_ground_advantage')
  const [services, setServices] = useState<Array<{ service_code: string; service_name: string; carrier: string }>>([])
  const [loading, setLoading] = useState<'services' | 'label' | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const payload = {
    shipFrom: {
      name: shipFrom.name,
      company: shipFrom.company || undefined,
      street1: shipFrom.street1,
      street2: shipFrom.street2 || undefined,
      city: shipFrom.city,
      state: shipFrom.state,
      postalCode: shipFrom.postalCode,
      country: shipFrom.country,
      phone: shipFrom.phone || undefined,
    },
    shipTo: {
      name: shipTo.name,
      company: shipTo.company || undefined,
      street1: shipTo.street1,
      street2: shipTo.street2 || undefined,
      city: shipTo.city,
      state: shipTo.state,
      postalCode: shipTo.postalCode,
      country: shipTo.country,
      phone: shipTo.phone || undefined,
    },
    weight: { value: weight.value, unit: weight.unit },
    dimensions: { length: dimensions.length, width: dimensions.width, height: dimensions.height, unit: dimensions.unit },
  }

  const getServices = async () => {
    setLoading('services')
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/shipengine/get-services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || JSON.stringify(data, null, 2))
        return
      }
      setServices(data.services || [])
      if (data.services?.length) setServiceCode(data.services[0].service_code)
      setResult(JSON.stringify(data, null, 2))
    } catch (e: any) {
      setError(e?.message || 'Request failed')
    } finally {
      setLoading(null)
    }
  }

  const createLabel = async () => {
    setLoading('label')
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/shipengine/create-label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, serviceCode }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || JSON.stringify(data, null, 2))
        return
      }
      setResult(JSON.stringify(data, null, 2))
    } catch (e: any) {
      setError(e?.message || 'Request failed')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">ShipEngine Test</h1>
      <p className="text-gray-600 mb-6">
        Test ShipEngine API: fetch services and create a label. Uses <code className="text-sm bg-gray-100 px-1">SHIPENGINE_API_KEY</code> from env.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="font-semibold text-gray-800 mb-3">Ship From</h2>
          {(['name', 'company', 'street1', 'street2', 'city', 'state', 'postalCode', 'country'] as const).map((f) => (
            <div key={f} className="mb-2">
              <label className="block text-xs text-gray-500 capitalize">{f}</label>
              <input
                type="text"
                value={shipFrom[f]}
                onChange={(e) => setShipFrom((s) => ({ ...s, [f]: e.target.value }))}
                className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
              />
            </div>
          ))}
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="font-semibold text-gray-800 mb-3">Ship To</h2>
          {(['name', 'company', 'street1', 'street2', 'city', 'state', 'postalCode', 'country'] as const).map((f) => (
            <div key={f} className="mb-2">
              <label className="block text-xs text-gray-500 capitalize">{f}</label>
              <input
                type="text"
                value={shipTo[f]}
                onChange={(e) => setShipTo((s) => ({ ...s, [f]: e.target.value }))}
                className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-4 mb-6 flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-xs text-gray-500">Weight (value)</label>
          <input
            type="number"
            step={0.1}
            value={weight.value}
            onChange={(e) => setWeight((w) => ({ ...w, value: Number(e.target.value) }))}
            className="w-20 border border-gray-300 rounded px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500">Unit</label>
          <select
            value={weight.unit}
            onChange={(e) => setWeight((w) => ({ ...w, unit: e.target.value }))}
            className="border border-gray-300 rounded px-2 py-1 text-sm"
          >
            <option value="pound">pound</option>
            <option value="ounce">ounce</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500">L × W × H (in)</label>
          <div className="flex gap-1">
            <input
              type="number"
              value={dimensions.length}
              onChange={(e) => setDimensions((d) => ({ ...d, length: Number(e.target.value) }))}
              className="w-14 border border-gray-300 rounded px-2 py-1 text-sm"
            />
            <input
              type="number"
              value={dimensions.width}
              onChange={(e) => setDimensions((d) => ({ ...d, width: Number(e.target.value) }))}
              className="w-14 border border-gray-300 rounded px-2 py-1 text-sm"
            />
            <input
              type="number"
              value={dimensions.height}
              onChange={(e) => setDimensions((d) => ({ ...d, height: Number(e.target.value) }))}
              className="w-14 border border-gray-300 rounded px-2 py-1 text-sm"
            />
          </div>
        </div>
        {services.length > 0 && (
          <div className="min-w-[200px]">
            <label className="block text-xs text-gray-500">Service</label>
            <select
              value={serviceCode}
              onChange={(e) => setServiceCode(e.target.value)}
              className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
            >
              {services.map((s) => (
                <option key={s.service_code} value={s.service_code}>
                  {s.service_name} ({s.service_code})
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={getServices}
            disabled={loading !== null}
            className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 text-sm font-medium"
          >
            {loading === 'services' ? 'Loading…' : 'Get services'}
          </button>
          <button
            type="button"
            onClick={createLabel}
            disabled={loading !== null}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium"
          >
            {loading === 'label' ? 'Creating…' : 'Create test label'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-800 font-medium mb-2">Error</p>
          <pre className="text-sm text-red-700 whitespace-pre-wrap overflow-auto max-h-60">{error}</pre>
        </div>
      )}
      {result && (
        <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <p className="text-gray-800 font-medium mb-2">Response</p>
          <pre className="text-sm text-gray-700 whitespace-pre-wrap overflow-auto max-h-96">{result}</pre>
        </div>
      )}
    </div>
  )
}
