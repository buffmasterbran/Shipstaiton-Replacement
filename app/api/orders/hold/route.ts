import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/orders/hold
 * Put an order on hold
 * Body: { orderId: string, reason?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { orderId, reason } = body

    if (!orderId) {
      return NextResponse.json({ error: 'orderId is required' }, { status: 400 })
    }

    const order = await prisma.orderLog.update({
      where: { id: orderId },
      data: {
        status: 'ON_HOLD',
        onHoldReason: reason || null,
        onHoldUntil: null, // Can be extended later if needed
      },
    })

    return NextResponse.json({ success: true, order })
  } catch (error) {
    console.error('Error putting order on hold:', error)
    return NextResponse.json({ error: 'Failed to put order on hold' }, { status: 500 })
  }
}

/**
 * DELETE /api/orders/hold
 * Remove hold from an order
 * Body: { orderId: string }
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json()
    const { orderId } = body

    if (!orderId) {
      return NextResponse.json({ error: 'orderId is required' }, { status: 400 })
    }

    const order = await prisma.orderLog.update({
      where: { id: orderId },
      data: {
        status: 'AWAITING_SHIPMENT',
        onHoldReason: null,
        onHoldUntil: null,
      },
    })

    return NextResponse.json({ success: true, order })
  } catch (error) {
    console.error('Error removing hold from order:', error)
    return NextResponse.json({ error: 'Failed to remove hold from order' }, { status: 500 })
  }
}

/**
 * GET /api/orders/hold
 * Get all orders on hold
 */
export async function GET() {
  try {
    const orders = await prisma.orderLog.findMany({
      where: {
        status: 'ON_HOLD',
        archived: false,
      },
      orderBy: { updatedAt: 'desc' },
    })

    return NextResponse.json({ orders })
  } catch (error) {
    console.error('Error fetching held orders:', error)
    return NextResponse.json({ error: 'Failed to fetch held orders' }, { status: 500 })
  }
}
