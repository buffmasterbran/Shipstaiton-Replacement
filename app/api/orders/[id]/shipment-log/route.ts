import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const logs = await prisma.shipmentLog.findMany({
      where: { orderLogId: params.id },
      orderBy: { createdAt: 'desc' },
    })

    const serialized = logs.map(log => ({
      ...log,
      printJobId: log.printJobId ? Number(log.printJobId) : null,
    }))

    return NextResponse.json(serialized)
  } catch (error: any) {
    console.error('[shipment-log] Error:', error)
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 })
  }
}
