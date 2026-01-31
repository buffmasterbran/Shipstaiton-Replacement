import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { orderId, reachedOut } = body

    if (!orderId || typeof reachedOut !== 'boolean') {
      return NextResponse.json(
        { error: 'orderId and reachedOut (boolean) are required' },
        { status: 400 }
      )
    }

    const updated = await prisma.orderLog.update({
      where: { id: orderId },
      data: { customerReachedOut: reachedOut },
      select: {
        id: true,
        orderNumber: true,
        customerReachedOut: true,
      },
    })

    return NextResponse.json({ success: true, order: updated })
  } catch (error) {
    console.error('Error updating customer reached out:', error)
    return NextResponse.json(
      { error: 'Failed to update order' },
      { status: 500 }
    )
  }
}

// GET: Fetch all orders where customer reached out
export async function GET() {
  try {
    const orders = await prisma.orderLog.findMany({
      where: { customerReachedOut: true },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        customerReachedOut: true,
        createdAt: true,
      },
    })

    return NextResponse.json({ orders })
  } catch (error) {
    console.error('Error fetching customer reached out orders:', error)
    return NextResponse.json(
      { error: 'Failed to fetch orders' },
      { status: 500 }
    )
  }
}
