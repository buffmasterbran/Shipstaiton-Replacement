import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * POST - Reorder batch priority within a cell.
 * 
 * In the new model, batches are assigned to cells via BatchCellAssignment.
 * Priority is set on both the batch and the assignment.
 * Reordering updates priority within a cell, and since priority is 
 * currently global (same across all cells), we update the batch priority too.
 * 
 * Request body:
 * {
 *   batchId: string
 *   cellId: string       // Which cell to reorder within
 *   newPriority: number  // New priority position
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { batchId, cellId, newPriority } = body

    if (!batchId) {
      return NextResponse.json({ error: 'Batch ID is required' }, { status: 400 })
    }

    if (!cellId) {
      return NextResponse.json({ error: 'Cell ID is required' }, { status: 400 })
    }

    if (newPriority === undefined) {
      return NextResponse.json({ error: 'New priority is required' }, { status: 400 })
    }

    // Fetch the batch and its cell assignment
    const assignment = await prisma.batchCellAssignment.findUnique({
      where: {
        batchId_cellId: { batchId, cellId },
      },
    })

    if (!assignment) {
      return NextResponse.json({ error: 'Batch is not assigned to this cell' }, { status: 404 })
    }

    const oldPriority = assignment.priority

    if (newPriority === oldPriority) {
      return NextResponse.json({ success: true, message: 'No change needed' })
    }

    // Reorder within the cell using a transaction
    await prisma.$transaction(async (tx) => {
      if (newPriority < oldPriority) {
        // Moving up (towards priority 0)
        // Increment priorities of assignments between new and old position
        await tx.batchCellAssignment.updateMany({
          where: {
            cellId,
            priority: { gte: newPriority, lt: oldPriority },
            batchId: { not: batchId },
          },
          data: {
            priority: { increment: 1 },
          },
        })
      } else {
        // Moving down (towards higher priority number)
        // Decrement priorities of assignments between old and new position
        await tx.batchCellAssignment.updateMany({
          where: {
            cellId,
            priority: { gt: oldPriority, lte: newPriority },
            batchId: { not: batchId },
          },
          data: {
            priority: { decrement: 1 },
          },
        })
      }

      // Update this assignment's priority
      await tx.batchCellAssignment.update({
        where: {
          batchId_cellId: { batchId, cellId },
        },
        data: { priority: newPriority },
      })

      // Also update the batch's own priority (global priority = same across all cells)
      await tx.pickBatch.update({
        where: { id: batchId },
        data: { priority: newPriority },
      })

      // Update all other cell assignments for this batch to match
      await tx.batchCellAssignment.updateMany({
        where: {
          batchId,
          cellId: { not: cellId },
        },
        data: { priority: newPriority },
      })
    })

    // Fetch updated batch
    const updatedBatch = await prisma.pickBatch.findUnique({
      where: { id: batchId },
      include: {
        cellAssignments: {
          include: { cell: true },
        },
        _count: {
          select: { orders: true, chunks: true },
        },
      },
    })

    return NextResponse.json({ batch: updatedBatch })
  } catch (error) {
    console.error('Failed to reorder batch:', error)
    return NextResponse.json({ error: 'Failed to reorder batch' }, { status: 500 })
  }
}
