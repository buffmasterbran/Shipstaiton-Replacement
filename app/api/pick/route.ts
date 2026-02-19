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
      const includeActive = searchParams.get('includeActive') === 'true'

      // Get available carts
      const carts = await prisma.pickCart.findMany({
        where: {
          active: true,
          status: includeActive ? { in: ['AVAILABLE', 'PICKING'] } : 'AVAILABLE',
        },
        orderBy: { name: 'asc' },
      })

      // For PICKING carts, attach the active chunk info (picker name, start time)
      if (includeActive) {
        const pickingCartIds = carts.filter(c => c.status === 'PICKING').map(c => c.id)
        if (pickingCartIds.length > 0) {
          const activeChunks = await prisma.pickChunk.findMany({
            where: {
              cartId: { in: pickingCartIds },
              status: 'PICKING',
            },
            select: {
              cartId: true,
              pickerName: true,
              claimedAt: true,
              ordersInChunk: true,
            },
          })
          const chunkByCart = new Map(activeChunks.map(c => [c.cartId, c]))
          const cartsWithInfo = carts.map(cart => {
            if (cart.status === 'PICKING') {
              const chunk = chunkByCart.get(cart.id)
              return {
                ...cart,
                activeChunk: chunk ? {
                  pickerName: chunk.pickerName,
                  claimedAt: chunk.claimedAt,
                  ordersInChunk: chunk.ordersInChunk,
                } : null,
              }
            }
            return cart
          })
          return NextResponse.json({ carts: cartsWithInfo })
        }
      }

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

    // Personalized order count (for picker UI)
    if (action === 'personalized-count') {
      const count = await prisma.orderLog.count({
        where: {
          status: 'AWAITING_SHIPMENT',
          chunkId: null,
          batch: {
            isPersonalized: true,
            cellAssignments: { none: {} },
            status: { in: ['ACTIVE', 'IN_PROGRESS', 'RELEASED'] },
          },
        },
      })
      return NextResponse.json({ availableOrderCount: count })
    }

    // Engraving queue: carts in ENGRAVING status with their chunks and orders
    if (action === 'engraving-queue') {
      const carts = await prisma.pickCart.findMany({
        where: { status: 'ENGRAVING' },
        include: {
          chunks: {
            where: { status: 'READY_FOR_ENGRAVING' },
            include: {
              batch: { select: { id: true, name: true, type: true } },
              orders: {
                where: { status: 'AWAITING_SHIPMENT' },
                select: {
                  id: true,
                  orderNumber: true,
                  binNumber: true,
                  rawPayload: true,
                },
                orderBy: { binNumber: 'asc' },
              },
            },
          },
        },
        orderBy: { name: 'asc' },
      })

      // Compute personalized item counts per cart for the queue display
      const cartsWithCounts = carts.map(cart => {
        const chunk = cart.chunks[0]
        let personalizedItemCount = 0
        let totalBins = 0
        if (chunk) {
          const binsSeen = new Set<number>()
          for (const order of chunk.orders) {
            if (order.binNumber) binsSeen.add(order.binNumber)
            const payload = Array.isArray(order.rawPayload) ? (order.rawPayload as any[])[0] : order.rawPayload
            const items = (payload as any)?.items || []
            for (const item of items) {
              const sku = (item.sku || '').toUpperCase()
              // TEMPORARY FALLBACK: orders ingested before 2/19/2026 don't have custcol_customization_barcode.
              // Once all old orders are shipped, remove the SKU fallback and keep only the barcode check.
              if (item.custcol_customization_barcode || sku.endsWith('-PERS')) {
                personalizedItemCount += (item.quantity || 1)
              }
            }
          }
          totalBins = binsSeen.size
        }
        return {
          ...cart,
          personalizedItemCount,
          totalBins,
          chunk: chunk ? {
            ...chunk,
            engraverName: (chunk as any).engraverName,
            engravingProgress: (chunk as any).engravingProgress,
          } : null,
        }
      })

      return NextResponse.json({ carts: cartsWithCounts })
    }

    if (!cellId) {
      return NextResponse.json({ error: 'Cell ID is required' }, { status: 400 })
    }

    // Get batches assigned to this cell via BatchCellAssignment, ordered by assignment priority
    const cellAssignments = await prisma.batchCellAssignment.findMany({
      where: { cellId },
      orderBy: { priority: 'asc' },
      include: {
        batch: {
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
        },
      },
    })

    // Filter to only active/in-progress batches
    const releasedBatches = cellAssignments
      .map(a => a.batch)
      .filter(b => ['ACTIVE', 'IN_PROGRESS', 'RELEASED'].includes(b.status))

    // Calculate available orders to pick
    let availableOrderCount = 0
    releasedBatches.forEach(batch => {
      availableOrderCount += batch.orders.length
    })

    // Get batch IDs assigned to this cell
    const cellBatchIds = cellAssignments.map(a => a.batchId)

    // Get chunks that are ready for picking
    const availableChunks = await prisma.pickChunk.findMany({
      where: {
        status: 'AVAILABLE',
        batchId: { in: cellBatchIds },
        batch: {
          status: { in: ['ACTIVE', 'IN_PROGRESS', 'RELEASED'] },
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
        const { cellId, cartId, pickerName, personalized } = body

        if (!cartId || !pickerName) {
          return NextResponse.json({ 
            error: 'Cart ID and Picker Name are required' 
          }, { status: 400 })
        }

        if (!personalized && !cellId) {
          return NextResponse.json({ 
            error: 'Cell ID is required for non-personalized picks' 
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

        let batch: any = null
        const findBatchStart = Date.now()

        if (personalized) {
          // Find next personalized batch from the pool (no cell assignment)
          batch = await prisma.pickBatch.findFirst({
          where: {
              isPersonalized: true,
              cellAssignments: { none: {} },
              status: { in: ['ACTIVE', 'IN_PROGRESS', 'RELEASED'] },
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
              },
            },
            orderBy: { priority: 'asc' },
          })
        } else {
          // Find the next batch via cell assignment priority
          const nextAssignment = await prisma.batchCellAssignment.findFirst({
            where: {
              cellId,
              batch: {
                status: { in: ['ACTIVE', 'IN_PROGRESS', 'RELEASED'] },
                orders: {
                  some: {
                    chunkId: null,
                    status: 'AWAITING_SHIPMENT',
                  },
              },
            },
          },
          orderBy: { priority: 'asc' },
            include: {
              batch: {
                include: {
                  orders: {
                    where: {
                      chunkId: null,
                      status: 'AWAITING_SHIPMENT',
                    },
                  },
                },
              },
            },
          })

          batch = nextAssignment?.batch ?? null
        }

        console.log(`[claim-chunk] Found batch in ${Date.now() - findBatchStart}ms: ${batch ? `"${batch.name}" (${batch.id}) with ${batch.orders.length} orders` : 'NONE'}`)

        if (!batch || batch.orders.length === 0) {
          return NextResponse.json({ 
            error: 'No orders available to pick in this cell' 
          }, { status: 404 })
        }

        // ============================================================
        // SINGLES: Group orders by SKU, 1 SKU per bin, max 24 per bin
        // OTHER: 1 order per bin, max 12 per chunk
        // ============================================================
        const isSingles = batch.type === 'SINGLES'
        const isBulk = batch.type === 'BULK'
        const isOversized = batch.name.startsWith('O-')
        const maxBins = isOversized ? 6 : 12
        const maxPerBin = 24
        const claimStart = Date.now()
        const mode = isSingles ? 'SINGLES' : isBulk ? 'BULK' : 'OBS'
        console.log(`[${mode} claim-chunk] START — batch "${batch.name}" (${batch.id}), ${batch.orders.length} available orders`)

        let ordersForChunk: typeof batch.orders
        let bulkBatchForChunk: any = null

        if (isSingles) {
          // Group available orders by SKU
          const skuGroups = new Map<string, typeof batch.orders>()
          for (const order of batch.orders) {
            const payload = order.rawPayload as any
            const orderData = Array.isArray(payload) ? payload[0] : payload
            const items = (orderData?.items || []).filter((item: any) => {
              const sku = (item.sku || '').toUpperCase()
              const name = (item.name || '').toUpperCase()
              return !sku.includes('INSURANCE') && !sku.includes('SHIPPING') && !name.includes('INSURANCE')
            })
            const sku = (items[0]?.sku || 'UNKNOWN').toUpperCase()
            if (!skuGroups.has(sku)) skuGroups.set(sku, [])
            skuGroups.get(sku)!.push(order)
          }

          // Take up to maxBins SKU groups, each capped at maxPerBin orders
          ordersForChunk = []
          let binCount = 0
          for (const [sku, group] of Array.from(skuGroups.entries())) {
            if (binCount >= maxBins) break
            const take = group.slice(0, maxPerBin)
            ordersForChunk.push(...take)
            binCount++
          }
          console.log(`[SINGLES claim-chunk] Grouped into ${binCount} bins, ${ordersForChunk.length} orders selected (${Date.now() - claimStart}ms)`)
        } else if (isBulk) {
          // BULK: Grab up to 3 BulkBatches (one per shelf) from the same parent batch
          console.log('[BULK claim-chunk] Looking for PENDING BulkBatches under parentBatchId:', batch.id)

          const pendingBulkBatches = await prisma.bulkBatch.findMany({
            where: {
              parentBatchId: batch.id,
              status: 'PENDING',
            },
            orderBy: { splitIndex: 'asc' },
            take: 3,
          })

          console.log('[BULK claim-chunk] Found', pendingBulkBatches.length, 'pending BulkBatches:', pendingBulkBatches.map(bb => ({
            id: bb.id,
            splitIndex: bb.splitIndex,
            orderCount: bb.orderCount,
            status: bb.status,
            skuLayout: bb.skuLayout,
          })))

          if (pendingBulkBatches.length === 0) {
            return NextResponse.json({ error: 'No bulk batches available to pick' }, { status: 404 })
          }

          // Get orders for ALL claimed BulkBatches
          const bulkBatchIds = pendingBulkBatches.map(bb => bb.id)
          const bulkOrders = await prisma.orderLog.findMany({
            where: {
              bulkBatchId: { in: bulkBatchIds },
              status: 'AWAITING_SHIPMENT',
              chunkId: null,
            },
          })

          console.log('[BULK claim-chunk] Found', bulkOrders.length, 'orders across BulkBatches. Breakdown:', bulkBatchIds.map(id => ({
            bulkBatchId: id,
            orderCount: bulkOrders.filter(o => o.bulkBatchId === id).length,
          })))

          if (bulkOrders.length === 0) {
            return NextResponse.json({ error: 'No orders available in bulk batches' }, { status: 404 })
          }

          ordersForChunk = bulkOrders
          bulkBatchForChunk = pendingBulkBatches // Now an array of up to 3
        } else {
          // Standard: 1 order per bin (OBS / Personalized)
          ordersForChunk = batch.orders.slice(0, maxBins)
        }

        console.log(`[${mode} claim-chunk] Orders selected: ${ordersForChunk.length} (${Date.now() - claimStart}ms)`)

        // Get the next chunk number for this batch
        const maxChunk = await prisma.pickChunk.aggregate({
          where: { batchId: batch.id },
          _max: { chunkNumber: true },
        })
        const chunkNumber = (maxChunk._max.chunkNumber ?? 0) + 1

        // Create the chunk
        const pickingModeValue = isSingles ? 'SINGLES' : isBulk ? 'BULK' : 'ORDER_BY_SIZE'
        const chunk = await prisma.pickChunk.create({
          data: {
            batchId: batch.id,
            chunkNumber,
            status: 'PICKING',
            pickingMode: pickingModeValue as any,
            isPersonalized: personalized || false,
            cartId,
            pickerName,
            ordersInChunk: ordersForChunk.length,
            claimedAt: new Date(),
            pickingStartedAt: new Date(),
          },
        })

        console.log(`[${mode} claim-chunk] Chunk ${chunk.id} created (${Date.now() - claimStart}ms)`)

        // Assign orders to the chunk with bin numbers
        if (isSingles) {
          // SINGLES: group by SKU, all orders with same SKU get the same bin number
          // Step 1: Extract unique SKUs from orders
          const orderSkuMap = new Map<string, string>() // orderId -> SKU
          const uniqueSkus = new Set<string>()
          for (const order of ordersForChunk) {
            const payload = order.rawPayload as any
            const orderData = Array.isArray(payload) ? payload[0] : payload
            const items = (orderData?.items || []).filter((item: any) => {
              const sku = (item.sku || '').toUpperCase()
              const name = (item.name || '').toUpperCase()
              return !sku.includes('INSURANCE') && !sku.includes('SHIPPING') && !name.includes('INSURANCE')
            })
            const sku = (items[0]?.sku || 'UNKNOWN').toUpperCase()
            orderSkuMap.set(order.id, sku)
            uniqueSkus.add(sku)
          }

          console.log(`[SINGLES claim-chunk] Extracted ${uniqueSkus.size} unique SKUs from ${ordersForChunk.length} orders (${Date.now() - claimStart}ms)`)

          // Step 2: Batch fetch ALL bin locations in one query
          const skuRecords = await prisma.productSku.findMany({
            where: { sku: { in: Array.from(uniqueSkus) } },
            select: { sku: true, binLocation: true },
          })
          const binLocationMap = new Map<string, string>()
          for (const rec of skuRecords) {
            if (rec.binLocation) binLocationMap.set(rec.sku.toUpperCase(), rec.binLocation)
          }
          console.log(`[SINGLES claim-chunk] Fetched ${skuRecords.length} bin locations (${Date.now() - claimStart}ms)`)

          // Step 3: Group orders by SKU with pre-fetched locations
          const skuBinGroups = new Map<string, { orders: typeof ordersForChunk; binLocation: string }>()
          for (const order of ordersForChunk) {
            const sku = orderSkuMap.get(order.id)!
            if (!skuBinGroups.has(sku)) {
              skuBinGroups.set(sku, { orders: [], binLocation: binLocationMap.get(sku) || 'ZZZ' })
            }
            skuBinGroups.get(sku)!.orders.push(order)
          }

          // Sort SKU groups by bin location for efficient picking
          const sortedGroups = Array.from(skuBinGroups.entries())
            .sort((a, b) => a[1].binLocation.localeCompare(b[1].binLocation))

          // Step 4: Batch update using updateMany per bin (1 SQL per bin instead of 1 per order)
          const singlesUpdates: any[] = []
          let binNumber = 1
          for (const [sku, group] of sortedGroups) {
            const orderIds = group.orders.map((o: any) => o.id)
            console.log(`[SINGLES claim-chunk]   Bin ${binNumber}: ${sku} (${orderIds.length} orders, loc: ${group.binLocation})`)
            singlesUpdates.push(
              prisma.orderLog.updateMany({
                where: { id: { in: orderIds } },
                data: { chunkId: chunk.id, binNumber },
              })
            )
            binNumber++
          }
          console.log(`[SINGLES claim-chunk] Running transaction: ${singlesUpdates.length} updateMany ops for ${ordersForChunk.length} orders (${Date.now() - claimStart}ms)`)
          await prisma.$transaction(singlesUpdates)
          console.log(`[SINGLES claim-chunk] Transaction complete (${Date.now() - claimStart}ms)`)
        } else if (isBulk) {
          // BULK: Assign orders shelf-by-shelf with sequential binNumbers
          // Shelf 1 orders first, then shelf 2, then shelf 3
          const bulkBatches = bulkBatchForChunk as any[] // Array of up to 3
          let globalBinNumber = 1
          const bulkTxOps: any[] = []

          console.log('[BULK assign] Assigning', bulkBatches.length, 'shelves to chunk', chunk.id)

          // Step 1: Set chunkId for ALL bulk orders at once
          const allBulkOrderIds = ordersForChunk.map((o: any) => o.id)
          await prisma.orderLog.updateMany({
            where: { id: { in: allBulkOrderIds } },
            data: { chunkId: chunk.id },
          })
          console.log(`[BULK assign] chunkId set for ${allBulkOrderIds.length} orders (${Date.now() - claimStart}ms)`)

          // Step 2: Build binNumber updates + shelf assignments
          for (let shelfIdx = 0; shelfIdx < bulkBatches.length; shelfIdx++) {
            const bb = bulkBatches[shelfIdx]
            const shelfOrders = ordersForChunk.filter((o: any) => o.bulkBatchId === bb.id)

            console.log(`[BULK assign] Shelf ${shelfIdx + 1}: BulkBatch ${bb.id}, ${shelfOrders.length} orders, skuLayout:`, bb.skuLayout)

            // Queue binNumber updates
            const startBin = globalBinNumber
            for (const order of shelfOrders) {
              bulkTxOps.push(
                prisma.orderLog.update({
                  where: { id: order.id },
                  data: { binNumber: globalBinNumber++ },
                })
              )
            }
            console.log(`[BULK assign] Shelf ${shelfIdx + 1}: assigned binNumbers ${startBin} to ${globalBinNumber - 1}`)

            // Queue chunk-to-bulkbatch link
            bulkTxOps.push(
              prisma.chunkBulkBatchAssignment.create({
                data: { chunkId: chunk.id, bulkBatchId: bb.id, shelfNumber: shelfIdx + 1 },
              })
            )

            // Queue bulk batch status update
            bulkTxOps.push(
              prisma.bulkBatch.update({
                where: { id: bb.id },
                data: { status: 'ASSIGNED' },
              })
            )
          }

          // Execute binNumber + shelf assignments in a single transaction
          console.log(`[BULK assign] Running transaction: ${bulkTxOps.length} ops (${Date.now() - claimStart}ms)`)
          await prisma.$transaction(bulkTxOps)
          console.log(`[BULK assign] Transaction complete (${Date.now() - claimStart}ms)`)
        } else {
          // STANDARD (OBS/Personalized): 1 order per bin, sorted by bin location
          // Step 1: Extract unique SKUs from all orders
          const obsSkus = new Set<string>()
          const obsOrderSkuMap = new Map<string, string>() // orderId -> SKU
          for (const order of ordersForChunk) {
            const payload = (order as any).rawPayload as any
            const orderData = Array.isArray(payload) ? payload[0] : payload
            const items = orderData?.items || []
            const firstItem = items.find((item: any) => {
              const sku = (item.sku || '').toUpperCase()
              const name = (item.name || '').toUpperCase()
              return !sku.includes('INSURANCE') && !sku.includes('SHIPPING') && !name.includes('INSURANCE')
            })
            const sku = firstItem?.sku?.toUpperCase() || ''
            obsOrderSkuMap.set(order.id, sku)
            if (sku) obsSkus.add(sku)
          }

          console.log(`[OBS claim-chunk] Extracted ${obsSkus.size} unique SKUs from ${ordersForChunk.length} orders (${Date.now() - claimStart}ms)`)

          // Step 2: Batch fetch all bin locations in one query
          const obsSkuRecords = await prisma.productSku.findMany({
            where: { sku: { in: Array.from(obsSkus) } },
            select: { sku: true, binLocation: true },
          })
          const obsBinLocMap = new Map<string, string>()
          for (const rec of obsSkuRecords) {
            if (rec.binLocation) obsBinLocMap.set(rec.sku.toUpperCase(), rec.binLocation)
          }
          console.log(`[OBS claim-chunk] Fetched ${obsSkuRecords.length} bin locations (${Date.now() - claimStart}ms)`)

          // Step 3: Sort orders by bin location
          const ordersWithBinLocation = ordersForChunk.map((order: any) => ({
            ...order,
            binLocation: obsBinLocMap.get(obsOrderSkuMap.get(order.id) || '') || 'ZZZ',
          }))
          ordersWithBinLocation.sort((a: any, b: any) => a.binLocation.localeCompare(b.binLocation))

          console.log(`[OBS claim-chunk] Sorted orders:`, ordersWithBinLocation.map((o: any, i: number) => `Bin ${i + 1}: ${o.orderNumber} (loc: ${o.binLocation})`))

          // Step 4: Set chunkId for all orders in one call, then assign binNumbers
          const allObsIds = ordersWithBinLocation.map((o: any) => o.id)
          console.log(`[OBS claim-chunk] Setting chunkId for ${allObsIds.length} orders (${Date.now() - claimStart}ms)`)
          await prisma.orderLog.updateMany({
            where: { id: { in: allObsIds } },
            data: { chunkId: chunk.id },
          })
          console.log(`[OBS claim-chunk] chunkId set (${Date.now() - claimStart}ms). Assigning binNumbers...`)

          // Each order needs a unique binNumber, so we need individual updates
          // But only updating binNumber (chunkId already set), still in a transaction
          const binUpdates = ordersWithBinLocation.map((order: any, i: number) =>
            prisma.orderLog.update({
              where: { id: order.id },
              data: { binNumber: i + 1 },
            })
          )
          console.log(`[OBS claim-chunk] Running transaction: ${binUpdates.length} binNumber updates (${Date.now() - claimStart}ms)`)
          await prisma.$transaction(binUpdates)
          console.log(`[OBS claim-chunk] Transaction complete (${Date.now() - claimStart}ms)`)
        }

        // Update cart status
        console.log(`[${mode} claim-chunk] Updating cart & batch status (${Date.now() - claimStart}ms)`)
        await prisma.pickCart.update({
          where: { id: cartId },
          data: { status: 'PICKING' },
        })

        // Update batch status if this is the first chunk
        if (batch.status === 'RELEASED' || batch.status === 'ACTIVE') {
          await prisma.pickBatch.update({
            where: { id: batch.id },
            data: { status: 'IN_PROGRESS' },
          })
        }

        // Fetch the complete chunk with orders
        console.log(`[${mode} claim-chunk] Fetching complete chunk (${Date.now() - claimStart}ms)`)
        const completeChunk = await prisma.pickChunk.findUnique({
          where: { id: chunk.id },
          include: {
            batch: true,
            cart: true,
            orders: {
              orderBy: { binNumber: 'asc' },
            },
            bulkBatchAssignments: {
              include: {
                bulkBatch: true,
              },
            },
          },
        })

        if (isBulk && completeChunk) {
          console.log('[BULK claim-chunk] Final chunk response:', JSON.stringify({
            chunkId: completeChunk.id,
            pickingMode: completeChunk.pickingMode,
            ordersInChunk: completeChunk.ordersInChunk,
            orderCount: completeChunk.orders.length,
            orders: completeChunk.orders.map(o => ({ id: o.id, orderNumber: o.orderNumber, binNumber: o.binNumber, bulkBatchId: o.bulkBatchId })),
            bulkBatchAssignments: completeChunk.bulkBatchAssignments.map(a => ({
              shelfNumber: a.shelfNumber,
              bulkBatchId: a.bulkBatchId,
              skuLayout: (a as any).bulkBatch?.skuLayout,
              orderCount: (a as any).bulkBatch?.orderCount,
            })),
          }, null, 2))
        }

        console.log(`[${mode} claim-chunk] DONE — ${ordersForChunk.length} orders, total time: ${Date.now() - claimStart}ms`)
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

        // Determine post-pick status based on personalization
        const isPersonalized = chunk.isPersonalized || false
        const postPickStatus = isPersonalized ? 'READY_FOR_ENGRAVING' : 'PICKED'

        // Update chunk status
        await prisma.pickChunk.update({
          where: { id: chunkId },
          data: {
            status: postPickStatus,
            pickingCompletedAt: new Date(),
            pickDurationSeconds: pickDuration,
          },
        })

        // Update cart status
        if (chunk.cartId) {
          await prisma.pickCart.update({
            where: { id: chunk.cartId },
            data: { status: isPersonalized ? 'ENGRAVING' : 'PICKED_READY' },
          })
        }

        // Fire async label pre-purchase for non-personalized chunks
        if (!isPersonalized) {
          const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
            || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
          console.log(`[Pick → Prepurchase] Chunk ${chunkId} complete (${chunk.ordersInChunk} orders, picker: ${chunk.pickerName}, cart: ${chunk.cart?.name || chunk.cartId})`)
          console.log(`[Pick → Prepurchase] Firing POST ${baseUrl}/api/orders/prepurchase-chunk-labels { chunkId: "${chunkId}" }`)
          fetch(`${baseUrl}/api/orders/prepurchase-chunk-labels`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chunkId }),
          })
            .then(async (res) => {
              const data = await res.json().catch(() => null)
              if (res.ok) {
                console.log(`[Pick → Prepurchase] Response OK: ${data?.succeeded}/${data?.total} labels purchased, ${data?.failed} failed`)
                if (data?.errors?.length > 0) {
                  console.log(`[Pick → Prepurchase] Failures:`, data.errors.map((e: any) => `#${e.orderNumber}: ${e.error}`).join(' | '))
                }
              } else {
                console.error(`[Pick → Prepurchase] Response FAILED (${res.status}):`, data?.error || data)
              }
            })
            .catch(err => console.error('[Pick → Prepurchase] Network error:', err.message))
        } else {
          console.log(`[Pick] Chunk ${chunkId} complete — personalized, skipping label pre-purchase`)
        }

        return NextResponse.json({
          success: true,
          pickDurationSeconds: pickDuration,
          isPersonalized,
          nextStep: isPersonalized ? 'engraving' : 'shipping',
        })
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

      // Start engraving: claim a cart and record engraver info
      case 'start-engraving': {
        const { cartId, engraverName } = body
        if (!cartId || !engraverName) {
          return NextResponse.json({ error: 'cartId and engraverName required' }, { status: 400 })
        }

        const cart = await prisma.pickCart.findUnique({
          where: { id: cartId },
          include: {
            chunks: {
              where: { status: 'READY_FOR_ENGRAVING' },
              include: {
                batch: { select: { id: true, name: true, type: true } },
                orders: {
                  where: { status: 'AWAITING_SHIPMENT' },
                  select: {
                    id: true,
                    orderNumber: true,
                    binNumber: true,
                    rawPayload: true,
                  },
                  orderBy: { binNumber: 'asc' },
                },
              },
            },
          },
        })

        if (!cart || cart.status !== 'ENGRAVING') {
          return NextResponse.json({ error: 'Cart not found or not in engraving status' }, { status: 400 })
        }

        const chunk = cart.chunks[0]
        if (!chunk) {
          return NextResponse.json({ error: 'No chunk ready for engraving on this cart' }, { status: 400 })
        }

        // Record engraver and start time on the chunk
        await prisma.pickChunk.update({
          where: { id: chunk.id },
          data: {
            engraverName,
            engravingStartedAt: new Date(),
            engravingProgress: { completedItems: [], currentIndex: 0, totalPausedMs: 0 },
          },
        })

        return NextResponse.json({
          success: true,
          cart: {
            ...cart,
            chunks: [{ ...chunk, engraverName, engravingStartedAt: new Date() }],
          },
        })
      }

      // Persist individual item completion for crash recovery
      case 'mark-engraved-item': {
        const { chunkId, itemIndex, totalPausedMs } = body
        if (!chunkId || itemIndex === undefined) {
          return NextResponse.json({ error: 'chunkId and itemIndex required' }, { status: 400 })
        }

        const chunk = await prisma.pickChunk.findUnique({
          where: { id: chunkId },
          select: { engravingProgress: true, itemsEngraved: true },
        })
        if (!chunk) {
          return NextResponse.json({ error: 'Chunk not found' }, { status: 404 })
        }

        const progress = (chunk.engravingProgress as any) || { completedItems: [], currentIndex: 0, totalPausedMs: 0 }
        if (!progress.completedItems.includes(itemIndex)) {
          progress.completedItems.push(itemIndex)
        }
        progress.currentIndex = itemIndex + 1
        if (totalPausedMs !== undefined) {
          progress.totalPausedMs = totalPausedMs
        }

        await prisma.pickChunk.update({
          where: { id: chunkId },
          data: {
            engravingProgress: progress,
            itemsEngraved: progress.completedItems.length,
          },
        })

        return NextResponse.json({ success: true, progress })
      }

      // Mark a single order as engraved (called when all personalized items in order are done)
      case 'mark-engraved': {
        const { chunkId, orderNumber } = body
        if (!chunkId || !orderNumber) {
          return NextResponse.json({ error: 'chunkId and orderNumber required' }, { status: 400 })
        }

        // Order stays AWAITING_SHIPMENT — engraving progress tracked on the chunk
        // Just increment the batch counter below

        const chunk = await prisma.pickChunk.findUnique({
          where: { id: chunkId },
          select: { batchId: true },
        })
        if (chunk?.batchId) {
          await prisma.pickBatch.update({
            where: { id: chunk.batchId },
            data: { engravedOrders: { increment: 1 } },
          })
        }

        return NextResponse.json({ success: true })
      }

      // Complete engraving for a chunk - move to READY_FOR_SHIPPING
      case 'complete-engraving': {
        const { chunkId, engravingDurationSeconds, engravingPausedSeconds, itemsEngraved } = body
        if (!chunkId) {
          return NextResponse.json({ error: 'chunkId required' }, { status: 400 })
        }

        const engravingChunk = await prisma.pickChunk.findUnique({
          where: { id: chunkId },
          select: { cartId: true, engravingStartedAt: true },
        })

        const serverDuration = engravingChunk?.engravingStartedAt
          ? Math.round((Date.now() - new Date(engravingChunk.engravingStartedAt).getTime()) / 1000)
          : null

        await prisma.pickChunk.update({
          where: { id: chunkId },
          data: {
            status: 'READY_FOR_SHIPPING',
            engravingCompletedAt: new Date(),
            engravingDurationSeconds: engravingDurationSeconds ?? serverDuration,
            engravingPausedSeconds: engravingPausedSeconds ?? 0,
            itemsEngraved: itemsEngraved ?? 0,
          },
        })

        if (engravingChunk?.cartId) {
          await prisma.pickCart.update({
            where: { id: engravingChunk.cartId },
            data: { status: 'PICKED_READY' },
          })
        }

        return NextResponse.json({ success: true })
      }

      // Cancel engraving - only allowed if no items have been engraved yet
      case 'cancel-engraving': {
        const { chunkId } = body
        if (!chunkId) {
          return NextResponse.json({ error: 'chunkId required' }, { status: 400 })
        }

        const chunk = await prisma.pickChunk.findUnique({
          where: { id: chunkId },
          select: { itemsEngraved: true, cartId: true },
        })
        if (!chunk) {
          return NextResponse.json({ error: 'Chunk not found' }, { status: 404 })
        }
        if (chunk.itemsEngraved > 0) {
          return NextResponse.json({ error: 'Cannot cancel after engraving has started' }, { status: 400 })
        }

        await prisma.pickChunk.update({
          where: { id: chunkId },
          data: {
            engraverName: null,
            engraverId: null,
            engravingStartedAt: null,
            engravingProgress: null,
          },
        })

        return NextResponse.json({ success: true })
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (error) {
    console.error('Failed to process picking action:', error)
    return NextResponse.json({ error: 'Failed to process picking action' }, { status: 500 })
  }
}
