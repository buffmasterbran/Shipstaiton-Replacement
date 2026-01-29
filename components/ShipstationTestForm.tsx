'use client'

import { useState } from 'react'

interface OrderResponse {
  orderId?: number
  orderNumber?: string
  orderStatus?: string
  orderKey?: string
  errors?: Array<{ errorMessage: string }>
  hasErrors?: boolean
  message?: string
}

export default function ShipstationTestForm() {
  const [loading, setLoading] = useState(false)
  const [response, setResponse] = useState<OrderResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Default test order data
  const [orderData, setOrderData] = useState({
    orderNumber: 'TEST-' + Date.now(),
    orderKey: 'test-key-' + Date.now(),
    orderDate: new Date().toISOString().split('T')[0],
    paymentDate: new Date().toISOString().split('T')[0],
    shipByDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 7 days from now
    orderStatus: 'awaiting_shipment',
    customerEmail: '[email protected]',
    shipTo: {
      name: 'John Doe',
      street1: '123 Main St',
      street2: '',
      city: 'Austin',
      state: 'TX',
      postalCode: '78701',
      country: 'US',
      phone: '555-123-4567',
    },
    billTo: {
      name: 'John Doe',
      street1: '123 Main St',
      street2: '',
      city: 'Austin',
      state: 'TX',
      postalCode: '78701',
      country: 'US',
      phone: '555-123-4567',
    },
    items: [
      {
        sku: 'PT16MK',
        name: 'Test Product',
        quantity: 1,
        unitPrice: 19.99,
      },
    ],
    amountPaid: 19.99,
    taxAmount: 0,
    shippingAmount: 5.99,
    customerNotes: '',
    internalNotes: '',
    gift: false,
    paymentMethod: 'Credit Card',
    requestedShippingService: 'usps_priority',
    packageCode: 'package',
    confirmation: 'delivery',
    weight: {
      value: 0.7,
      units: 'pounds',
    },
    dimensions: {
      units: 'inches',
      length: 7,
      width: 7,
      height: 2.5,
    },
    advancedOptions: {
      warehouseId: 870629,
      storeId: 257680,
      customField1: '',
      source: 'test',
    },
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setResponse(null)

    try {
      const res = await fetch('/api/shipstation/create-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(orderData),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || data.message || 'Failed to create order')
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
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Test ShipStation Order Creation</h2>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Order Info */}
          <div className="border-b border-gray-200 pb-4">
            <h3 className="text-md font-medium text-gray-700 mb-3">Order Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Order Number</label>
                <input
                  type="text"
                  value={orderData.orderNumber}
                  onChange={(e) => setOrderData({ ...orderData, orderNumber: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Order Status</label>
                <select
                  value={orderData.orderStatus}
                  onChange={(e) => setOrderData({ ...orderData, orderStatus: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="awaiting_shipment">Awaiting Shipment</option>
                  <option value="on_hold">On Hold</option>
                  <option value="pending">Pending</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Order Date</label>
                <input
                  type="date"
                  value={orderData.orderDate}
                  onChange={(e) => setOrderData({ ...orderData, orderDate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ship By Date</label>
                <input
                  type="date"
                  value={orderData.shipByDate}
                  onChange={(e) => setOrderData({ ...orderData, shipByDate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>
          </div>

          {/* Customer Email */}
          <div className="border-b border-gray-200 pb-4">
            <h3 className="text-md font-medium text-gray-700 mb-3">Customer Information</h3>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Customer Email</label>
                <input
                  type="email"
                  value={orderData.customerEmail}
                  onChange={(e) => setOrderData({ ...orderData, customerEmail: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>
          </div>

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
                <label className="block text-sm font-medium text-gray-700 mb-1">Street 1</label>
                <input
                  type="text"
                  value={orderData.shipTo.street1}
                  onChange={(e) => setOrderData({ ...orderData, shipTo: { ...orderData.shipTo, street1: e.target.value } })}
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
                <input
                  type="text"
                  value={orderData.requestedShippingService}
                  onChange={(e) => setOrderData({ ...orderData, requestedShippingService: e.target.value })}
                  placeholder="usps_priority"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
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
            </div>
          </div>

          {/* Items */}
          <div className="border-b border-gray-200 pb-4">
            <h3 className="text-md font-medium text-gray-700 mb-3">Items</h3>
            {orderData.items.map((item, index) => (
              <div key={index} className="grid grid-cols-4 gap-4 mb-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">SKU</label>
                  <input
                    type="text"
                    value={item.sku}
                    onChange={(e) => {
                      const newItems = [...orderData.items]
                      newItems[index].sku = e.target.value
                      setOrderData({ ...orderData, items: newItems })
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input
                    type="text"
                    value={item.name}
                    onChange={(e) => {
                      const newItems = [...orderData.items]
                      newItems[index].name = e.target.value
                      setOrderData({ ...orderData, items: newItems })
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                  <input
                    type="number"
                    value={item.quantity}
                    onChange={(e) => {
                      const newItems = [...orderData.items]
                      newItems[index].quantity = parseInt(e.target.value) || 1
                      setOrderData({ ...orderData, items: newItems })
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Unit Price</label>
                  <input
                    type="number"
                    step="0.01"
                    value={item.unitPrice}
                    onChange={(e) => {
                      const newItems = [...orderData.items]
                      newItems[index].unitPrice = parseFloat(e.target.value) || 0
                      setOrderData({ ...orderData, items: newItems })
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
              </div>
            ))}
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
            {loading ? 'Creating Order...' : 'Create Order in ShipStation'}
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
          {response && !error && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded">
              {response.orderId && (
                <p className="text-green-800 font-medium">
                  Order Created! Order ID: {response.orderId} | Order Number: {response.orderNumber}
                </p>
              )}
            </div>
          )}
          <pre className="bg-gray-50 p-4 rounded-lg overflow-auto text-sm">
            {JSON.stringify(response || { error }, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

