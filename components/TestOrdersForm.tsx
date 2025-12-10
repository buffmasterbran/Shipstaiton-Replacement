'use client'

import { useState } from 'react'

interface LabelResponse {
  label_id?: string
  status?: string
  shipment_id?: string
  ship_date?: string
  created_at?: string
  shipment_cost?: {
    currency?: string
    amount?: number
  }
  insurance_cost?: {
    currency?: string
    amount?: number
  }
  tracking_number?: string
  label_download?: {
    href?: string
    pdf?: string
    png?: string
    zpl?: string
  }
  form_download?: {
    href?: string
    type?: string
  }
  label_format?: string
  display_scheme?: string
  error?: string
  message?: string
}

export default function TestOrdersForm() {
  const [loading, setLoading] = useState(false)
  const [response, setResponse] = useState<LabelResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Default test order data for a single item order
  const [orderData, setOrderData] = useState({
    shipTo: {
      name: 'John Doe',
      company: '',
      street1: '123 Main St',
      street2: '',
      city: 'Austin',
      state: 'TX',
      postalCode: '78701',
      country: 'US',
      phone: '555-123-4567',
    },
    shipFrom: {
      name: 'Your Company',
      company: 'Your Company Inc',
      street1: '456 Business Ave',
      street2: '',
      city: 'Austin',
      state: 'TX',
      postalCode: '78702',
      country: 'US',
      phone: '555-987-6543',
    },
    weight: {
      value: 0.7,
      unit: 'pound',
    },
    dimensions: {
      length: 7,
      width: 7,
      height: 2.5,
      unit: 'inch',
    },
    serviceCode: 'usps_priority',
    packageCode: 'package',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setResponse(null)

    try {
      const res = await fetch('/api/shipengine/create-label', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(orderData),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || data.message || 'Failed to create label')
        setResponse(data)
      } else {
        setResponse(data)
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Test Single Order Label</h2>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Ship To */}
          <div className="border-b border-gray-200 pb-4">
            <h3 className="text-md font-medium text-gray-700 mb-3">Ship To</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={orderData.shipTo.name}
                  onChange={(e) => setOrderData({ ...orderData, shipTo: { ...orderData.shipTo, name: e.target.value } })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Company</label>
                <input
                  type="text"
                  value={orderData.shipTo.company}
                  onChange={(e) => setOrderData({ ...orderData, shipTo: { ...orderData.shipTo, company: e.target.value } })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Street 1</label>
                <input
                  type="text"
                  value={orderData.shipTo.street1}
                  onChange={(e) => setOrderData({ ...orderData, shipTo: { ...orderData.shipTo, street1: e.target.value } })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Street 2</label>
                <input
                  type="text"
                  value={orderData.shipTo.street2}
                  onChange={(e) => setOrderData({ ...orderData, shipTo: { ...orderData.shipTo, street2: e.target.value } })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                <input
                  type="text"
                  value={orderData.shipTo.city}
                  onChange={(e) => setOrderData({ ...orderData, shipTo: { ...orderData.shipTo, city: e.target.value } })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                <input
                  type="text"
                  value={orderData.shipTo.state}
                  onChange={(e) => setOrderData({ ...orderData, shipTo: { ...orderData.shipTo, state: e.target.value } })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Postal Code</label>
                <input
                  type="text"
                  value={orderData.shipTo.postalCode}
                  onChange={(e) => setOrderData({ ...orderData, shipTo: { ...orderData.shipTo, postalCode: e.target.value } })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input
                  type="text"
                  value={orderData.shipTo.phone}
                  onChange={(e) => setOrderData({ ...orderData, shipTo: { ...orderData.shipTo, phone: e.target.value } })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>
          </div>

          {/* Ship From */}
          <div className="border-b border-gray-200 pb-4">
            <h3 className="text-md font-medium text-gray-700 mb-3">Ship From</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={orderData.shipFrom.name}
                  onChange={(e) => setOrderData({ ...orderData, shipFrom: { ...orderData.shipFrom, name: e.target.value } })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Company</label>
                <input
                  type="text"
                  value={orderData.shipFrom.company}
                  onChange={(e) => setOrderData({ ...orderData, shipFrom: { ...orderData.shipFrom, company: e.target.value } })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Street 1</label>
                <input
                  type="text"
                  value={orderData.shipFrom.street1}
                  onChange={(e) => setOrderData({ ...orderData, shipFrom: { ...orderData.shipFrom, street1: e.target.value } })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                <input
                  type="text"
                  value={orderData.shipFrom.city}
                  onChange={(e) => setOrderData({ ...orderData, shipFrom: { ...orderData.shipFrom, city: e.target.value } })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                <input
                  type="text"
                  value={orderData.shipFrom.state}
                  onChange={(e) => setOrderData({ ...orderData, shipFrom: { ...orderData.shipFrom, state: e.target.value } })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Postal Code</label>
                <input
                  type="text"
                  value={orderData.shipFrom.postalCode}
                  onChange={(e) => setOrderData({ ...orderData, shipFrom: { ...orderData.shipFrom, postalCode: e.target.value } })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>
          </div>

          {/* Package Info */}
          <div className="border-b border-gray-200 pb-4">
            <h3 className="text-md font-medium text-gray-700 mb-3">Package Info</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Weight (lbs)</label>
                <input
                  type="number"
                  step="0.1"
                  value={orderData.weight.value}
                  onChange={(e) => setOrderData({ ...orderData, weight: { ...orderData.weight, value: parseFloat(e.target.value) || 0 } })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Service Code</label>
                <select
                  value={orderData.serviceCode}
                  onChange={(e) => setOrderData({ ...orderData, serviceCode: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="usps_priority">USPS Priority Mail</option>
                  <option value="usps_first_class">USPS First Class Mail</option>
                  <option value="usps_priority_mail_express">USPS Priority Mail Express</option>
                  <option value="ups_ground">UPS Ground</option>
                  <option value="ups_2nd_day_air">UPS 2nd Day Air</option>
                  <option value="fedex_ground">FedEx Ground</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Length (inches)</label>
                <input
                  type="number"
                  step="0.1"
                  value={orderData.dimensions.length}
                  onChange={(e) => setOrderData({ ...orderData, dimensions: { ...orderData.dimensions, length: parseFloat(e.target.value) || 0 } })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Width (inches)</label>
                <input
                  type="number"
                  step="0.1"
                  value={orderData.dimensions.width}
                  onChange={(e) => setOrderData({ ...orderData, dimensions: { ...orderData.dimensions, width: parseFloat(e.target.value) || 0 } })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Height (inches)</label>
                <input
                  type="number"
                  step="0.1"
                  value={orderData.dimensions.height}
                  onChange={(e) => setOrderData({ ...orderData, dimensions: { ...orderData.dimensions, height: parseFloat(e.target.value) || 0 } })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Package Code</label>
                <select
                  value={orderData.packageCode}
                  onChange={(e) => setOrderData({ ...orderData, packageCode: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="package">Package</option>
                  <option value="flat_rate_envelope">Flat Rate Envelope</option>
                  <option value="flat_rate_box">Flat Rate Box</option>
                  <option value="envelope">Envelope</option>
                  <option value="padded_envelope">Padded Envelope</option>
                </select>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className={`w-full px-6 py-3 rounded-lg font-medium transition-colors ${
              loading
                ? 'bg-gray-400 text-gray-600 cursor-not-allowed'
                : 'bg-green-600 text-white hover:bg-green-700'
            }`}
          >
            {loading ? 'Creating Label...' : 'Create Label with ShipEngine'}
          </button>
        </form>
      </div>

      {/* Response Display */}
      {(response || error) && (
        <div className={`bg-white rounded-lg shadow p-6 ${error ? 'border-l-4 border-red-500' : 'border-l-4 border-green-500'}`}>
          <h2 className={`text-lg font-semibold mb-4 ${error ? 'text-red-700' : 'text-green-700'}`}>
            {error ? 'Error Response' : 'Success Response'}
          </h2>
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded">
              <p className="text-red-800 font-medium">{error}</p>
            </div>
          )}
          <pre className="bg-gray-50 p-4 rounded-lg overflow-auto text-sm">
            {JSON.stringify(response || { error }, null, 2)}
          </pre>
          {response?.label_download?.pdf && (
            <div className="mt-4">
              <a
                href={response.label_download.pdf}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Download Label PDF
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

