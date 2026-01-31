import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  getBoxConfig,
  getBoxes,
  getFeedbackRules,
  getPackingEfficiency,
  setPackingEfficiency,
  addBox,
  updateBox,
  deleteBox,
  addFeedbackRule,
  deleteFeedbackRule,
  findBestBox,
  buildComboSignature,
} from '@/lib/box-config'
import { getProducts, matchSkuToSize, getProductSizes } from '@/lib/products'

/** GET /api/box-config - Return box config */
export async function GET() {
  try {
    const config = await getBoxConfig(prisma)
    return NextResponse.json(config)
  } catch (error: unknown) {
    console.error('Error fetching box config:', error)
    return NextResponse.json(
      { error: 'Failed to fetch box config' },
      { status: 500 }
    )
  }
}

/** POST /api/box-config - Handle various actions */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const action = body.action as string

    switch (action) {
      case 'add-box': {
        if (!body.name || typeof body.name !== 'string') {
          return NextResponse.json({ error: 'Box name is required' }, { status: 400 })
        }

        // Support both old format (internalDimensions) and new format (lengthInches, etc.)
        const lengthInches = Number(body.lengthInches ?? body.internalDimensions?.length) || 0
        const widthInches = Number(body.widthInches ?? body.internalDimensions?.width) || 0
        const heightInches = Number(body.heightInches ?? body.internalDimensions?.height) || 0

        if (!lengthInches || !widthInches || !heightInches) {
          return NextResponse.json({ error: 'Dimensions are required' }, { status: 400 })
        }

        const box = await addBox(prisma, {
          id: body.id,
          name: body.name,
          lengthInches,
          widthInches,
          heightInches,
          priority: body.priority !== undefined ? Number(body.priority) : undefined,
          active: body.active !== false,
          inStock: body.inStock !== false,
          singleCupOnly: body.singleCupOnly === true,
        })
        return NextResponse.json(box, { status: 201 })
      }

      case 'update-box': {
        if (!body.id || typeof body.id !== 'string') {
          return NextResponse.json({ error: 'Box ID is required' }, { status: 400 })
        }

        const updates: Parameters<typeof updateBox>[2] = {}
        if (body.name !== undefined) updates.name = body.name

        // Support both formats for dimensions
        if (body.lengthInches !== undefined) updates.lengthInches = Number(body.lengthInches)
        if (body.widthInches !== undefined) updates.widthInches = Number(body.widthInches)
        if (body.heightInches !== undefined) updates.heightInches = Number(body.heightInches)
        if (body.internalDimensions !== undefined) {
          updates.lengthInches = Number(body.internalDimensions.length)
          updates.widthInches = Number(body.internalDimensions.width)
          updates.heightInches = Number(body.internalDimensions.height)
        }

        if (body.priority !== undefined) updates.priority = Number(body.priority)
        if (body.active !== undefined) updates.active = body.active
        if (body.inStock !== undefined) updates.inStock = body.inStock
        if (body.singleCupOnly !== undefined) updates.singleCupOnly = body.singleCupOnly

        const box = await updateBox(prisma, body.id, updates)
        return NextResponse.json(box)
      }

      case 'delete-box': {
        if (!body.id || typeof body.id !== 'string') {
          return NextResponse.json({ error: 'Box ID is required' }, { status: 400 })
        }
        const result = await deleteBox(prisma, body.id)
        if (!result.deleted) {
          return NextResponse.json({ error: 'Box not found' }, { status: 404 })
        }
        return NextResponse.json({ success: true, feedbackRulesRemoved: result.feedbackRulesRemoved })
      }

      case 'add-feedback': {
        if (!body.comboSignature || typeof body.comboSignature !== 'string') {
          return NextResponse.json({ error: 'Combo signature is required' }, { status: 400 })
        }
        if (!body.boxId || typeof body.boxId !== 'string') {
          return NextResponse.json({ error: 'Box ID is required' }, { status: 400 })
        }
        if (typeof body.fits !== 'boolean') {
          return NextResponse.json({ error: 'Fits (boolean) is required' }, { status: 400 })
        }

        const rule = await addFeedbackRule(prisma, {
          comboSignature: body.comboSignature,
          boxId: body.boxId,
          fits: body.fits,
          correctBoxId: body.correctBoxId || undefined,
          testedBy: body.testedBy || undefined,
        })
        return NextResponse.json(rule, { status: 201 })
      }

      case 'delete-feedback': {
        if (!body.id || typeof body.id !== 'string') {
          return NextResponse.json({ error: 'Feedback rule ID is required' }, { status: 400 })
        }
        const deleted = await deleteFeedbackRule(prisma, body.id)
        if (!deleted) {
          return NextResponse.json({ error: 'Feedback rule not found' }, { status: 404 })
        }
        return NextResponse.json({ success: true })
      }

      case 'test-fit': {
        // Test which box an order would fit in
        if (!body.items || !Array.isArray(body.items)) {
          return NextResponse.json({ error: 'Items array is required' }, { status: 400 })
        }

        const [products, boxes, feedbackRules, packingEfficiency] = await Promise.all([
          getProducts(prisma),
          getBoxes(prisma),
          getFeedbackRules(prisma),
          getPackingEfficiency(prisma),
        ])

        const result = findBestBox(body.items, products, boxes, feedbackRules, packingEfficiency)
        const signature = buildComboSignature(body.items)

        return NextResponse.json({
          ...result,
          comboSignature: signature,
          usableVolume: result.box ? result.box.volume * packingEfficiency : null,
        })
      }

      case 'suggest-box': {
        // Suggest box for an order based on SKUs
        // Input: { items: [{ sku: string, quantity: number }] }
        if (!body.items || !Array.isArray(body.items)) {
          return NextResponse.json({ error: 'Items array is required' }, { status: 400 })
        }

        const [sizes, boxes, feedbackRules, packingEfficiency] = await Promise.all([
          getProductSizes(prisma),
          getBoxes(prisma),
          getFeedbackRules(prisma),
          getPackingEfficiency(prisma),
        ])

        // Map SKUs to product sizes
        const mappedItems: { productId: string; quantity: number; size: typeof sizes[0] }[] = []
        const unmappedSkus: string[] = []

        for (const item of body.items) {
          const sku = item.sku as string
          const qty = Number(item.quantity) || 1

          // Try to match SKU to a product size
          const size = await matchSkuToSize(prisma, sku)
          if (size) {
            mappedItems.push({ productId: size.id, quantity: qty, size })
          } else {
            unmappedSkus.push(sku)
          }
        }

        // If we couldn't map any SKUs, return unknown
        if (mappedItems.length === 0) {
          return NextResponse.json({
            box: null,
            confidence: 'unknown',
            unmappedSkus,
            message: 'Could not match any SKUs to product sizes',
          })
        }

        // CHECK 1: Single item with dedicated box (singleBoxId)
        const totalQty = mappedItems.reduce((sum, i) => sum + i.quantity, 0)
        if (mappedItems.length === 1 && totalQty === 1) {
          const singleSize = mappedItems[0].size
          if (singleSize.singleBoxId) {
            const dedicatedBox = boxes.find(b => b.id === singleSize.singleBoxId && b.active)
            if (dedicatedBox) {
              return NextResponse.json({
                box: dedicatedBox,
                confidence: 'confirmed',
                reason: 'dedicated-box',
                productSize: singleSize.name,
                unmappedSkus,
              })
            }
          }
        }

        // CHECK 2: Use standard box fitting algorithm
        const productItems = mappedItems.map(i => ({ productId: i.productId, quantity: i.quantity }))
        const result = findBestBox(productItems, sizes, boxes, feedbackRules, packingEfficiency)
        const signature = buildComboSignature(productItems)

        return NextResponse.json({
          ...result,
          comboSignature: signature,
          usableVolume: result.box ? result.box.volume * packingEfficiency : null,
          unmappedSkus,
          mappedItems: mappedItems.map(i => ({ sku: body.items.find((x: { sku: string }) => x.sku)?.sku, productId: i.productId, productName: i.size.name, quantity: i.quantity })),
        })
      }

      case 'update-efficiency': {
        if (typeof body.packingEfficiency !== 'number') {
          return NextResponse.json({ error: 'Packing efficiency is required' }, { status: 400 })
        }
        const efficiency = Math.max(0.1, Math.min(1, body.packingEfficiency))
        await setPackingEfficiency(prisma, efficiency)
        return NextResponse.json({ packingEfficiency: efficiency })
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (error: unknown) {
    console.error('Error in box-config API:', error)
    const message = error instanceof Error ? error.message : 'Failed to process request'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
