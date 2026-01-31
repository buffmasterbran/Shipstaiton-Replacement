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
  } | null
  createdAt: string
  updatedAt: string
}

interface OrdersContextType {
  orders: OrderLog[]
  loading: boolean
  error: string | null
  lastFetchedAt: Date | null
  refreshOrders: () => Promise<void>
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
    await fetchOrders()
  }, [fetchOrders])

  return (
    <OrdersContext.Provider value={{ orders, loading, error, lastFetchedAt, refreshOrders }}>
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
