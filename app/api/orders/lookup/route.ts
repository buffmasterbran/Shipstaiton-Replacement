import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/orders/lookup?orderNumber=12345
 *
 * Look up a single order by its order number for Scan to Verify.
 * Returns ONLY the order data — all barcode/weight/box resolution
 * is done client-side using cached reference data.
 *
 * This is now a single DB query for maximum speed.
 */
export async function GET(request: NextRequest) {
  const orderNumber = request.nextUrl.searchParams.get('orderNumber')

  if (!orderNumber) {
    return NextResponse.json({ error: 'orderNumber is required' }, { status: 400 })
  }

  try {
    const order = await prisma.orderLog.findFirst({
      where: { orderNumber: orderNumber.trim() },
    })

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    return NextResponse.json({ order })
  } catch (err) {
    console.error('Order lookup error:', err)
    return NextResponse.json({ error: 'Failed to look up order' }, { status: 500 })
  }
}
