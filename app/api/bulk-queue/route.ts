import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const MAX_ORDERS_PER_CHUNK = 24

export interface CreateBulkQueueBody {
  /** Bulk group signature (e.g. "SKU1:2|SKU2:1") */
  bulkGroupSignature: string
  /** Order numbers in this group (will be chunked to max 24 each) */
  orderNumbers: string[]
  /** Package info for labels */
  packageInfo: {
    carrier: string
    service: string
    packaging: string
    weight: string
    dimensions: { length: string; width: string; height: string }
  }
}

/** Create queue items by chunking order numbers into batches of max 24 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateBulkQueueBody
    const { bulkGroupSignature, orderNumbers, packageInfo } = body

    if (!bulkGroupSignature || !Array.isArray(orderNumbers) || !packageInfo) {
      return NextResponse.json(
        { error: 'Missing bulkGroupSignature, orderNumbers, or packageInfo' },
        { status: 400 }
      )
    }

    const chunks: string[][] = []
    for (let i = 0; i < orderNumbers.length; i += MAX_ORDERS_PER_CHUNK) {
      chunks.push(orderNumbers.slice(i, i + MAX_ORDERS_PER_CHUNK))
    }

    const totalChunks = chunks.length

    // Get unique batch numbers from sequence (6 digits = 1M capacity, numbers only). If sequence doesn't exist yet, skip batchId.
    let batchIds: string[] = []
    try {
      const seqResult = await prisma.$queryRaw<{ nextval: bigint }[]>`
        SELECT nextval('bulk_batch_seq') FROM generate_series(1, ${totalChunks})
      `
      batchIds = (seqResult as { nextval: bigint }[]).map(
        (row) => 'Bulk-' + String(Number(row.nextval)).padStart(6, '0')
      )
    } catch (_) {
      // Sequence or column may not exist yet; run prisma/add-batch-id.sql in Supabase to enable batch IDs
    }

    const created = await prisma.bulkQueueItem.createMany({
      data: chunks.map((orders, chunkIndex) => ({
        ...(batchIds[chunkIndex] && { batchId: batchIds[chunkIndex] }),
        bulkGroupSignature,
        chunkIndex,
        totalChunks,
        orderNumbers: orders,
        packageInfo,
        status: 'PENDING',
      })),
    })

    return NextResponse.json({
      success: true,
      created: created.count,
      totalChunks,
      batchIds: batchIds.slice(0, created.count),
      message: `Created ${created.count} packer batch(es) (max ${MAX_ORDERS_PER_CHUNK} orders each)`,
    })
  } catch (error: any) {
    console.error('Error creating bulk queue items:', error)
    return NextResponse.json(
      { error: 'Failed to create queue items', details: error?.message },
      { status: 500 }
    )
  }
}

/** List pending queue items (not yet completed) */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') ?? 'PENDING'

    const items = await prisma.bulkQueueItem.findMany({
      where: { status },
      orderBy: [{ createdAt: 'asc' }],
    })

    return NextResponse.json({ items })
  } catch (error: any) {
    console.error('Error listing bulk queue:', error)
    return NextResponse.json(
      { error: 'Failed to list queue', details: error?.message },
      { status: 500 }
    )
  }
}
