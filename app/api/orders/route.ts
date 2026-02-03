import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getBoxes, getFeedbackRules, getPackingEfficiency, findBestBox } from '@/lib/box-config'
import { getProductSizes, matchSkuToSize, ProductSize } from '@/lib/products'

/** GET /api/orders - Return all orders with box suggestions (cached client-side) */
export async function GET() {
  try {
    const orders = await prisma.orderLog.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        rawPayload: true,
        customerReachedOut: true,
        suggestedBox: true,
        // Rate shopping fields
        orderType: true,
        shippedWeight: true,
        preShoppedRate: true,
        rateFetchedAt: true,
        rateShopStatus: true,
        rateShopError: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    // Load box config data for calculating suggestions
    const [sizes, boxes, feedbackRules, packingEfficiency] = await Promise.all([
      getProductSizes(prisma),
      getBoxes(prisma),
      getFeedbackRules(prisma),
      getPackingEfficiency(prisma),
    ])

    // Calculate box suggestions for orders that don't have one
    const ordersWithBoxes = await Promise.all(
      orders.map(async (order) => {
        // If already has a valid suggestedBox, keep it
        if (order.suggestedBox && typeof order.suggestedBox === 'object') {
          const box = order.suggestedBox as { boxId?: string; boxName?: string; confidence?: string }
          if (box.confidence) {
            return order
          }
        }

        // Calculate box suggestion on the fly
        const items = (order.rawPayload as any)?.items || []
        const suggestedBox = await calculateBoxSuggestionForItems(items, sizes, boxes, feedbackRules, packingEfficiency)

        return { ...order, suggestedBox }
      })
    )

    return NextResponse.json({ orders: ordersWithBoxes })
  } catch (error: unknown) {
    console.error('Error fetching orders:', error)
    return NextResponse.json(
      { error: 'Failed to fetch orders' },
      { status: 500 }
    )
  }
}

/** POST /api/orders - Recalculate suggestedBox for orders missing it */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const action = body.action as string

    if (action === 'recalculate-boxes') {
      const forceAll = body.force === true

      // Get orders to update - either all orders or just ones missing suggestedBox
      const ordersToUpdate = await prisma.orderLog.findMany({
        where: forceAll ? {} : { suggestedBox: { equals: Prisma.JsonNull } },
        select: { id: true, rawPayload: true },
      })

      if (ordersToUpdate.length === 0) {
        return NextResponse.json({ message: 'No orders need updating', updated: 0 })
      }

      // Load box config data once
      const [sizes, boxes, feedbackRules, packingEfficiency] = await Promise.all([
        getProductSizes(prisma),
        getBoxes(prisma),
        getFeedbackRules(prisma),
        getPackingEfficiency(prisma),
      ])

      let updated = 0
      for (const order of ordersToUpdate) {
        const items = (order.rawPayload as any)?.items || []
        const suggestedBox = await calculateBoxSuggestionForItems(items, sizes, boxes, feedbackRules, packingEfficiency)

        await prisma.orderLog.update({
          where: { id: order.id },
          data: { suggestedBox: suggestedBox as any },
        })
        updated++
      }

      return NextResponse.json({ message: `Updated ${updated} orders`, updated })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error: unknown) {
    console.error('Error in orders API:', error)
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    )
  }
}

// Calculate box suggestion for an order's items (same logic as ingest-batch)
async function calculateBoxSuggestionForItems(
  items: Array<{ sku?: string; quantity?: number; name?: string }>,
  sizes: ProductSize[],
  boxes: Awaited<ReturnType<typeof getBoxes>>,
  feedbackRules: Awaited<ReturnType<typeof getFeedbackRules>>,
  packingEfficiency: number
) {
  if (!items || items.length === 0) {
    return { boxId: null, boxName: null, confidence: 'unknown' }
  }

  // Filter out insurance items
  const nonInsuranceItems = items.filter(item => {
    const sku = (item.sku || '').toUpperCase()
    const name = (item.name || '').toUpperCase()
    return !sku.includes('INSURANCE') && !sku.includes('SHIPPING') && !name.includes('INSURANCE')
  })

  if (nonInsuranceItems.length === 0) {
    return { boxId: null, boxName: null, confidence: 'unknown' }
  }

  // Map SKUs to product sizes (keep SKU for sticker detection)
  const mappedItems: { productId: string; quantity: number; sku: string; size: ProductSize }[] = []

  for (const item of nonInsuranceItems) {
    const sku = item.sku || ''
    const qty = Number(item.quantity) || 1

    const size = await matchSkuToSize(prisma, sku)
    if (size) {
      mappedItems.push({ productId: size.id, quantity: qty, sku, size })
    }
  }

  if (mappedItems.length === 0) {
    return { boxId: null, boxName: null, confidence: 'unknown' }
  }

  // CHECK 1: Single item with dedicated box (singleBoxId)
  const totalQty = mappedItems.reduce((sum, i) => sum + i.quantity, 0)
  if (mappedItems.length === 1 && totalQty === 1) {
    const singleSize = mappedItems[0].size
    if (singleSize.singleBoxId) {
      const dedicatedBox = boxes.find(b => b.id === singleSize.singleBoxId && b.active)
      if (dedicatedBox) {
        return {
          boxId: dedicatedBox.id,
          boxName: dedicatedBox.name,
          confidence: 'confirmed',
          reason: 'dedicated-box',
        }
      }
    }
  }

  // CHECK 2: Use standard box fitting algorithm (include SKU for sticker detection)
  const productItems = mappedItems.map(i => ({ productId: i.productId, quantity: i.quantity, sku: i.sku }))
  const result = findBestBox(productItems, sizes, boxes, feedbackRules, packingEfficiency)

  return {
    boxId: result.box?.id || null,
    boxName: result.box?.name || null,
    confidence: result.confidence as 'confirmed' | 'calculated' | 'unknown',
  }
}
