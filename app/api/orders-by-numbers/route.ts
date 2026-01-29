import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/** GET ?orderNumbers=123,456,789 - returns order logs for those order numbers (for bulk verification) */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const orderNumbersParam = searchParams.get('orderNumbers')
    if (!orderNumbersParam) {
      return NextResponse.json(
        { error: 'Missing orderNumbers query (comma-separated)' },
        { status: 400 }
      )
    }
    const orderNumbers = orderNumbersParam.split(',').map((n) => n.trim()).filter(Boolean)
    if (orderNumbers.length === 0) {
      return NextResponse.json({ orders: [] })
    }

    const orders = await prisma.orderLog.findMany({
      where: { orderNumber: { in: orderNumbers } },
      orderBy: { createdAt: 'asc' },
    })

    return NextResponse.json({ orders })
  } catch (error: any) {
    console.error('Error fetching orders by numbers:', error)
    return NextResponse.json(
      { error: 'Failed to fetch orders', details: error?.message },
      { status: 500 }
    )
  }
}
