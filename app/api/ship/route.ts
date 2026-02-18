import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createLabel, fulfillPrepurchasedLabel } from '@/lib/label-service'

// GET - Get cart/chunk ready for shipping
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const cartId = searchParams.get('cartId')
    const cartName = searchParams.get('cartName')
    const action = searchParams.get('action')

    if (action === 'ready-carts') {
      const includeActive = searchParams.get('includeActive') === 'true'

      // Get carts that are picked and ready for shipping
      // Include PICKED (normal) and READY_FOR_SHIPPING (post-engraving personalized)
      const carts = await prisma.pickCart.findMany({
        where: {
          status: includeActive ? { in: ['PICKED_READY', 'SHIPPING'] } : 'PICKED_READY',
          active: true,
        },
        include: {
          chunks: {
            where: {
              status: { in: ['PICKED', 'READY_FOR_SHIPPING', 'SHIPPING'] },
            },
            include: {
              batch: true,
              orders: {
                orderBy: { binNumber: 'asc' },
              },
              bulkBatchAssignments: {
                include: {
                  bulkBatch: true,
                },
              },
            },
          },
        },
        orderBy: { name: 'asc' },
      })

      // For SHIPPING carts, attach progress info (shipper name, start time, shipped count)
      const cartsWithInfo = carts.map(cart => {
        const totalOrders = cart.chunks.reduce((sum, chunk) => sum + chunk.orders.length, 0)
        const shippedCount = cart.chunks.reduce((sum, chunk) =>
          sum + chunk.orders.filter(o => o.status === 'SHIPPED').length, 0)
        const shippingChunk = cart.status === 'SHIPPING'
          ? cart.chunks.find(c => c.status === 'SHIPPING')
          : null

        return {
          ...cart,
          chunkCount: cart.chunks.length,
          orderCount: totalOrders,
          ...(cart.status === 'SHIPPING' && shippingChunk ? {
            shippingInfo: {
              shipperName: shippingChunk.shipperName,
              shippingStartedAt: shippingChunk.shippingStartedAt,
              ordersShipped: shippedCount,
              ordersTotal: totalOrders,
            },
          } : {}),
        }
      })

      return NextResponse.json({ carts: cartsWithInfo })
    }

    // Get cart by ID or name
    let cart: any = null
    const chunkInclude = {
      where: {
        status: { in: ['PICKED', 'READY_FOR_SHIPPING', 'SHIPPING'] as any },
      },
      include: {
        batch: true,
        orders: {
          orderBy: { binNumber: 'asc' as const },
        },
        bulkBatchAssignments: {
          include: {
            bulkBatch: true,
          },
        },
      },
    }
    if (cartId) {
      cart = await prisma.pickCart.findUnique({
        where: { id: cartId },
        include: { chunks: chunkInclude },
      })
    } else if (cartName) {
      cart = await prisma.pickCart.findFirst({
        where: { 
          name: { equals: cartName, mode: 'insensitive' },
        },
        include: { chunks: chunkInclude },
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
              where: { status: { in: ['PICKED', 'READY_FOR_SHIPPING'] } },
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

        // Update chunk(s) status (both PICKED and READY_FOR_SHIPPING -> SHIPPING)
        await prisma.pickChunk.updateMany({
          where: {
            cartId,
            status: { in: ['PICKED', 'READY_FOR_SHIPPING'] },
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
        const { chunkId, orderNumber, printerId, locationId, userName } = body

        if (!chunkId || !orderNumber) {
          return NextResponse.json({ 
            error: 'Chunk ID and Order Number are required' 
          }, { status: 400 })
        }

        const order = await prisma.orderLog.findFirst({
          where: { orderNumber },
        })

        if (!order) {
          return NextResponse.json({ error: 'Order not found' }, { status: 404 })
        }

        let labelResult: any = { success: true }

        if (order.labelPrepurchased && order.labelUrl) {
          // Label already bought at pick-complete — just print + NetSuite
          labelResult = await fulfillPrepurchasedLabel({
            orderId: order.id,
            printerId: printerId ? Number(printerId) : undefined,
            userName: userName || 'Scan Station',
          })
        } else if (order.status === 'AWAITING_SHIPMENT') {
          // No pre-purchased label — full label creation flow
          const shipFromId = locationId || (await prisma.location.findFirst({
            where: { isDefault: true, active: true },
            select: { id: true },
          }))?.id

          if (!shipFromId) {
            return NextResponse.json({ error: 'No ship-from location configured' }, { status: 500 })
          }

          labelResult = await createLabel({
            orderId: order.id,
            locationId: shipFromId,
            printerId: printerId ? Number(printerId) : undefined,
            userName: userName || 'Scan Station',
          })

          if (!labelResult.success) {
            return NextResponse.json({ error: labelResult.error || 'Label creation failed' }, { status: 500 })
          }
        }
        // If already SHIPPED and not prepurchased, just update the chunk count

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

        return NextResponse.json({
          success: true,
          labelPrepurchased: order.labelPrepurchased,
          trackingNumber: order.trackingNumber || labelResult.trackingNumber,
          printStatus: labelResult.printStatus,
          netsuiteUpdated: labelResult.netsuiteUpdated,
        })
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
            status: { in: ['PICKED', 'READY_FOR_SHIPPING', 'SHIPPING'] },
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

      case 'release-shipping-cart': {
        // Admin action: release a stuck SHIPPING cart
        // Keeps already-shipped orders, returns unshipped orders to queue
        const { cartId: releaseCartId, reason: releaseReason } = body

        if (!releaseCartId) {
          return NextResponse.json({ error: 'Cart ID is required' }, { status: 400 })
        }

        const releaseCart = await prisma.pickCart.findUnique({
          where: { id: releaseCartId },
          include: {
            chunks: {
              where: { status: 'SHIPPING' },
              include: { orders: true },
            },
          },
        })

        if (!releaseCart) {
          return NextResponse.json({ error: 'Cart not found' }, { status: 404 })
        }

        if (releaseCart.status !== 'SHIPPING') {
          return NextResponse.json({ error: 'Cart is not in SHIPPING status' }, { status: 400 })
        }

        let totalOrdersReturned = 0
        let totalOrdersKept = 0
        let shipperName: string | null = null

        for (const chunk of releaseCart.chunks) {
          if (!shipperName && chunk.shipperName) {
            shipperName = chunk.shipperName
          }

          const unshippedOrders = chunk.orders.filter(o => o.status !== 'SHIPPED')
          const shippedOrders = chunk.orders.filter(o => o.status === 'SHIPPED')
          totalOrdersReturned += unshippedOrders.length
          totalOrdersKept += shippedOrders.length

          // Return unshipped orders to the batch queue
          if (unshippedOrders.length > 0) {
            await prisma.orderLog.updateMany({
              where: { id: { in: unshippedOrders.map(o => o.id) } },
              data: { chunkId: null, binNumber: null },
            })
          }

          // Mark chunk as completed (partial ship)
          await prisma.pickChunk.update({
            where: { id: chunk.id },
            data: {
              status: 'COMPLETED',
              shippingCompletedAt: new Date(),
              ordersSkipped: unshippedOrders.length,
              shipDurationSeconds: chunk.shippingStartedAt
                ? Math.round((Date.now() - new Date(chunk.shippingStartedAt).getTime()) / 1000)
                : null,
            },
          })

          // Update batch shipped count
          const batch = await prisma.pickBatch.findUnique({
            where: { id: chunk.batchId },
            include: { orders: { where: { status: 'SHIPPED' } } },
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

        // Release the cart
        await prisma.pickCart.update({
          where: { id: releaseCartId },
          data: { status: 'AVAILABLE' },
        })

        return NextResponse.json({
          success: true,
          ordersReturned: totalOrdersReturned,
          ordersKept: totalOrdersKept,
          shipperName,
          reason: releaseReason || 'admin_release',
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
