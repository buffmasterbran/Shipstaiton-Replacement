import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Types for order categorization
type OrderCategory = 'standard' | 'oversized' | 'print_only'

interface CategorizedOrder {
  orderNumber: string
  itemCount: number
  category: OrderCategory
}

// Helper to count items in an order (excluding insurance)
function countOrderItems(rawPayload: any): number {
  const order = Array.isArray(rawPayload) ? rawPayload[0] : rawPayload
  const items = order?.items || []
  
  return items.reduce((total: number, item: any) => {
    // Skip insurance items
    const sku = (item.sku || '').toUpperCase()
    const name = (item.name || '').toUpperCase()
    if (sku.includes('INSURANCE') || sku.includes('SHIPPING') || name.includes('INSURANCE')) {
      return total
    }
    return total + (item.quantity || 1)
  }, 0)
}

// Categorize order by item count
function categorizeOrder(itemCount: number): OrderCategory {
  if (itemCount <= 12) return 'standard'
  if (itemCount <= 24) return 'oversized'
  return 'print_only'
}

// Generate batch name: "S-Feb05-001" or "O-Feb05-001"
async function generateBatchName(isOversized: boolean): Promise<string> {
  const prefix = isOversized ? 'O' : 'S'
  const now = new Date()
  const month = now.toLocaleString('en-US', { month: 'short' })
  const day = String(now.getDate()).padStart(2, '0')
  const datePrefix = `${prefix}-${month}${day}`
  
  // Find existing batches with this prefix today
  const existingBatches = await prisma.pickBatch.findMany({
    where: {
      name: {
        startsWith: datePrefix,
      },
    },
    select: { name: true },
  })
  
  // Extract numbers and find the max
  let maxNum = 0
  existingBatches.forEach(batch => {
    const match = batch.name.match(/-(\d+)$/)
    if (match) {
      const num = parseInt(match[1], 10)
      if (num > maxNum) maxNum = num
    }
  })
  
  return `${datePrefix}-${String(maxNum + 1).padStart(3, '0')}`
}

// GET - List all batches with status/progress
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const cellId = searchParams.get('cellId')
    
    const where: any = {}
    if (status) where.status = status
    if (cellId) where.cellId = cellId
    
    const batches = await prisma.pickBatch.findMany({
      where,
      include: {
        cell: true,
        _count: {
          select: { orders: true, chunks: true },
        },
      },
      orderBy: [
        { cellId: 'asc' },
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

// POST - Create batch(es) from selected orders
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { orderNumbers, cellId } = body
    
    if (!orderNumbers || !Array.isArray(orderNumbers) || orderNumbers.length === 0) {
      return NextResponse.json({ error: 'Order numbers are required' }, { status: 400 })
    }
    
    if (!cellId) {
      return NextResponse.json({ error: 'Cell ID is required' }, { status: 400 })
    }
    
    // Verify cell exists and is active
    const cell = await prisma.pickCell.findUnique({
      where: { id: cellId },
    })
    
    if (!cell) {
      return NextResponse.json({ error: 'Cell not found' }, { status: 404 })
    }
    
    if (!cell.active) {
      return NextResponse.json({ error: 'Cell is not active' }, { status: 400 })
    }
    
    // Fetch orders and categorize them
    const orders = await prisma.orderLog.findMany({
      where: {
        orderNumber: { in: orderNumbers },
        status: 'AWAITING_SHIPMENT',
        batchId: null, // Only orders not already in a batch
      },
    })
    
    if (orders.length === 0) {
      return NextResponse.json({ 
        error: 'No eligible orders found. Orders must be awaiting shipment and not already in a batch.' 
      }, { status: 400 })
    }
    
    // Categorize orders by item count
    const categorized: CategorizedOrder[] = orders.map(order => {
      const itemCount = countOrderItems(order.rawPayload)
      return {
        orderNumber: order.orderNumber,
        itemCount,
        category: categorizeOrder(itemCount),
      }
    })
    
    // Group by category
    const standardOrders = categorized.filter(o => o.category === 'standard')
    const oversizedOrders = categorized.filter(o => o.category === 'oversized')
    const printOnlyOrders = categorized.filter(o => o.category === 'print_only')
    
    const createdBatches: any[] = []
    
    // Create standard batch if there are standard orders
    if (standardOrders.length > 0) {
      const batchName = await generateBatchName(false)
      const orderNums = standardOrders.map(o => o.orderNumber)
      
      // Get the max priority for this cell to add at the end
      const maxPriority = await prisma.pickBatch.aggregate({
        where: { cellId },
        _max: { priority: true },
      })
      
      const batch = await prisma.pickBatch.create({
        data: {
          name: batchName,
          cellId,
          status: 'DRAFT',
          priority: (maxPriority._max.priority ?? -1) + 1,
          totalOrders: standardOrders.length,
        },
      })
      
      // Update orders to link to this batch
      await prisma.orderLog.updateMany({
        where: { orderNumber: { in: orderNums } },
        data: { batchId: batch.id },
      })
      
      createdBatches.push({
        ...batch,
        type: 'standard',
        orderCount: standardOrders.length,
      })
    }
    
    // Create oversized batch if there are oversized orders
    if (oversizedOrders.length > 0) {
      const batchName = await generateBatchName(true)
      const orderNums = oversizedOrders.map(o => o.orderNumber)
      
      // Get the max priority for this cell to add at the end
      const maxPriority = await prisma.pickBatch.aggregate({
        where: { cellId },
        _max: { priority: true },
      })
      
      const batch = await prisma.pickBatch.create({
        data: {
          name: batchName,
          cellId,
          status: 'DRAFT',
          priority: (maxPriority._max.priority ?? -1) + 1,
          totalOrders: oversizedOrders.length,
        },
      })
      
      // Update orders to link to this batch
      await prisma.orderLog.updateMany({
        where: { orderNumber: { in: orderNums } },
        data: { batchId: batch.id },
      })
      
      createdBatches.push({
        ...batch,
        type: 'oversized',
        orderCount: oversizedOrders.length,
      })
    }
    
    return NextResponse.json({
      batches: createdBatches,
      summary: {
        standardOrders: standardOrders.length,
        oversizedOrders: oversizedOrders.length,
        printOnlyOrders: printOnlyOrders.length,
        printOnlyOrderNumbers: printOnlyOrders.map(o => o.orderNumber),
      },
    })
  } catch (error) {
    console.error('Failed to create batch:', error)
    return NextResponse.json({ error: 'Failed to create batch' }, { status: 500 })
  }
}

// PATCH - Update batch (cell assignment, priority, status)
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, cellId, priority, status } = body
    
    if (!id) {
      return NextResponse.json({ error: 'Batch ID is required' }, { status: 400 })
    }
    
    // Verify batch exists
    const existingBatch = await prisma.pickBatch.findUnique({
      where: { id },
    })
    
    if (!existingBatch) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 })
    }
    
    const updateData: any = {}
    
    // Update cell if provided
    if (cellId !== undefined) {
      const cell = await prisma.pickCell.findUnique({
        where: { id: cellId },
      })
      if (!cell) {
        return NextResponse.json({ error: 'Cell not found' }, { status: 404 })
      }
      if (!cell.active) {
        return NextResponse.json({ error: 'Cell is not active' }, { status: 400 })
      }
      updateData.cellId = cellId
    }
    
    // Update priority if provided
    if (priority !== undefined) {
      updateData.priority = priority
    }
    
    // Update status if provided
    if (status !== undefined) {
      const validStatuses = ['DRAFT', 'RELEASED', 'IN_PROGRESS', 'COMPLETED']
      if (!validStatuses.includes(status)) {
        return NextResponse.json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` }, { status: 400 })
      }
      updateData.status = status
      
      // Set timestamps based on status changes
      if (status === 'RELEASED' && !existingBatch.releasedAt) {
        updateData.releasedAt = new Date()
      }
      if (status === 'COMPLETED' && !existingBatch.completedAt) {
        updateData.completedAt = new Date()
      }
    }
    
    const batch = await prisma.pickBatch.update({
      where: { id },
      data: updateData,
      include: {
        cell: true,
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

// DELETE - Delete batch (returns orders to unassigned)
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    
    if (!id) {
      return NextResponse.json({ error: 'Batch ID is required' }, { status: 400 })
    }
    
    // Verify batch exists
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
      },
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
