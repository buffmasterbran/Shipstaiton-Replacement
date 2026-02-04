'use client'

import { useState, useMemo } from 'react'
import { useOrders } from '@/context/OrdersContext'
import { getColorFromSku } from '@/lib/order-utils'

interface HeldOrder {
  id: string
  orderNumber: string
  customerName: string
  items: Array<{ sku: string; name: string; quantity: number; color: string }>
  holdReason: string | null
  heldAt: string
}

export default function HoldOrdersPage() {
  const { orders, loading, error, refreshOrders } = useOrders()
  const [unholdingId, setUnholdingId] = useState<string | null>(null)

  // Filter to only held orders
  const heldOrders = useMemo(() => {
    return orders
      .filter(order => order.status === 'ON_HOLD')
      .map(order => {
        const payload = order.rawPayload as any
        const orderData = Array.isArray(payload) ? payload[0] : payload
        const rawItems = orderData?.items || []
        
        const items = rawItems
          .filter((item: any) => {
            const sku = (item.sku || '').toLowerCase()
            const name = (item.name || '').toLowerCase()
            return !sku.includes('insurance') && !name.includes('insurance')
          })
          .map((item: any) => ({
            sku: item.sku || 'UNKNOWN',
            name: item.name || 'Unnamed Item',
            quantity: item.quantity || 1,
            color: getColorFromSku(item.sku || '', item.name, item.color),
          }))

        const customerName = orderData?.shipTo?.name || orderData?.billTo?.name || 'Unknown'

        return {
          id: order.id,
          orderNumber: order.orderNumber,
          customerName,
          items,
          holdReason: (order as any).onHoldReason || null,
          heldAt: order.updatedAt,
        } as HeldOrder
      })
  }, [orders])

  const handleUnhold = async (orderId: string) => {
    setUnholdingId(orderId)
    try {
      const res = await fetch('/api/orders/hold', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      })
      
      if (res.ok) {
        await refreshOrders()
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to remove hold')
      }
    } catch (err) {
      console.error('Error removing hold:', err)
      alert('Failed to remove hold')
    } finally {
      setUnholdingId(null)
    }
  }

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Orders on Hold</h1>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-600"></div>
          <span className="ml-3 text-gray-600">Loading orders...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Orders on Hold</h1>
        <div className="bg-red-50 text-red-600 p-4 rounded-lg">
          Error loading orders: {error}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Orders on Hold</h1>
        <span className="text-sm text-gray-500">
          {heldOrders.length} order{heldOrders.length !== 1 ? 's' : ''} on hold
        </span>
      </div>

      {heldOrders.length === 0 ? (
        <div className="bg-gray-50 rounded-lg p-8 text-center">
          <div className="text-gray-400 mb-2">
            <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-gray-500">No orders are currently on hold</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Order
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Customer
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Items
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Hold Reason
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Held Since
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {heldOrders.map((order) => (
                <tr key={order.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm font-medium text-gray-900">
                      {order.orderNumber}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm text-gray-600">
                      {order.customerName}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-600">
                      {order.items.slice(0, 2).map((item, idx) => (
                        <div key={idx} className="truncate max-w-xs">
                          {item.sku} <span className="text-gray-400">×{item.quantity}</span>
                          {item.color && <span className="ml-1 text-gray-400">({item.color})</span>}
                        </div>
                      ))}
                      {order.items.length > 2 && (
                        <div className="text-gray-400 text-xs">
                          +{order.items.length - 2} more
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-sm ${order.holdReason ? 'text-gray-600' : 'text-gray-400 italic'}`}>
                      {order.holdReason || 'No reason provided'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm text-gray-500">
                      {new Date(order.heldAt).toLocaleDateString()}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <button
                      onClick={() => handleUnhold(order.id)}
                      disabled={unholdingId === order.id}
                      className="px-3 py-1.5 text-sm font-medium text-yellow-700 bg-yellow-100 rounded-lg hover:bg-yellow-200 transition-colors disabled:opacity-50"
                    >
                      {unholdingId === order.id ? 'Removing...' : 'Remove Hold'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
