'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function NetSuiteTestPage() {
  // Form fields
  const [internalId, setInternalId] = useState('')
  const [trackingNumber, setTrackingNumber] = useState('')
  const [carrier, setCarrier] = useState('')
  const [shippingCost, setShippingCost] = useState('')
  const [boxName, setBoxName] = useState('')
  const [weightLbs, setWeightLbs] = useState('')
  const [weightOz, setWeightOz] = useState('')
  const [lengthIn, setLengthIn] = useState('')
  const [widthIn, setWidthIn] = useState('')
  const [heightIn, setHeightIn] = useState('')
  const [memo, setMemo] = useState('')

  // State
  const [loading, setLoading] = useState(false)
  const [fetchLoading, setFetchLoading] = useState(false)
  const [response, setResponse] = useState<any>(null)
  const [fetchResponse, setFetchResponse] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  // Fetch (GET) an item fulfillment to inspect it
  const handleFetch = async () => {
    if (!internalId.trim()) { setError('Enter an Item Fulfillment Internal ID'); return }
    setFetchLoading(true)
    setFetchResponse(null)
    setError(null)
    try {
      const res = await fetch('/api/netsuite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get-fulfillment', internalId: internalId.trim() }),
      })
      const data = await res.json()
      setFetchResponse(data)
      if (!data.success) {
        setError(`NetSuite returned ${data.status}: ${typeof data.data === 'string' ? data.data : JSON.stringify(data.data)}`)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch')
    } finally {
      setFetchLoading(false)
    }
  }

  // Push (UPDATE) an item fulfillment
  const handlePush = async () => {
    if (!internalId.trim()) { setError('Enter an Item Fulfillment Internal ID'); return }
    if (!trackingNumber.trim()) { setError('Enter a tracking number'); return }
    setLoading(true)
    setResponse(null)
    setError(null)

    const totalWeightLbs = (parseFloat(weightLbs) || 0) + (parseFloat(weightOz) || 0) / 16

    try {
      const res = await fetch('/api/netsuite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update-fulfillment',
          internalId: internalId.trim(),
          trackingNumber: trackingNumber.trim(),
          carrier: carrier.trim() || undefined,
          shippingCost: shippingCost ? parseFloat(shippingCost) : undefined,
          weight: totalWeightLbs || undefined,
          boxName: boxName.trim() || undefined,
          length: lengthIn ? parseFloat(lengthIn) : undefined,
          width: widthIn ? parseFloat(widthIn) : undefined,
          height: heightIn ? parseFloat(heightIn) : undefined,
          memo: memo.trim() || undefined,
        }),
      })
      const data = await res.json()
      setResponse(data)
      if (!data.success) {
        setError(`NetSuite returned ${data.status}: ${typeof data.data === 'string' ? data.data : JSON.stringify(data.data)}`)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to push')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link href="/settings" className="text-sm text-blue-600 hover:underline mb-1 block">&larr; Back to Settings</Link>
            <h1 className="text-2xl font-bold text-gray-900">NetSuite Item Fulfillment Test</h1>
            <p className="text-sm text-gray-500 mt-1">
              Test pushing shipping data to a NetSuite Item Fulfillment record via REST API
            </p>
          </div>
          <div className="px-3 py-1 bg-amber-100 text-amber-700 text-xs font-bold rounded-lg border border-amber-300">
            TEST ONLY
          </div>
        </div>

        {/* Form */}
        <div className="bg-white rounded-xl shadow p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Fulfillment Details</h2>

          {/* Internal ID + Fetch */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Item Fulfillment Internal ID <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={internalId}
                onChange={(e) => setInternalId(e.target.value)}
                placeholder="e.g. 12345"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
              />
              <button
                onClick={handleFetch}
                disabled={fetchLoading}
                className="px-4 py-2 bg-gray-100 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 text-sm font-medium"
              >
                {fetchLoading ? 'Fetching...' : 'Fetch Record'}
              </button>
            </div>
          </div>

          {/* Tracking + Carrier */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tracking Number <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                placeholder="1Z999AA10123456784"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Carrier</label>
              <input
                type="text"
                value={carrier}
                onChange={(e) => setCarrier(e.target.value)}
                placeholder="USPS, UPS, FedEx..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Shipping Cost */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Shipping Cost ($)</label>
            <input
              type="text"
              value={shippingCost}
              onChange={(e) => setShippingCost(e.target.value)}
              placeholder="4.99"
              className="w-48 px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* Box / Dims */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Package</label>
            <div className="flex items-center gap-3">
              <div>
                <input
                  type="text"
                  value={boxName}
                  onChange={(e) => setBoxName(e.target.value)}
                  placeholder="Box name"
                  className="w-40 px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-sm"
                />
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={weightLbs}
                  onChange={(e) => setWeightLbs(e.target.value)}
                  placeholder="0"
                  className="w-14 px-2 py-2 border border-gray-300 rounded-lg text-center text-sm focus:border-blue-500 focus:outline-none"
                />
                <span className="text-xs text-gray-400">lb</span>
                <input
                  type="text"
                  value={weightOz}
                  onChange={(e) => setWeightOz(e.target.value)}
                  placeholder="0"
                  className="w-14 px-2 py-2 border border-gray-300 rounded-lg text-center text-sm focus:border-blue-500 focus:outline-none"
                />
                <span className="text-xs text-gray-400">oz</span>
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={lengthIn}
                  onChange={(e) => setLengthIn(e.target.value)}
                  placeholder="L"
                  className="w-12 px-2 py-2 border border-gray-300 rounded-lg text-center text-sm focus:border-blue-500 focus:outline-none"
                />
                <span className="text-xs text-gray-400">x</span>
                <input
                  type="text"
                  value={widthIn}
                  onChange={(e) => setWidthIn(e.target.value)}
                  placeholder="W"
                  className="w-12 px-2 py-2 border border-gray-300 rounded-lg text-center text-sm focus:border-blue-500 focus:outline-none"
                />
                <span className="text-xs text-gray-400">x</span>
                <input
                  type="text"
                  value={heightIn}
                  onChange={(e) => setHeightIn(e.target.value)}
                  placeholder="H"
                  className="w-12 px-2 py-2 border border-gray-300 rounded-lg text-center text-sm focus:border-blue-500 focus:outline-none"
                />
                <span className="text-xs text-gray-400">in</span>
              </div>
            </div>
          </div>

          {/* Memo */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">Memo (optional)</label>
            <input
              type="text"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="Shipped via E-Com Batch Tool"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Push Button */}
          <button
            onClick={handlePush}
            disabled={loading}
            className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 text-lg"
          >
            {loading ? 'Pushing to NetSuite...' : 'Push Fulfillment to NetSuite'}
          </button>
        </div>

        {/* Fetch Response */}
        {fetchResponse && (
          <div className="bg-white rounded-xl shadow p-6 mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-800">Fetch Response</h2>
              <span className={`px-2 py-1 text-xs font-bold rounded ${
                fetchResponse.success ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
              }`}>
                {fetchResponse.status}
              </span>
            </div>
            <pre className="bg-gray-900 text-green-400 p-4 rounded-lg text-xs overflow-auto max-h-96 whitespace-pre-wrap">
              {typeof fetchResponse.data === 'string'
                ? fetchResponse.data
                : JSON.stringify(fetchResponse.data, null, 2)}
            </pre>
          </div>
        )}

        {/* Push Response */}
        {response && (
          <div className="bg-white rounded-xl shadow p-6 mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-800">Push Response</h2>
              <span className={`px-2 py-1 text-xs font-bold rounded ${
                response.success ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
              }`}>
                {response.status} {response.success ? 'SUCCESS' : 'FAILED'}
              </span>
            </div>
            <pre className="bg-gray-900 text-green-400 p-4 rounded-lg text-xs overflow-auto max-h-96 whitespace-pre-wrap">
              {typeof response.data === 'string'
                ? response.data
                : JSON.stringify(response.data, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}
