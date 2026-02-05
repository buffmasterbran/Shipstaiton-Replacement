import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// POST - Release a cart (cancel any active chunks and make cart available)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { cartId, reason } = body

    if (!cartId) {
      return NextResponse.json({ error: 'Cart ID is required' }, { status: 400 })
    }

    const cart = await prisma.pickCart.findUnique({
      where: { id: cartId },
      include: {
        chunks: {
          where: {
            status: { in: ['PICKING', 'PICKED', 'SHIPPING'] },
          },
          include: {
            orders: true,
          },
        },
      },
    })

    if (!cart) {
      return NextResponse.json({ error: 'Cart not found' }, { status: 404 })
    }

    if (cart.status === 'AVAILABLE') {
      return NextResponse.json({ error: 'Cart is already available' }, { status: 400 })
    }

    let totalOrdersReturned = 0
    let chunksAffected = 0
    let pickerName: string | null = null

    // Process each active chunk
    for (const chunk of cart.chunks) {
      // Get the picker name from the first chunk found
      if (!pickerName && chunk.pickerName) {
        pickerName = chunk.pickerName
      }

      // Count orders that haven't been shipped yet
      const unshippedOrders = chunk.orders.filter(o => o.status !== 'SHIPPED')
      totalOrdersReturned += unshippedOrders.length

      // Unassign unshipped orders from the chunk (they return to batch queue)
      if (unshippedOrders.length > 0) {
        await prisma.orderLog.updateMany({
          where: {
            id: { in: unshippedOrders.map(o => o.id) },
          },
          data: {
            chunkId: null,
            binNumber: null,
          },
        })
      }

      // Update chunk status to CANCELLED
      await prisma.pickChunk.update({
        where: { id: chunk.id },
        data: {
          status: 'CANCELLED',
          ordersSkipped: unshippedOrders.length,
        },
      })

      chunksAffected++
    }

    // Release the cart
    await prisma.pickCart.update({
      where: { id: cartId },
      data: { status: 'AVAILABLE' },
    })

    return NextResponse.json({
      success: true,
      chunksAffected,
      ordersReturned: totalOrdersReturned,
      pickerName,
      reason: reason || 'admin_release',
    })
  } catch (error) {
    console.error('Failed to release cart:', error)
    return NextResponse.json({ error: 'Failed to release cart' }, { status: 500 })
  }
}
