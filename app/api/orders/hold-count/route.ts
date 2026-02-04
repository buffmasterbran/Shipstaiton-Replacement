import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/orders/hold-count
 * Get count of orders currently on hold
 */
export async function GET() {
  try {
    const count = await prisma.orderLog.count({
      where: {
        status: 'ON_HOLD',
        archived: false,
      },
    })

    return NextResponse.json({ count })
  } catch (error) {
    console.error('Error fetching hold count:', error)
    return NextResponse.json({ count: 0 })
  }
}
