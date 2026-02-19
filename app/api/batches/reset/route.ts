import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/batches/reset
 * Clears all batch-related data and resets carts.
 * Orders are unlinked from batches/chunks but not deleted.
 */
export async function POST() {
  try {
    console.log('[RESET] Starting batch data reset...')
    const start = Date.now()

    // 1. Unlink orders from batches and chunks, clear shipping/label data
    const unlinkResult = await prisma.orderLog.updateMany({
      where: {
        OR: [
          { batchId: { not: null } },
          { chunkId: { not: null } },
        ],
      },
      data: {
        batchId: null,
        bulkBatchId: null,
        chunkId: null,
        binNumber: null,
        trackingNumber: null,
        carrier: null,
        labelUrl: null,
        labelCost: null,
        labelId: null,
        shipmentId: null,
        shippedAt: null,
        printStatus: null,
        netsuiteUpdated: false,
        labelPrepurchased: false,
      },
    })
    console.log(`[RESET] Unlinked ${unlinkResult.count} orders (${Date.now() - start}ms)`)

    // 2. Delete shipment logs
    const shipmentLogResult = await prisma.shipmentLog.deleteMany({})
    console.log(`[RESET] Deleted ${shipmentLogResult.count} shipment logs (${Date.now() - start}ms)`)

    // 3. Delete chunk-bulk-batch assignments
    const chunkBBResult = await prisma.chunkBulkBatchAssignment.deleteMany({})
    console.log(`[RESET] Deleted ${chunkBBResult.count} chunk-bulk-batch assignments (${Date.now() - start}ms)`)

    // 4. Delete bulk batches
    const bulkResult = await prisma.bulkBatch.deleteMany({})
    console.log(`[RESET] Deleted ${bulkResult.count} bulk batches (${Date.now() - start}ms)`)

    // 5. Delete batch-cell assignments
    const cellResult = await prisma.batchCellAssignment.deleteMany({})
    console.log(`[RESET] Deleted ${cellResult.count} batch-cell assignments (${Date.now() - start}ms)`)

    // 6. Delete pick chunks (includes all engraving data)
    const chunkResult = await prisma.pickChunk.deleteMany({})
    console.log(`[RESET] Deleted ${chunkResult.count} pick chunks (${Date.now() - start}ms)`)

    // 7. Delete pick batches
    const batchResult = await prisma.pickBatch.deleteMany({})
    console.log(`[RESET] Deleted ${batchResult.count} pick batches (${Date.now() - start}ms)`)

    // 8. Reset all carts to AVAILABLE
    const cartResult = await prisma.pickCart.updateMany({
      data: { status: 'AVAILABLE' },
    })
    console.log(`[RESET] Reset ${cartResult.count} carts to AVAILABLE (${Date.now() - start}ms)`)

    // 9. Reset any SHIPPED orders back to AWAITING_SHIPMENT
    const resetStatusResult = await prisma.orderLog.updateMany({
      where: { status: 'SHIPPED' },
      data: { status: 'AWAITING_SHIPMENT' },
    })
    console.log(`[RESET] Reset ${resetStatusResult.count} shipped orders to AWAITING_SHIPMENT (${Date.now() - start}ms)`)

    console.log(`[RESET] Complete in ${Date.now() - start}ms`)

    return NextResponse.json({
      success: true,
      ordersUnlinked: unlinkResult.count,
      shipmentLogsDeleted: shipmentLogResult.count,
      bulkBatchesDeleted: bulkResult.count,
      cellAssignmentsDeleted: cellResult.count,
      chunksDeleted: chunkResult.count,
      batchesDeleted: batchResult.count,
      cartsReset: cartResult.count,
      ordersStatusReset: resetStatusResult.count,
    })
  } catch (error) {
    console.error('[RESET] Failed:', error)
    return NextResponse.json({ error: 'Failed to reset batch data' }, { status: 500 })
  }
}
