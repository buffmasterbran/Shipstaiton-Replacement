import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/** Get a single queue item (for verification dialog) */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const item = await prisma.bulkQueueItem.findUnique({
      where: { id },
    })
    if (!item) {
      return NextResponse.json({ error: 'Queue item not found' }, { status: 404 })
    }
    return NextResponse.json(item)
  } catch (error: any) {
    console.error('Error fetching bulk queue item:', error)
    return NextResponse.json(
      { error: 'Failed to fetch queue item', details: error?.message },
      { status: 500 }
    )
  }
}

/** Update queue item (e.g. set status to COMPLETED after labels printed) */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { status } = body as { status?: string }

    if (!status || !['PENDING', 'COMPLETED'].includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status. Use PENDING or COMPLETED' },
        { status: 400 }
      )
    }

    const item = await prisma.bulkQueueItem.update({
      where: { id },
      data: { status },
    })
    return NextResponse.json(item)
  } catch (error: any) {
    console.error('Error updating bulk queue item:', error)
    return NextResponse.json(
      { error: 'Failed to update queue item', details: error?.message },
      { status: 500 }
    )
  }
}
