import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Helper to count items in an order (excluding insurance)
function countOrderItems(rawPayload: any): number {
  const order = Array.isArray(rawPayload) ? rawPayload[0] : rawPayload
  const items = order?.items || []
  
  return items.reduce((total: number, item: any) => {
    const sku = (item.sku || '').toUpperCase()
    const name = (item.name || '').toUpperCase()
    if (sku.includes('INSURANCE') || sku.includes('SHIPPING') || name.includes('INSURANCE')) {
      return total
    }
    return total + (item.quantity || 1)
  }, 0)
}

// GET - Get picking state for a cell (available chunks, cart info, etc.)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const cellId = searchParams.get('cellId')
    const action = searchParams.get('action')

    if (action === 'available-carts') {
      // Get available carts
      const carts = await prisma.pickCart.findMany({
        where: {
          active: true,
          status: 'AVAILABLE',
        },
        orderBy: { name: 'asc' },
      })
      return NextResponse.json({ carts })
    }

    if (action === 'active-cells') {
      // Get active cells
      const cells = await prisma.pickCell.findMany({
        where: { active: true },
        orderBy: { name: 'asc' },
      })
      return NextResponse.json({ cells })
    }

    if (!cellId) {
      return NextResponse.json({ error: 'Cell ID is required' }, { status: 400 })
    }

    // Get released batches for this cell with orders that need chunks
    const releasedBatches = await prisma.pickBatch.findMany({
      where: {
        cellId,
        status: { in: ['RELEASED', 'IN_PROGRESS'] },
      },
      include: {
        orders: {
          where: {
            chunkId: null, // Orders not yet assigned to a chunk
            status: 'AWAITING_SHIPMENT',
          },
          select: {
            id: true,
            orderNumber: true,
            rawPayload: true,
          },
        },
        chunks: {
          where: {
            status: { in: ['AVAILABLE', 'PICKING'] },
          },
          include: {
            cart: true,
          },
        },
      },
      orderBy: { priority: 'asc' },
    })

    // Calculate available orders to pick
    let availableOrderCount = 0
    releasedBatches.forEach(batch => {
      availableOrderCount += batch.orders.length
    })

    // Get chunks that are ready for picking
    const availableChunks = await prisma.pickChunk.findMany({
      where: {
        status: 'AVAILABLE',
        batch: {
          cellId,
          status: { in: ['RELEASED', 'IN_PROGRESS'] },
        },
      },
      include: {
        batch: true,
        orders: {
          select: {
            id: true,
            orderNumber: true,
            binNumber: true,
          },
        },
      },
    })

    return NextResponse.json({
      releasedBatches: releasedBatches.map(b => ({
        id: b.id,
        name: b.name,
        status: b.status,
        totalOrders: b.totalOrders,
        unassignedOrders: b.orders.length,
        activeChunks: b.chunks.length,
      })),
      availableOrderCount,
      availableChunks,
    })
  } catch (error) {
    console.error('Failed to fetch picking state:', error)
    return NextResponse.json({ error: 'Failed to fetch picking state' }, { status: 500 })
  }
}

// POST - Picking actions (claim chunk, complete bin, out of stock)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action } = body

    switch (action) {
      case 'claim-chunk': {
        // Claim a chunk for picking (create if needed)
        const { cellId, cartId, pickerName } = body

        if (!cellId || !cartId || !pickerName) {
          return NextResponse.json({ 
            error: 'Cell ID, Cart ID, and Picker Name are required' 
          }, { status: 400 })
        }

        // Verify cart is available
        const cart = await prisma.pickCart.findUnique({
          where: { id: cartId },
        })

        if (!cart || !cart.active) {
          return NextResponse.json({ error: 'Cart not found or inactive' }, { status: 404 })
        }

        if (cart.status !== 'AVAILABLE') {
          return NextResponse.json({ error: 'Cart is not available' }, { status: 400 })
        }

        // Find the next batch with unassigned orders
        const batch = await prisma.pickBatch.findFirst({
          where: {
            cellId,
            status: { in: ['RELEASED', 'IN_PROGRESS'] },
            orders: {
              some: {
                chunkId: null,
                status: 'AWAITING_SHIPMENT',
              },
            },
          },
          include: {
            orders: {
              where: {
                chunkId: null,
                status: 'AWAITING_SHIPMENT',
              },
              include: {
                // We need rawPayload to get SKU info
              },
            },
          },
          orderBy: { priority: 'asc' },
        })

        if (!batch || batch.orders.length === 0) {
          return NextResponse.json({ 
            error: 'No orders available to pick in this cell' 
          }, { status: 404 })
        }

        // Determine chunk size based on batch type (Standard=12, Oversized=6)
        const isOversized = batch.name.startsWith('O-')
        const chunkSize = isOversized ? 6 : 12

        // Get orders for this chunk (up to chunk size)
        const ordersForChunk = batch.orders.slice(0, chunkSize)

        // Get the next chunk number for this batch
        const maxChunk = await prisma.pickChunk.aggregate({
          where: { batchId: batch.id },
          _max: { chunkNumber: true },
        })
        const chunkNumber = (maxChunk._max.chunkNumber ?? 0) + 1

        // Create the chunk
        const chunk = await prisma.pickChunk.create({
          data: {
            batchId: batch.id,
            chunkNumber,
            status: 'PICKING',
            cartId,
            pickerName,
            ordersInChunk: ordersForChunk.length,
            claimedAt: new Date(),
            pickingStartedAt: new Date(),
          },
        })

        // Assign orders to the chunk with bin numbers
        // Sort orders by bin location for efficient picking
        const ordersWithBinLocation = await Promise.all(
          ordersForChunk.map(async (order) => {
            const payload = order.rawPayload as any
            const orderData = Array.isArray(payload) ? payload[0] : payload
            const items = orderData?.items || []
            
            // Get the first item's SKU to look up bin location
            const firstItem = items.find((item: any) => {
              const sku = (item.sku || '').toUpperCase()
              const name = (item.name || '').toUpperCase()
              return !sku.includes('INSURANCE') && !sku.includes('SHIPPING') && !name.includes('INSURANCE')
            })

            let binLocation = 'ZZZ' // Default for unknown
            if (firstItem?.sku) {
              const skuRecord = await prisma.productSku.findUnique({
                where: { sku: firstItem.sku.toUpperCase() },
                select: { binLocation: true },
              })
              if (skuRecord?.binLocation) {
                binLocation = skuRecord.binLocation
              }
            }

            return {
              ...order,
              binLocation,
            }
          })
        )

        // Sort by bin location
        ordersWithBinLocation.sort((a, b) => a.binLocation.localeCompare(b.binLocation))

        // Update orders with chunk ID and bin numbers
        for (let i = 0; i < ordersWithBinLocation.length; i++) {
          await prisma.orderLog.update({
            where: { id: ordersWithBinLocation[i].id },
            data: {
              chunkId: chunk.id,
              binNumber: i + 1,
            },
          })
        }

        // Update cart status
        await prisma.pickCart.update({
          where: { id: cartId },
          data: { status: 'PICKING' },
        })

        // Update batch status if this is the first chunk
        if (batch.status === 'RELEASED') {
          await prisma.pickBatch.update({
            where: { id: batch.id },
            data: { status: 'IN_PROGRESS' },
          })
        }

        // Fetch the complete chunk with orders
        const completeChunk = await prisma.pickChunk.findUnique({
          where: { id: chunk.id },
          include: {
            batch: true,
            cart: true,
            orders: {
              orderBy: { binNumber: 'asc' },
            },
          },
        })

        return NextResponse.json({ chunk: completeChunk })
      }

      case 'complete-bin': {
        // Mark a bin as picked (advance to next bin)
        const { chunkId, binNumber } = body

        if (!chunkId || binNumber === undefined) {
          return NextResponse.json({ 
            error: 'Chunk ID and Bin Number are required' 
          }, { status: 400 })
        }

        // Just acknowledge - the UI will advance to the next bin
        return NextResponse.json({ success: true })
      }

      case 'complete-chunk': {
        // Mark entire chunk as picked
        const { chunkId } = body

        if (!chunkId) {
          return NextResponse.json({ error: 'Chunk ID is required' }, { status: 400 })
        }

        const chunk = await prisma.pickChunk.findUnique({
          where: { id: chunkId },
          include: { cart: true },
        })

        if (!chunk) {
          return NextResponse.json({ error: 'Chunk not found' }, { status: 404 })
        }

        // Calculate pick duration
        const pickDuration = chunk.pickingStartedAt 
          ? Math.round((Date.now() - new Date(chunk.pickingStartedAt).getTime()) / 1000)
          : null

        // Update chunk status
        await prisma.pickChunk.update({
          where: { id: chunkId },
          data: {
            status: 'PICKED',
            pickingCompletedAt: new Date(),
            pickDurationSeconds: pickDuration,
          },
        })

        // Update cart status
        if (chunk.cartId) {
          await prisma.pickCart.update({
            where: { id: chunk.cartId },
            data: { status: 'PICKED_READY' },
          })
        }

        return NextResponse.json({ success: true, pickDurationSeconds: pickDuration })
      }

      case 'out-of-stock': {
        // Mark an item as out of stock and return affected orders to queue
        const { chunkId, sku, affectedBinNumbers } = body

        if (!chunkId || !sku || !affectedBinNumbers || !Array.isArray(affectedBinNumbers)) {
          return NextResponse.json({ 
            error: 'Chunk ID, SKU, and affected bin numbers are required' 
          }, { status: 400 })
        }

        // Get orders in affected bins
        const affectedOrders = await prisma.orderLog.findMany({
          where: {
            chunkId,
            binNumber: { in: affectedBinNumbers },
          },
        })

        // Unassign these orders from the chunk (they'll be picked up in the next chunk)
        await prisma.orderLog.updateMany({
          where: {
            id: { in: affectedOrders.map(o => o.id) },
          },
          data: {
            chunkId: null,
            binNumber: null,
          },
        })

        // Update chunk orders count
        const chunk = await prisma.pickChunk.findUnique({
          where: { id: chunkId },
        })

        if (chunk) {
          await prisma.pickChunk.update({
            where: { id: chunkId },
            data: {
              ordersSkipped: (chunk.ordersSkipped || 0) + affectedOrders.length,
              ordersInChunk: chunk.ordersInChunk - affectedOrders.length,
            },
          })
        }

        return NextResponse.json({ 
          success: true,
          ordersReturned: affectedOrders.length,
          affectedOrderNumbers: affectedOrders.map(o => o.orderNumber),
        })
      }

      case 'cancel-chunk': {
        // Cancel a chunk and return all orders to the batch queue
        const { chunkId, reason } = body

        if (!chunkId) {
          return NextResponse.json({ error: 'Chunk ID is required' }, { status: 400 })
        }

        const chunk = await prisma.pickChunk.findUnique({
          where: { id: chunkId },
          include: {
            orders: true,
            cart: true,
          },
        })

        if (!chunk) {
          return NextResponse.json({ error: 'Chunk not found' }, { status: 404 })
        }

        // Only allow cancellation of PICKING or PICKED chunks
        if (!['PICKING', 'PICKED'].includes(chunk.status)) {
          return NextResponse.json({ 
            error: `Cannot cancel chunk with status ${chunk.status}` 
          }, { status: 400 })
        }

        const ordersToReturn = chunk.orders.length

        // Unassign all orders from this chunk
        await prisma.orderLog.updateMany({
          where: { chunkId },
          data: {
            chunkId: null,
            binNumber: null,
          },
        })

        // Update chunk status to CANCELLED
        await prisma.pickChunk.update({
          where: { id: chunkId },
          data: {
            status: 'CANCELLED',
            ordersSkipped: ordersToReturn,
            ordersInChunk: 0,
          },
        })

        // Release the cart back to AVAILABLE
        if (chunk.cartId) {
          await prisma.pickCart.update({
            where: { id: chunk.cartId },
            data: { status: 'AVAILABLE' },
          })
        }

        return NextResponse.json({
          success: true,
          ordersReturned: ordersToReturn,
          reason: reason || 'picker_cancelled',
        })
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (error) {
    console.error('Failed to process picking action:', error)
    return NextResponse.json({ error: 'Failed to process picking action' }, { status: 500 })
  }
}
