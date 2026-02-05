'use client'

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'

// Order log type matching the database schema
export interface OrderLog {
  id: string
  orderNumber: string
  status: string
  rawPayload: any
  customerReachedOut: boolean
  suggestedBox?: {
    boxId: string | null
    boxName: string | null
    confidence: 'confirmed' | 'calculated' | 'unknown'
    reason?: string
    lengthInches?: number
    widthInches?: number
    heightInches?: number
    weightLbs?: number
  } | null
  // Rate shopping fields
  orderType?: 'SINGLE' | 'BULK' | 'EXPEDITED' | 'ERROR' | null
  shippedWeight?: number | null
  preShoppedRate?: {
    carrierId: string
    carrierCode: string
    carrier: string
    serviceCode: string
    serviceName: string
    price: number
    currency: string
    deliveryDays: number | null
    rateId?: string
  } | null
  rateFetchedAt?: string | null
  rateShopStatus?: 'SUCCESS' | 'FAILED' | 'SKIPPED' | null
  rateShopError?: string | null
  // Picking workflow fields
  batchId?: string | null
  createdAt: string
  updatedAt: string
}

interface OrdersContextType {
  orders: OrderLog[]
  loading: boolean
  error: string | null
  lastFetchedAt: Date | null
  refreshOrders: () => Promise<void>
  updateOrdersInPlace: (updates: Array<{ id: string; preShoppedRate: any; shippedWeight: number; rateShopStatus: string; rateShopError: string | null }>) => void
  updateOrderStatus: (orderId: string, status: string) => void
  updateOrderInPlace: (orderId: string, updates: Partial<OrderLog>) => void
}

const OrdersContext = createContext<OrdersContextType | null>(null)

export function OrdersProvider({ children }: { children: ReactNode }) {
  const [orders, setOrders] = useState<OrderLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null)

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const res = await fetch('/api/orders')
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to fetch orders')
      }

      const data = await res.json()
      setOrders(data.orders || [])
      setLastFetchedAt(new Date())
    } catch (err) {
      setError((err as Error).message)
      console.error('Error fetching orders:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch orders on initial mount only
  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  const refreshOrders = useCallback(async () => {
    // Set loading immediately so user sees feedback
    setLoading(true)
    
    // Recalculate all box suggestions first (handles signature changes, new feedback rules, etc.)
    try {
      await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'recalculate-boxes', force: true }),
      })
    } catch (err) {
      console.error('Error recalculating boxes:', err)
    }
    // Then fetch fresh data (this will also set loading to false when done)
    await fetchOrders()
  }, [fetchOrders])

  // Update specific orders in place without full refresh (for real-time rate updates)
  const updateOrdersInPlace = useCallback((updates: Array<{ id: string; preShoppedRate: any; shippedWeight: number; rateShopStatus: string; rateShopError: string | null }>) => {
    setOrders(prevOrders => {
      return prevOrders.map(order => {
        const update = updates.find(u => u.id === order.id)
        if (update) {
          return {
            ...order,
            preShoppedRate: update.preShoppedRate,
            shippedWeight: update.shippedWeight,
            rateShopStatus: update.rateShopStatus as 'SUCCESS' | 'FAILED' | 'SKIPPED' | null,
            rateShopError: update.rateShopError,
          }
        }
        return order
      })
    })
  }, [])

  // Update a single order's status in place (for hold/unhold without full refresh)
  const updateOrderStatus = useCallback((orderId: string, status: string) => {
    setOrders(prevOrders => {
      return prevOrders.map(order => {
        if (order.id === orderId) {
          return { ...order, status }
        }
        return order
      })
    })
  }, [])

  // Update a single order with arbitrary fields (for edit dialog saves)
  const updateOrderInPlace = useCallback((orderId: string, updates: Partial<OrderLog>) => {
    setOrders(prevOrders => {
      return prevOrders.map(order => {
        if (order.id === orderId) {
          return { ...order, ...updates }
        }
        return order
      })
    })
  }, [])

  return (
    <OrdersContext.Provider value={{ orders, loading, error, lastFetchedAt, refreshOrders, updateOrdersInPlace, updateOrderStatus, updateOrderInPlace }}>
      {children}
    </OrdersContext.Provider>
  )
}

export function useOrders() {
  const context = useContext(OrdersContext)
  if (!context) {
    throw new Error('useOrders must be used within an OrdersProvider')
  }
  return context
}

// Helper to check if an order is a single-item order (excluding insurance)
export function isSingleItemOrder(log: OrderLog): boolean {
  const payload = log.rawPayload as any
  const order = Array.isArray(payload) ? payload[0] : payload
  const items = order?.items || []

  // Filter out insurance items
  const nonInsuranceItems = items.filter((item: any) => {
    const sku = (item.sku || '').toUpperCase()
    const name = (item.name || '').toUpperCase()
    return !sku.includes('INSURANCE') && !name.includes('INSURANCE') && !sku.includes('SHIPPING')
  })

  // Single item = exactly 1 non-insurance item with quantity 1
  if (nonInsuranceItems.length !== 1) return false
  return (nonInsuranceItems[0].quantity || 1) === 1
}

// Helper to check if an order is a bulk order (multiple items or quantity > 1)
export function isBulkOrder(log: OrderLog): boolean {
  const payload = log.rawPayload as any
  const order = Array.isArray(payload) ? payload[0] : payload
  const items = order?.items || []

  // Filter out insurance items
  const nonInsuranceItems = items.filter((item: any) => {
    const sku = (item.sku || '').toUpperCase()
    const name = (item.name || '').toUpperCase()
    return !sku.includes('INSURANCE') && !name.includes('INSURANCE') && !sku.includes('SHIPPING')
  })

  // Bulk = more than 1 item OR quantity > 1
  if (nonInsuranceItems.length > 1) return true
  if (nonInsuranceItems.length === 1 && (nonInsuranceItems[0].quantity || 1) > 1) return true
  return false
}
