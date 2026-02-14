'use client'

import { useState, useEffect } from 'react'

const emptyAddress = {
  name: '',
  company: '',
  street1: '',
  street2: '',
  city: '',
  state: '',
  postalCode: '',
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
  phone: '5125551234',
}

interface DbLocation {
  id: string
  name: string
  company: string | null
  addressLine1: string
  addressLine2: string | null
  city: string
  state: string
  postalCode: string
  country: string
  phone: string
  email: string | null
  isDefault: boolean
}

// Normalize country to 2-letter code (ShipEngine requires this)
function normalizeCountry(country: string): string {
  const c = (country || 'US').trim().toUpperCase()
  const map: Record<string, string> = {
    'UNITED STATES': 'US', 'USA': 'US', 'U.S.A.': 'US', 'U.S.': 'US',
    'CANADA': 'CA', 'MEXICO': 'MX', 'UNITED KINGDOM': 'GB', 'UK': 'GB',
  }
  return map[c] || (c.length === 2 ? c : 'US')
}

function locationToAddress(loc: DbLocation) {
  return {
    name: loc.name || '',
    company: loc.company || '',
    street1: loc.addressLine1 || '',
    street2: loc.addressLine2 || '',
    city: loc.city || '',
    state: loc.state || '',
    postalCode: loc.postalCode || '',
    country: normalizeCountry(loc.country),
    phone: loc.phone || '',
  }
}

export default function ShipEngineTestPage() {
  const [shipFrom, setShipFrom] = useState(emptyAddress)
  const [shipTo, setShipTo] = useState(defaultShipTo)
  const [locations, setLocations] = useState<DbLocation[]>([])
  const [selectedLocationId, setSelectedLocationId] = useState<string>('')

  // Load locations from database
  useEffect(() => {
    async function loadLocations() {
      try {
        const res = await fetch('/api/locations')
        if (res.ok) {
          const data = await res.json()
          const locs: DbLocation[] = data.locations || []
          setLocations(locs)
          // Pre-select default location
          const defaultLoc = locs.find(l => l.isDefault) || locs[0]
          if (defaultLoc) {
            setSelectedLocationId(defaultLoc.id)
            setShipFrom(locationToAddress(defaultLoc))
          }
        }
      } catch {
        // Fall back to empty
      }
    }
    loadLocations()
  }, [])

  const handleLocationChange = (locationId: string) => {
    setSelectedLocationId(locationId)
    if (locationId === 'custom') {
      setShipFrom(emptyAddress)
      return
    }
    const loc = locations.find(l => l.id === locationId)
    if (loc) {
      setShipFrom(locationToAddress(loc))
    }
  }
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

  const [labelInfo, setLabelInfo] = useState<{
    trackingNumber?: string
    cost?: string
    labelUrl?: string
    labelId?: string
    status?: string
  } | null>(null)

  const createLabel = async () => {
    setLoading('label')
    setError(null)
    setResult(null)
    setLabelInfo(null)
    try {
      const res = await fetch('/api/shipengine/create-label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, serviceCode }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || JSON.stringify(data.details || data, null, 2))
        return
      }
      // Extract key info
      setLabelInfo({
        trackingNumber: data.tracking_number,
        cost: data.shipment_cost?.amount ? `$${data.shipment_cost.amount}` : undefined,
        labelUrl: data.label_download?.pdf || data.label_download?.href,
        labelId: data.label_id,
        status: data.status,
      })
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
          {/* Location dropdown */}
          <div className="mb-3">
            <label className="block text-xs text-gray-500 mb-1">Location</label>
            <select
              value={selectedLocationId}
              onChange={(e) => handleLocationChange(e.target.value)}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm bg-white"
            >
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}{loc.isDefault ? ' (default)' : ''} — {loc.city}, {loc.state}
                </option>
              ))}
              <option value="custom">Custom address...</option>
            </select>
          </div>
          {(['name', 'company', 'street1', 'street2', 'city', 'state', 'postalCode', 'country', 'phone'] as const).map((f) => (
            <div key={f} className="mb-2">
              <label className="block text-xs text-gray-500 capitalize">{f === 'postalCode' ? 'Postal Code' : f === 'street1' ? 'Address 1' : f === 'street2' ? 'Address 2' : f}</label>
              <input
                type="text"
                value={shipFrom[f]}
                onChange={(e) => {
                  setShipFrom((s) => ({ ...s, [f]: e.target.value }))
                  if (selectedLocationId !== 'custom') setSelectedLocationId('custom')
                }}
                className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
              />
            </div>
          ))}
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="font-semibold text-gray-800 mb-3">Ship To</h2>
          {(['name', 'company', 'street1', 'street2', 'city', 'state', 'postalCode', 'country', 'phone'] as const).map((f) => (
            <div key={f} className="mb-2">
              <label className="block text-xs text-gray-500 capitalize">{f === 'postalCode' ? 'Postal Code' : f === 'street1' ? 'Address 1' : f === 'street2' ? 'Address 2' : f}</label>
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

      {/* Label summary card */}
      {labelInfo && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-green-800 font-semibold mb-3">Label Created Successfully</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            {labelInfo.trackingNumber && (
              <div>
                <span className="text-gray-500 block text-xs">Tracking #</span>
                <span className="font-mono text-gray-900">{labelInfo.trackingNumber}</span>
              </div>
            )}
            {labelInfo.cost && (
              <div>
                <span className="text-gray-500 block text-xs">Cost</span>
                <span className="font-semibold text-gray-900">{labelInfo.cost}</span>
              </div>
            )}
            {labelInfo.labelId && (
              <div>
                <span className="text-gray-500 block text-xs">Label ID</span>
                <span className="font-mono text-gray-900 text-xs">{labelInfo.labelId}</span>
              </div>
            )}
            {labelInfo.status && (
              <div>
                <span className="text-gray-500 block text-xs">Status</span>
                <span className="text-gray-900">{labelInfo.status}</span>
              </div>
            )}
          </div>
          {labelInfo.labelUrl && (
            <a
              href={labelInfo.labelUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-3 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Download Label PDF
            </a>
          )}
        </div>
      )}

      {result && (
        <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <p className="text-gray-800 font-medium mb-2">Raw Response</p>
          <pre className="text-sm text-gray-700 whitespace-pre-wrap overflow-auto max-h-96">{result}</pre>
        </div>
      )}
    </div>
  )
}
