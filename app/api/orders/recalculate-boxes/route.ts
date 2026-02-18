import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getBoxes, getFeedbackRules, getPackingEfficiency, calculateBoxSuggestion } from '@/lib/box-config'
import { getProductSizes } from '@/lib/products'
import { calculateShipmentWeight } from '@/lib/rate-shop'

/**
 * POST /api/orders/recalculate-boxes
 *
 * Batch-recalculates box suggestions and weights for all AWAITING_SHIPMENT orders.
 * Skips rate shopping and address validation for speed.
 */
export async function POST() {
  try {
    const orders = await prisma.orderLog.findMany({
      where: { status: 'AWAITING_SHIPMENT' },
      select: { id: true, orderNumber: true, rawPayload: true },
    })

    const [sizes, boxes, feedbackRules, packingEfficiency] = await Promise.all([
      getProductSizes(prisma),
      getBoxes(prisma),
      getFeedbackRules(prisma),
      getPackingEfficiency(prisma),
    ])

    let updated = 0
    const errors: { orderNumber: string; error: string }[] = []

    for (const order of orders) {
      try {
        const rawPayload = order.rawPayload as any
        const orderData = Array.isArray(rawPayload) ? rawPayload[0] : rawPayload
        const items = orderData?.items || []

        const { suggestedBox } = await calculateBoxSuggestion(
          prisma, items, sizes, boxes, feedbackRules, packingEfficiency
        )

        const boxWeight = suggestedBox.weightLbs || 0
        const shippedWeight = await calculateShipmentWeight(prisma, items, boxWeight)

        await prisma.orderLog.update({
          where: { id: order.id },
          data: {
            suggestedBox: suggestedBox as any,
            shippedWeight,
          },
        })

        updated++
      } catch (e: any) {
        errors.push({ orderNumber: order.orderNumber, error: e.message })
      }
    }

    console.log(`[Recalculate Boxes] Done: ${updated}/${orders.length} updated, ${errors.length} errors`)

    return NextResponse.json({
      total: orders.length,
      updated,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error: any) {
    console.error('[Recalculate Boxes] Error:', error)
    return NextResponse.json({ error: 'Recalculation failed', details: error.message }, { status: 500 })
  }
}
