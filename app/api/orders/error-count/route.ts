import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    // Count orders where rate shopping failed
    const errorCount = await prisma.orderLog.count({
      where: {
        rateShopStatus: 'FAILED',
        status: 'AWAITING_SHIPMENT', // Only count unshipped orders
      },
    })

    return NextResponse.json({ count: errorCount })
  } catch (error) {
    console.error('Error fetching error count:', error)
    return NextResponse.json({ count: 0, error: 'Failed to fetch count' }, { status: 500 })
  }
}
