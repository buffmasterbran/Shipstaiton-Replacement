import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/orders/archive-shipped
 * TESTING ONLY: Resets all SHIPPED orders back to AWAITING_SHIPMENT
 * so they can be re-batched. Clears tracking/label data.
 * ⚠️ REMOVE THIS ENDPOINT BEFORE PRODUCTION ⚠️
 */
export async function POST() {
  try {
    const startTime = Date.now()

    const shippedCount = await prisma.orderLog.count({
      where: { status: 'SHIPPED' },
    })

    if (shippedCount === 0) {
      return NextResponse.json({ cleared: 0, message: 'No shipped orders to clear' })
    }

    // Reset shipped orders back to AWAITING_SHIPMENT and clear shipping data
    const result = await prisma.orderLog.updateMany({
      where: { status: 'SHIPPED' },
      data: {
        status: 'AWAITING_SHIPMENT',
        trackingNumber: null,
        carrier: null,
        labelUrl: null,
        labelCost: null,
        shippedAt: null,
        batchId: null,
        chunkId: null,
        binNumber: null,
        bulkBatchId: null,
      },
    })

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

    return NextResponse.json({
      cleared: result.count,
      message: `Reset ${result.count} shipped orders back to awaiting shipment`,
    })
  } catch (error) {
    console.error('Failed to clear shipped orders:', error)
    return NextResponse.json({ error: 'Failed to clear shipped orders' }, { status: 500 })
  }
}
