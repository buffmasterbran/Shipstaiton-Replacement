import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'

interface ServiceCount {
  service_name: string
  order_count: number
}

// GET - Fetch all distinct requestedShippingService values from orders,
// split into mapped vs unmapped based on the shipping_method_mappings table.
export async function GET() {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Query distinct requestedShippingService values with counts using raw SQL
    // (Prisma doesn't support JSON field aggregation natively)
    const serviceCounts = await prisma.$queryRaw<ServiceCount[]>`
      SELECT
        raw_payload->>'requestedShippingService' AS service_name,
        COUNT(*)::int AS order_count
      FROM order_logs
      WHERE raw_payload->>'requestedShippingService' IS NOT NULL
        AND TRIM(raw_payload->>'requestedShippingService') != ''
        AND status = 'AWAITING_SHIPMENT'
      GROUP BY service_name
      ORDER BY order_count DESC
    `

    // Load all existing mappings
    const mappings = await prisma.shippingMethodMapping.findMany({
      select: { incomingName: true },
    })

    // Build a set of mapped names (lowercase for case-insensitive comparison)
    const mappedNames = new Set(mappings.map((m) => m.incomingName.toLowerCase()))

    // Split into mapped vs unmapped
    const unmapped: Array<{ serviceName: string; orderCount: number }> = []
    const mapped: Array<{ serviceName: string; orderCount: number }> = []

    for (const row of serviceCounts) {
      const entry = {
        serviceName: row.service_name,
        orderCount: row.order_count,
      }

      if (mappedNames.has(row.service_name.toLowerCase())) {
        mapped.push(entry)
      } else {
        unmapped.push(entry)
      }
    }

    return NextResponse.json({ unmapped, mapped })
  } catch (error: any) {
    console.error('Error fetching unmapped services:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch unmapped services' },
      { status: 500 }
    )
  }
}
