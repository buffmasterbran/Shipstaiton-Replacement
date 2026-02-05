import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET - Get cart/chunk ready for shipping
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const cartId = searchParams.get('cartId')
    const cartName = searchParams.get('cartName')
    const action = searchParams.get('action')

    if (action === 'ready-carts') {
      // Get carts that are picked and ready for shipping
      const carts = await prisma.pickCart.findMany({
        where: {
          status: 'PICKED_READY',
          active: true,
        },
        include: {
          chunks: {
            where: {
              status: 'PICKED',
            },
            include: {
              batch: true,
              orders: {
                orderBy: { binNumber: 'asc' },
              },
            },
          },
        },
        orderBy: { name: 'asc' },
      })

      return NextResponse.json({ 
        carts: carts.map(cart => ({
          ...cart,
          chunkCount: cart.chunks.length,
          orderCount: cart.chunks.reduce((sum, chunk) => sum + chunk.orders.length, 0),
        }))
      })
    }

    // Get cart by ID or name
    let cart
    if (cartId) {
      cart = await prisma.pickCart.findUnique({
        where: { id: cartId },
        include: {
          chunks: {
            where: {
              status: { in: ['PICKED', 'SHIPPING'] },
            },
            include: {
              batch: true,
              orders: {
                orderBy: { binNumber: 'asc' },
              },
            },
          },
        },
      })
    } else if (cartName) {
      cart = await prisma.pickCart.findFirst({
        where: { 
          name: { equals: cartName, mode: 'insensitive' },
        },
        include: {
          chunks: {
            where: {
              status: { in: ['PICKED', 'SHIPPING'] },
            },
            include: {
              batch: true,
              orders: {
                orderBy: { binNumber: 'asc' },
              },
            },
          },
        },
      })
    }

    if (!cart) {
      return NextResponse.json({ error: 'Cart not found' }, { status: 404 })
    }

    if (cart.chunks.length === 0) {
      return NextResponse.json({ 
        error: 'This cart has no orders ready for shipping' 
      }, { status: 400 })
    }

    return NextResponse.json({ cart })
  } catch (error) {
    console.error('Failed to fetch cart:', error)
    return NextResponse.json({ error: 'Failed to fetch cart' }, { status: 500 })
  }
}

// POST - Shipping actions
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action } = body

    switch (action) {
      case 'start-shipping': {
        // Start shipping a cart
        const { cartId, shipperName } = body

        if (!cartId || !shipperName) {
          return NextResponse.json({ 
            error: 'Cart ID and Shipper Name are required' 
          }, { status: 400 })
        }

        const cart = await prisma.pickCart.findUnique({
          where: { id: cartId },
          include: {
            chunks: {
              where: { status: 'PICKED' },
            },
          },
        })

        if (!cart) {
          return NextResponse.json({ error: 'Cart not found' }, { status: 404 })
        }

        if (cart.chunks.length === 0) {
          return NextResponse.json({ 
            error: 'No chunks ready for shipping on this cart' 
          }, { status: 400 })
        }

        // Update cart status
        await prisma.pickCart.update({
          where: { id: cartId },
          data: { status: 'SHIPPING' },
        })

        // Update chunk(s) status
        await prisma.pickChunk.updateMany({
          where: {
            cartId,
            status: 'PICKED',
          },
          data: {
            status: 'SHIPPING',
            shipperName,
            shippingStartedAt: new Date(),
          },
        })

        return NextResponse.json({ success: true })
      }

      case 'verify-item': {
        // Verify a scanned item barcode
        const { chunkId, orderNumber, scannedBarcode, scannedSku } = body

        if (!chunkId || !orderNumber) {
          return NextResponse.json({ 
            error: 'Chunk ID and Order Number are required' 
          }, { status: 400 })
        }

        // Get the order
        const order = await prisma.orderLog.findFirst({
          where: {
            orderNumber,
            chunkId,
          },
        })

        if (!order) {
          return NextResponse.json({ error: 'Order not found in chunk' }, { status: 404 })
        }

        // Parse items from order
        const payload = order.rawPayload as any
        const orderData = Array.isArray(payload) ? payload[0] : payload
        const items = orderData?.items || []

        // Look for matching item
        const matchedItem = items.find((item: any) => {
          const sku = (item.sku || '').toUpperCase()
          // Skip insurance items
          if (sku.includes('INSURANCE') || sku.includes('SHIPPING')) return false
          
          // Check if scanned value matches SKU or barcode
          if (scannedSku && sku === scannedSku.toUpperCase()) return true
          if (scannedBarcode) {
            // Look up barcode in product_skus
            // For now, just check if it matches the SKU
            return sku === scannedBarcode.toUpperCase()
          }
          return false
        })

        if (!matchedItem) {
          return NextResponse.json({ 
            valid: false,
            message: 'Not in this order',
          })
        }

        return NextResponse.json({ 
          valid: true,
          item: {
            sku: matchedItem.sku,
            name: matchedItem.name,
            quantity: matchedItem.quantity,
          },
        })
      }

      case 'complete-order': {
        // Mark order as shipped (after label printed)
        const { chunkId, orderNumber, trackingNumber, labelUrl, labelCost, carrier } = body

        if (!chunkId || !orderNumber) {
          return NextResponse.json({ 
            error: 'Chunk ID and Order Number are required' 
          }, { status: 400 })
        }

        // Update the order
        await prisma.orderLog.update({
          where: { 
            orderNumber,
          },
          data: {
            status: 'SHIPPED',
            trackingNumber,
            labelUrl,
            labelCost,
            carrier,
            shippedAt: new Date(),
          },
        })

        // Update chunk shipped count
        const chunk = await prisma.pickChunk.findUnique({
          where: { id: chunkId },
        })

        if (chunk) {
          await prisma.pickChunk.update({
            where: { id: chunkId },
            data: {
              ordersShipped: (chunk.ordersShipped || 0) + 1,
            },
          })
        }

        return NextResponse.json({ success: true })
      }

      case 'complete-cart': {
        // Complete shipping for the entire cart
        const { cartId, chunkId } = body

        if (!cartId) {
          return NextResponse.json({ error: 'Cart ID is required' }, { status: 400 })
        }

        // Get the chunk to calculate duration
        const chunk = chunkId ? await prisma.pickChunk.findUnique({
          where: { id: chunkId },
        }) : null

        // Calculate ship duration
        const shipDuration = chunk?.shippingStartedAt
          ? Math.round((Date.now() - new Date(chunk.shippingStartedAt).getTime()) / 1000)
          : null

        // Update chunk status
        if (chunkId) {
          await prisma.pickChunk.update({
            where: { id: chunkId },
            data: {
              status: 'COMPLETED',
              shippingCompletedAt: new Date(),
              shipDurationSeconds: shipDuration,
            },
          })
        }

        // Update batch progress
        if (chunk) {
          const batch = await prisma.pickBatch.findUnique({
            where: { id: chunk.batchId },
            include: {
              orders: {
                where: { status: 'SHIPPED' },
              },
            },
          })

          if (batch) {
            const shippedCount = batch.orders.length
            await prisma.pickBatch.update({
              where: { id: batch.id },
              data: {
                shippedOrders: shippedCount,
                status: shippedCount >= batch.totalOrders ? 'COMPLETED' : batch.status,
                completedAt: shippedCount >= batch.totalOrders ? new Date() : batch.completedAt,
              },
            })
          }
        }

        // Check if cart has more chunks to ship
        const remainingChunks = await prisma.pickChunk.count({
          where: {
            cartId,
            status: { in: ['PICKED', 'SHIPPING'] },
          },
        })

        if (remainingChunks === 0) {
          // Cart is done, make it available again
          await prisma.pickCart.update({
            where: { id: cartId },
            data: { status: 'AVAILABLE' },
          })
        }

        return NextResponse.json({ 
          success: true,
          shipDurationSeconds: shipDuration,
          cartComplete: remainingChunks === 0,
        })
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (error) {
    console.error('Failed to process shipping action:', error)
    return NextResponse.json({ error: 'Failed to process shipping action' }, { status: 500 })
  }
}
