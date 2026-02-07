import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// ============================================================================
// PUT /api/batches/cells - Update cell assignments for a batch
// ============================================================================

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { batchId, cellIds } = body as { batchId: string; cellIds: string[] }

    if (!batchId || !cellIds || cellIds.length === 0) {
      return NextResponse.json(
        { error: 'batchId and at least one cellId are required' },
        { status: 400 }
      )
    }

    // Get current assignments
    const currentAssignments = await prisma.batchCellAssignment.findMany({
      where: { batchId },
    })

    const currentCellIds = currentAssignments.map(a => a.cellId)
    const toAdd = cellIds.filter(id => !currentCellIds.includes(id))
    const toRemove = currentCellIds.filter(id => !cellIds.includes(id))

    // Get max priority for new cells so we can add at the bottom
    const maxPriorities: Record<string, number> = {}
    if (toAdd.length > 0) {
      for (const cellId of toAdd) {
        const maxAssignment = await prisma.batchCellAssignment.findFirst({
          where: { cellId },
          orderBy: { priority: 'desc' },
        })
        maxPriorities[cellId] = (maxAssignment?.priority ?? -1) + 1
      }
    }

    // Perform all changes in a transaction
    await prisma.$transaction(async (tx) => {
      // Remove assignments for cells being removed
      if (toRemove.length > 0) {
        await tx.batchCellAssignment.deleteMany({
          where: {
            batchId,
            cellId: { in: toRemove },
          },
        })
      }

      // Add assignments for new cells
      for (const cellId of toAdd) {
        await tx.batchCellAssignment.create({
          data: {
            batchId,
            cellId,
            priority: maxPriorities[cellId],
          },
        })
      }

      // Update the batch's cellId to the first assigned cell (for backward compatibility)
      if (cellIds.length > 0) {
        await tx.pickBatch.update({
          where: { id: batchId },
          data: { cellId: cellIds[0] },
        })
      }
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Failed to update cell assignments:', err)
    return NextResponse.json(
      { error: 'Failed to update cell assignments' },
      { status: 500 }
    )
  }
}
