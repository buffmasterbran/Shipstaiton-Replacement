import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// POST - Reorder batches within a cell or move between cells
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { batchId, newCellId, newPriority } = body
    
    if (!batchId) {
      return NextResponse.json({ error: 'Batch ID is required' }, { status: 400 })
    }
    
    if (newPriority === undefined) {
      return NextResponse.json({ error: 'New priority is required' }, { status: 400 })
    }
    
    // Fetch the batch
    const batch = await prisma.pickBatch.findUnique({
      where: { id: batchId },
    })
    
    if (!batch) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 })
    }
    
    // Determine target cell (use new cell if provided, otherwise keep current)
    const targetCellId = newCellId || batch.cellId
    
    // Verify target cell exists and is active
    if (newCellId) {
      const cell = await prisma.pickCell.findUnique({
        where: { id: targetCellId },
      })
      
      if (!cell) {
        return NextResponse.json({ error: 'Target cell not found' }, { status: 404 })
      }
      
      if (!cell.active) {
        return NextResponse.json({ error: 'Target cell is not active' }, { status: 400 })
      }
    }
    
    const oldCellId = batch.cellId
    const oldPriority = batch.priority
    const isMovingCells = newCellId && newCellId !== oldCellId
    
    // Begin transaction for reordering
    await prisma.$transaction(async (tx) => {
      if (isMovingCells) {
        // Moving to a different cell
        // 1. Shift priorities in the old cell to fill the gap
        await tx.pickBatch.updateMany({
          where: {
            cellId: oldCellId,
            priority: { gt: oldPriority },
          },
          data: {
            priority: { decrement: 1 },
          },
        })
        
        // 2. Make room in the new cell at the target position
        await tx.pickBatch.updateMany({
          where: {
            cellId: targetCellId,
            priority: { gte: newPriority },
          },
          data: {
            priority: { increment: 1 },
          },
        })
        
        // 3. Update the batch with new cell and priority
        await tx.pickBatch.update({
          where: { id: batchId },
          data: {
            cellId: targetCellId,
            priority: newPriority,
          },
        })
      } else {
        // Reordering within the same cell
        if (newPriority === oldPriority) {
          // No change needed
          return
        }
        
        if (newPriority < oldPriority) {
          // Moving up (towards priority 0)
          // Increment priorities of items between new and old position
          await tx.pickBatch.updateMany({
            where: {
              cellId: targetCellId,
              priority: { gte: newPriority, lt: oldPriority },
              id: { not: batchId },
            },
            data: {
              priority: { increment: 1 },
            },
          })
        } else {
          // Moving down (towards higher priority number)
          // Decrement priorities of items between old and new position
          await tx.pickBatch.updateMany({
            where: {
              cellId: targetCellId,
              priority: { gt: oldPriority, lte: newPriority },
              id: { not: batchId },
            },
            data: {
              priority: { decrement: 1 },
            },
          })
        }
        
        // Update the batch priority
        await tx.pickBatch.update({
          where: { id: batchId },
          data: { priority: newPriority },
        })
      }
    })
    
    // Fetch updated batch
    const updatedBatch = await prisma.pickBatch.findUnique({
      where: { id: batchId },
      include: {
        cell: true,
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
