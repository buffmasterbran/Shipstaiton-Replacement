import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  computeOrderSignature,
  splitBulkGroup,
  buildBulkSkuLayout,
  type ClassifiableItem,
} from '@/lib/order-classifier'
import { isShippingInsurance } from '@/lib/order-utils'

// ============================================================================
// Batch Name Generation
// ============================================================================

/**
 * Generate batch name: "SGL-Feb05-001", "BLK-Feb05-001", "OBS-Feb05-001"
 */
async function generateBatchName(type: 'SINGLES' | 'BULK' | 'ORDER_BY_SIZE'): Promise<string> {
  const prefixMap = { SINGLES: 'SGL', BULK: 'BLK', ORDER_BY_SIZE: 'OBS' }
  const prefix = prefixMap[type]
  const now = new Date()
  const month = now.toLocaleString('en-US', { month: 'short' })
  const day = String(now.getDate()).padStart(2, '0')
  const datePrefix = `${prefix}-${month}${day}`

  const existingBatches = await prisma.pickBatch.findMany({
    where: { name: { startsWith: datePrefix } },
    select: { name: true },
  })

  let maxNum = 0
  existingBatches.forEach((batch) => {
    const match = batch.name.match(/-(\d+)$/)
    if (match) {
      const num = parseInt(match[1], 10)
      if (num > maxNum) maxNum = num
    }
  })

  return `${datePrefix}-${String(maxNum + 1).padStart(3, '0')}`
}

/**
 * Get the next priority value for batches across given cells
 */
async function getNextPriority(cellIds: string[]): Promise<number> {
  const maxPriority = await prisma.batchCellAssignment.aggregate({
    where: { cellId: { in: cellIds } },
    _max: { priority: true },
  })
  return (maxPriority._max.priority ?? -1) + 1
}

/**
 * Get the next priority for personalized batches (no cell assignment)
 */
async function getNextPersonalizedPriority(): Promise<number> {
  const maxPriority = await prisma.pickBatch.aggregate({
    where: {
      isPersonalized: true,
      cellAssignments: { none: {} },
    },
    _max: { priority: true },
  })
  return (maxPriority._max.priority ?? -1) + 1
}

/**
 * Extract non-insurance items from a raw order payload
 */
function extractRealItems(rawPayload: any): ClassifiableItem[] {
  const order = Array.isArray(rawPayload) ? rawPayload[0] : rawPayload
  const items = order?.items || []
  return items
    .filter((item: any) => !isShippingInsurance(item.sku || '', item.name || ''))
    .map((item: any) => ({
      sku: item.sku || '',
      name: item.name || '',
      quantity: item.quantity || 1,
    }))
}

// ============================================================================
// GET - List batches with cell assignments
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const cellId = searchParams.get('cellId')
    const type = searchParams.get('type')

    const where: any = {}
    if (status) where.status = status
    if (type) where.type = type

    // If filtering by cell, find batches assigned to that cell
    if (cellId) {
      where.cellAssignments = {
        some: { cellId },
      }
    }

    const batches = await prisma.pickBatch.findMany({
      where,
      include: {
        cellAssignments: {
          include: { cell: true },
        },
        bulkBatches: {
          select: {
            id: true,
            groupSignature: true,
            orderCount: true,
            splitIndex: true,
            totalSplits: true,
            status: true,
          },
        },
        _count: {
          select: { orders: true, chunks: true },
        },
      },
      orderBy: [
        { priority: 'asc' },
        { createdAt: 'desc' },
      ],
    })

    return NextResponse.json({ batches })
  } catch (error) {
    console.error('Failed to fetch batches:', error)
    return NextResponse.json({ error: 'Failed to fetch batches' }, { status: 500 })
  }
}

// ============================================================================
// POST - Create batch from selected orders
// ============================================================================

/**
 * Request body:
 * {
 *   orderNumbers: string[]         // Orders to include
 *   cellIds: string[]              // Cells to assign to (multi-cell)
 *   type: 'SINGLES' | 'BULK' | 'ORDER_BY_SIZE'
 *   isPersonalized?: boolean       // For personalized orders
 *   customName?: string            // Optional custom batch name
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      orderNumbers,
      cellIds,
      type = 'ORDER_BY_SIZE',
      isPersonalized = false,
      customName,
    } = body

    // Validate inputs
    if (!orderNumbers || !Array.isArray(orderNumbers) || orderNumbers.length === 0) {
      return NextResponse.json({ error: 'Order numbers are required' }, { status: 400 })
    }

    const validTypes = ['SINGLES', 'BULK', 'ORDER_BY_SIZE']
    if (!validTypes.includes(type)) {
      return NextResponse.json({ error: `Invalid type. Must be one of: ${validTypes.join(', ')}` }, { status: 400 })
    }

    // Personalized batches don't need cell assignments (they go to the personalized pool)
    const hasCells = cellIds && Array.isArray(cellIds) && cellIds.length > 0

    if (!isPersonalized && !hasCells) {
      return NextResponse.json({ error: 'At least one cell ID is required for non-personalized batches' }, { status: 400 })
    }

    // Verify all cells exist and are active (if any provided)
    let cells: any[] = []
    if (hasCells) {
      cells = await prisma.pickCell.findMany({
        where: { id: { in: cellIds }, active: true },
      })

      if (cells.length !== cellIds.length) {
        return NextResponse.json({ error: 'One or more cells not found or not active' }, { status: 400 })
      }
    }

    // Fetch eligible orders (awaiting shipment, not already in a batch)
    const orders = await prisma.orderLog.findMany({
      where: {
        orderNumber: { in: orderNumbers },
        status: 'AWAITING_SHIPMENT',
        batchId: null,
      },
    })

    if (orders.length === 0) {
      return NextResponse.json({
        error: 'No eligible orders found. Orders must be awaiting shipment and not already in a batch.',
      }, { status: 400 })
    }

    // Generate batch name (personalized batches use PRS prefix)
    const batchName = customName || (await generateBatchName(isPersonalized ? 'ORDER_BY_SIZE' : type as any))
    const priority = hasCells ? await getNextPriority(cellIds) : await getNextPersonalizedPriority()

    // Create the batch
    const batch = await prisma.pickBatch.create({
      data: {
        name: isPersonalized && !customName ? batchName.replace('OBS-', 'PRS-') : batchName,
        type: type as any,
        status: 'ACTIVE',
        priority,
        isPersonalized,
        totalOrders: orders.length,
      },
    })

    // Create cell assignments (many-to-many) - skip for personalized (they live in a pool)
    if (hasCells) {
      await prisma.batchCellAssignment.createMany({
        data: cellIds.map((cId: string) => ({
          batchId: batch.id,
          cellId: cId,
          priority,
        })),
      })
    }

    // For BULK type: create BulkBatch records with balanced splitting
    if (type === 'BULK') {
      // Group orders by their signature
      const signatureGroups = new Map<string, typeof orders>()

      for (const order of orders) {
        const items = extractRealItems(order.rawPayload)
        const sig = computeOrderSignature(items)
        const existing = signatureGroups.get(sig.signature)
        if (existing) {
          existing.push(order)
        } else {
          signatureGroups.set(sig.signature, [order])
        }
      }

      // Create BulkBatch records for each group (with splitting if > 24)
      const bulkBatchPromises: Promise<any>[] = []

      signatureGroups.forEach((groupOrders, signature) => {
        const items = extractRealItems(groupOrders[0].rawPayload)
        const sig = computeOrderSignature(items)
        const splits = splitBulkGroup(groupOrders.length)
        const skuLayout = buildBulkSkuLayout(sig.items, 0) // qty filled per-split below

        let orderIndex = 0
        splits.forEach((splitCount, splitIdx) => {
          // Build layout with actual count for this split
          const splitLayout = buildBulkSkuLayout(sig.items, splitCount)

          const promise = prisma.bulkBatch.create({
            data: {
              parentBatchId: batch.id,
              groupSignature: signature,
              orderCount: splitCount,
              splitIndex: splitIdx,
              totalSplits: splits.length,
              skuLayout: splitLayout as any,
              status: 'PENDING',
            },
          }).then(async (bulkBatch) => {
            // Assign orders to this bulk batch
            const splitOrders = groupOrders.slice(orderIndex, orderIndex + splitCount)
            orderIndex += splitCount

            await prisma.orderLog.updateMany({
              where: {
                orderNumber: { in: splitOrders.map((o) => o.orderNumber) },
              },
              data: {
                batchId: batch.id,
                bulkBatchId: bulkBatch.id,
              },
            })

            return bulkBatch
          })

          bulkBatchPromises.push(promise)
        })
      })

      await Promise.all(bulkBatchPromises)
    } else {
      // For SINGLES and ORDER_BY_SIZE: just link orders to the batch
      await prisma.orderLog.updateMany({
        where: { orderNumber: { in: orders.map((o) => o.orderNumber) } },
        data: { batchId: batch.id },
      })
    }

    // Fetch the complete batch with relations
    const completeBatch = await prisma.pickBatch.findUnique({
      where: { id: batch.id },
      include: {
        cellAssignments: {
          include: { cell: true },
        },
        bulkBatches: true,
        _count: {
          select: { orders: true, chunks: true },
        },
      },
    })

    return NextResponse.json({
      batch: completeBatch,
      summary: {
        totalOrders: orders.length,
        cellsAssigned: hasCells ? cellIds.length : 0,
        isPersonalized,
        bulkBatches: type === 'BULK' ? completeBatch?.bulkBatches?.length || 0 : 0,
      },
    })
  } catch (error) {
    console.error('Failed to create batch:', error)
    return NextResponse.json({ error: 'Failed to create batch' }, { status: 500 })
  }
}

// ============================================================================
// PATCH - Update batch (priority, status)
// ============================================================================

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, priority, status } = body

    if (!id) {
      return NextResponse.json({ error: 'Batch ID is required' }, { status: 400 })
    }

    const existingBatch = await prisma.pickBatch.findUnique({
      where: { id },
    })

    if (!existingBatch) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 })
    }

    const updateData: any = {}

    if (priority !== undefined) {
      updateData.priority = priority
    }

    if (status !== undefined) {
      const validStatuses = ['ACTIVE', 'IN_PROGRESS', 'COMPLETED']
      if (!validStatuses.includes(status)) {
        return NextResponse.json(
          { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
          { status: 400 }
        )
      }
      updateData.status = status

      if (status === 'COMPLETED' && !existingBatch.completedAt) {
        updateData.completedAt = new Date()
      }
    }

    const batch = await prisma.pickBatch.update({
      where: { id },
      data: updateData,
      include: {
        cellAssignments: {
          include: { cell: true },
        },
        _count: {
          select: { orders: true, chunks: true },
        },
      },
    })

    return NextResponse.json({ batch })
  } catch (error) {
    console.error('Failed to update batch:', error)
    return NextResponse.json({ error: 'Failed to update batch' }, { status: 500 })
  }
}

// ============================================================================
// DELETE - Delete batch (returns orders to unassigned)
// ============================================================================

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Batch ID is required' }, { status: 400 })
    }

    const batch = await prisma.pickBatch.findUnique({
      where: { id },
      include: {
        _count: {
          select: { orders: true, chunks: true },
        },
      },
    })

    if (!batch) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 })
    }

    // Don't allow deletion of in-progress or completed batches
    if (batch.status === 'IN_PROGRESS') {
      return NextResponse.json({ error: 'Cannot delete a batch that is in progress' }, { status: 400 })
    }

    if (batch.status === 'COMPLETED') {
      return NextResponse.json({ error: 'Cannot delete a completed batch' }, { status: 400 })
    }

    // Unassign orders from this batch
    await prisma.orderLog.updateMany({
      where: { batchId: id },
      data: {
        batchId: null,
        chunkId: null,
        binNumber: null,
        bulkBatchId: null,
      },
    })

    // Delete bulk batches (cascade should handle this, but be explicit)
    await prisma.bulkBatch.deleteMany({
      where: { parentBatchId: id },
    })

    // Delete cell assignments
    await prisma.batchCellAssignment.deleteMany({
      where: { batchId: id },
    })

    // Delete any chunks
    await prisma.pickChunk.deleteMany({
      where: { batchId: id },
    })

    // Delete the batch
    await prisma.pickBatch.delete({
      where: { id },
    })

    return NextResponse.json({
      success: true,
      ordersUnassigned: batch._count.orders,
    })
  } catch (error) {
    console.error('Failed to delete batch:', error)
    return NextResponse.json({ error: 'Failed to delete batch' }, { status: 500 })
  }
}
