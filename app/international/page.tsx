'use client'

import { useState, useMemo } from 'react'
import { useOrders } from '@/context/OrdersContext'
import type { OrderLog } from '@/context/OrdersContext'
import OrderDialog from '@/components/dialogs/OrderDialog'
import { getColorFromSku } from '@/lib/order-utils'

function getCountry(log: OrderLog): string {
  const payload = log.rawPayload as any
  const order = Array.isArray(payload) ? payload[0] : payload
  return (order?.shipTo?.country || '').toUpperCase()
}

function isInternationalOrder(log: OrderLog): boolean {
  const country = getCountry(log)
  return country !== '' && country !== 'US'
}

interface ProcessedIntlOrder {
  log: OrderLog
  order: any
  country: string
  customerName: string
  city: string
  state: string
  items: Array<{ sku: string; name: string; quantity: number; color: string }>
  totalItems: number
  orderDate: string
}

export default function InternationalOrdersPage() {
  const { orders, loading, error, refreshOrders } = useOrders()

  const [selectedOrder, setSelectedOrder] = useState<any | null>(null)
  const [selectedRawPayload, setSelectedRawPayload] = useState<any | null>(null)
  const [selectedLog, setSelectedLog] = useState<OrderLog | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [shippingOrderId, setShippingOrderId] = useState<string | null>(null)
  const [shipError, setShipError] = useState<string | null>(null)

  const internationalOrders = useMemo(() => {
    return orders
      .filter(log => isInternationalOrder(log) && log.status !== 'ON_HOLD')
      .map((log): ProcessedIntlOrder => {
        const payload = log.rawPayload as any
        const orderData = Array.isArray(payload) ? payload[0] : payload
        const rawItems = orderData?.items || []

        const items = rawItems
          .filter((item: any) => {
            const sku = (item.sku || '').toLowerCase()
            const name = (item.name || '').toLowerCase()
            return !sku.includes('insurance') && !name.includes('insurance') &&
                   !sku.includes('shipping') && !name.includes('shipping')
          })
          .map((item: any) => ({
            sku: item.sku || 'UNKNOWN',
            name: item.name || 'Unnamed Item',
            quantity: item.quantity || 1,
            color: getColorFromSku(item.sku || '', item.name, item.color),
          }))

        const totalItems = items.reduce((sum: number, i: any) => sum + i.quantity, 0)
        const shipTo = orderData?.shipTo || {}

        return {
          log,
          order: orderData,
          country: (shipTo.country || '').toUpperCase(),
          customerName: shipTo.name || orderData?.billTo?.name || 'Unknown',
          city: shipTo.city || '',
          state: shipTo.state || '',
          items,
          totalItems,
          orderDate: orderData?.orderDate || log.createdAt || '',
        }
      })
      .sort((a, b) => a.country.localeCompare(b.country) || a.log.orderNumber.localeCompare(b.log.orderNumber))
  }, [orders])

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return internationalOrders
    const q = searchQuery.toLowerCase()
    return internationalOrders.filter(o =>
      o.log.orderNumber.toLowerCase().includes(q) ||
      o.customerName.toLowerCase().includes(q) ||
      o.country.toLowerCase().includes(q) ||
      o.city.toLowerCase().includes(q) ||
      o.items.some(i => i.sku.toLowerCase().includes(q))
    )
  }, [internationalOrders, searchQuery])

  const handleRowClick = (o: ProcessedIntlOrder) => {
    setSelectedOrder(o.order)
    setSelectedRawPayload(o.log.rawPayload)
    setSelectedLog(o.log)
    setIsDialogOpen(true)
  }

  const handleCloseDialog = () => {
    setIsDialogOpen(false)
    setSelectedOrder(null)
    setSelectedRawPayload(null)
    setSelectedLog(null)
  }

  // NOT TESTED -- Global-E quick ship (Feb 2026, no live orders to test)
  const handleQuickShip = async (o: ProcessedIntlOrder, e: React.MouseEvent) => {
    e.stopPropagation()
    if (shippingOrderId) return
    setShippingOrderId(o.log.id)
    setShipError(null)
    try {
      const res = await fetch('/api/global-e', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'get-label',
          orderLogId: o.log.id,
        }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setShipError(`${o.log.orderNumber}: ${data.error || 'Failed'}`)
        return
      }
      if (data.labelUrls?.[0]) {
        window.open(data.labelUrls[0], '_blank')
      }
      refreshOrders()
    } catch (err: any) {
      setShipError(`${o.log.orderNumber}: ${err.message}`)
    } finally {
      setShippingOrderId(null)
    }
  }

  const countryCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const o of internationalOrders) {
      counts[o.country] = (counts[o.country] || 0) + 1
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  }, [internationalOrders])

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">International Orders</h1>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">Loading orders...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">International Orders</h1>
        <div className="bg-red-50 text-red-600 p-4 rounded-lg">
          Error loading orders: {error}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">International Orders</h1>
          <p className="text-sm text-gray-500 mt-1">
            {internationalOrders.length} international order{internationalOrders.length !== 1 ? 's' : ''}
            {countryCounts.length > 0 && (
              <span className="ml-2">
                &mdash; {countryCounts.map(([c, n]) => `${c} (${n})`).join(', ')}
              </span>
            )}
          </p>
        </div>
      </div>

      {shipError && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex items-center justify-between">
          <span>{shipError}</span>
          <button onClick={() => setShipError(null)} className="text-red-500 hover:text-red-700 font-bold ml-2">&times;</button>
        </div>
      )}

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by order #, customer, country, SKU..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full max-w-md border border-gray-300 rounded-lg px-3 py-2 text-sm placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="bg-gray-50 rounded-lg p-8 text-center">
          <div className="text-gray-400 mb-2">
            <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-gray-500">
            {searchQuery ? 'No international orders match your search' : 'No international orders found'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Country
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Order
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Destination
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Items
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filtered.map((o) => (
                  <tr
                    key={o.log.id}
                    onClick={() => handleRowClick(o)}
                    className="hover:bg-blue-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-700 font-bold text-xs rounded-full">
                        {o.country}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-medium text-gray-900">{o.log.orderNumber}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                      {o.customerName}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                      {[o.city, o.state].filter(Boolean).join(', ')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-gray-600">
                        {o.items.slice(0, 2).map((item, idx) => (
                          <div key={idx} className="truncate max-w-[200px]">
                            {item.sku} <span className="text-gray-400">&times;{item.quantity}</span>
                          </div>
                        ))}
                        {o.items.length > 2 && (
                          <div className="text-gray-400 text-xs">+{o.items.length - 2} more</div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        o.log.status === 'SHIPPED' ? 'bg-green-100 text-green-700' :
                        o.log.status === 'AWAITING_SHIPMENT' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {o.log.status === 'AWAITING_SHIPMENT' ? 'Awaiting' : o.log.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                      {o.orderDate ? new Date(o.orderDate).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      {o.log.status !== 'SHIPPED' && (
                        <button
                          onClick={(e) => handleQuickShip(o, e)}
                          disabled={shippingOrderId === o.log.id}
                          className="px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-100 rounded-lg hover:bg-blue-200 transition-colors disabled:opacity-50"
                        >
                          {shippingOrderId === o.log.id ? 'Shipping...' : 'Ship Global-E'}
                        </button>
                      )}
                      {o.log.status === 'SHIPPED' && o.log.trackingNumber && (
                        <span className="text-xs text-gray-500">{o.log.trackingNumber}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <OrderDialog
        isOpen={isDialogOpen}
        onClose={handleCloseDialog}
        order={selectedOrder}
        rawPayload={selectedRawPayload}
        orderLog={selectedLog}
        onSaved={() => refreshOrders()}
      />
    </div>
  )
}
