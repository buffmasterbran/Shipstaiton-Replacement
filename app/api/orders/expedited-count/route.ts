import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Expedited shipping methods - must match ExpeditedFilterContext.tsx
const EXPEDITED_SHIPPING_METHODS = [
  'ups next day',
  'ups next day air',
  'ups 2nd day',
  'ups 2nd day air',
  'ups 2 day',
  'ups 2 day air',
  'ups 3 day',
  'ups 3 day select',
  'next day',
  '2nd day',
  '2 day',
  '3 day',
]

function isOrderExpedited(rawPayload: unknown, customerReachedOut: boolean): boolean {
  if (customerReachedOut) return true
  
  const payload = rawPayload as Record<string, unknown>
  const order = Array.isArray(payload) ? payload[0] : payload
  
  // Check shipping method - use same fields as ExpeditedFilterContext
  const method = (
    (order?.requestedShippingService as string) || 
    (order?.shippingMethod as string) || 
    (order?.carrierCode as string) || 
    ''
  ).toLowerCase()
  
  return EXPEDITED_SHIPPING_METHODS.some(exp => method.includes(exp))
}

export async function GET() {
  try {
    // Get all orders and filter for expedited ones
    const orders = await prisma.orderLog.findMany({
      select: {
        rawPayload: true,
        customerReachedOut: true,
      },
    })

    // Count expedited orders
    let expeditedCount = 0
    for (const order of orders) {
      if (isOrderExpedited(order.rawPayload, order.customerReachedOut)) {
        expeditedCount++
      }
    }

    return NextResponse.json({ count: expeditedCount })
  } catch (error) {
    console.error('Error fetching expedited count:', error)
    return NextResponse.json({ count: 0, error: 'Failed to fetch count' }, { status: 500 })
  }
}
