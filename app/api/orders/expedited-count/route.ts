import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    // Count expedited orders using DB-driven orderType (set by shipping method mappings)
    // Also count orders where customer reached out (these show on the expedited tab too)
    const expeditedCount = await prisma.orderLog.count({
      where: {
        status: 'AWAITING_SHIPMENT',
        OR: [
          { orderType: 'EXPEDITED' },
          { customerReachedOut: true },
        ],
      },
    })

    return NextResponse.json({ count: expeditedCount })
  } catch (error) {
    console.error('Error fetching expedited count:', error)
    return NextResponse.json({ count: 0, error: 'Failed to fetch count' }, { status: 500 })
  }
}
