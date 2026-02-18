import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { prepurchaseLabel } from '@/lib/label-service'

/**
 * POST /api/orders/prepurchase-chunk-labels
 *
 * Batch pre-purchases ShipEngine labels for all AWAITING_SHIPMENT orders in a chunk.
 * Called async after a picker completes a chunk. Labels are bought and orders marked
 * SHIPPED, but printing and NetSuite updates are deferred to the scan station.
 */
export async function POST(req: Request) {
  const startTime = Date.now()
  const elapsed = () => `${Date.now() - startTime}ms`

  try {
    const body = await req.json()
    const { chunkId } = body

    if (!chunkId) {
      return NextResponse.json({ error: 'chunkId is required' }, { status: 400 })
    }

    console.log(`\n${'='.repeat(70)}`)
    console.log(`[Prepurchase] START — chunk ${chunkId}`)
    console.log(`${'='.repeat(70)}`)

    // Step 1: Load chunk metadata
    const chunk = await prisma.pickChunk.findUnique({
      where: { id: chunkId },
      include: { cart: { select: { name: true } }, batch: { select: { name: true, type: true } } },
    })
    if (!chunk) {
      console.error(`[Prepurchase] ABORT — chunk ${chunkId} not found (${elapsed()})`)
      return NextResponse.json({ error: 'Chunk not found' }, { status: 404 })
    }
    console.log(`[Prepurchase] Chunk info: batch="${chunk.batch?.name}" type=${chunk.batch?.type} cart="${chunk.cart?.name}" picker="${chunk.pickerName}" ordersInChunk=${chunk.ordersInChunk} (${elapsed()})`)

    // Step 2: Load default location
    const defaultLocation = await prisma.location.findFirst({
      where: { isDefault: true, active: true },
    })

    if (!defaultLocation) {
      console.error(`[Prepurchase] ABORT — no default location configured (${elapsed()})`)
      return NextResponse.json({ error: 'No default ship-from location configured' }, { status: 500 })
    }
    console.log(`[Prepurchase] Ship-from: "${defaultLocation.name}" (${defaultLocation.city}, ${defaultLocation.state}) (${elapsed()})`)

    // Step 3: Fetch eligible orders
    const orders = await prisma.orderLog.findMany({
      where: {
        chunkId,
        status: 'AWAITING_SHIPMENT',
        labelPrepurchased: false,
      },
      select: {
        id: true,
        orderNumber: true,
        shippedWeight: true,
        suggestedBox: true,
        preShoppedRate: true,
        addressValidated: true,
        rateShopStatus: true,
      },
    })

    console.log(`[Prepurchase] Found ${orders.length} eligible orders (AWAITING_SHIPMENT, not yet prepurchased) (${elapsed()})`)

    if (orders.length === 0) {
      console.log(`[Prepurchase] Nothing to do — all orders already processed or none match`)
      console.log(`${'='.repeat(70)}\n`)
      return NextResponse.json({ total: 0, succeeded: 0, failed: 0 })
    }

    // Step 3b: Log readiness summary
    let readyCount = 0
    const notReadyReasons: string[] = []
    for (const order of orders) {
      const rate = order.preShoppedRate as any
      const box = order.suggestedBox as any
      const missing: string[] = []
      if (!rate?.serviceCode) missing.push('service')
      if (!order.shippedWeight || order.shippedWeight <= 0) missing.push('weight')
      if (!box?.lengthInches || !box?.widthInches || !box?.heightInches) missing.push('dims')
      if (missing.length === 0) {
        readyCount++
      } else {
        notReadyReasons.push(`#${order.orderNumber}: missing ${missing.join(', ')}`)
      }
    }
    console.log(`[Prepurchase] Readiness: ${readyCount}/${orders.length} ready to purchase`)
    if (notReadyReasons.length > 0 && notReadyReasons.length <= 20) {
      notReadyReasons.forEach(r => console.log(`[Prepurchase]   ⚠ ${r}`))
    } else if (notReadyReasons.length > 20) {
      notReadyReasons.slice(0, 10).forEach(r => console.log(`[Prepurchase]   ⚠ ${r}`))
      console.log(`[Prepurchase]   ... and ${notReadyReasons.length - 10} more`)
    }

    // Step 4: Process each order
    let succeeded = 0
    let failed = 0
    let totalCost = 0
    const errors: { orderNumber: string; error: string }[] = []

    for (let i = 0; i < orders.length; i++) {
      const order = orders[i]
      const rate = order.preShoppedRate as any
      const box = order.suggestedBox as any
      const orderStart = Date.now()

      console.log(`[Prepurchase] [${i + 1}/${orders.length}] #${order.orderNumber} — service=${rate?.serviceCode || 'NONE'} carrier=${rate?.carrierCode || 'NONE'} weight=${order.shippedWeight || 0}lbs box=${box?.boxId ? `${box.lengthInches}x${box.widthInches}x${box.heightInches}` : 'NONE'} rateStatus=${order.rateShopStatus || 'N/A'}`)

      try {
        const result = await prepurchaseLabel(order.id, defaultLocation.id)
        const orderElapsed = Date.now() - orderStart

        if (result.success) {
          succeeded++
          totalCost += result.labelCost || 0
          console.log(`[Prepurchase] [${i + 1}/${orders.length}] #${order.orderNumber} ✓ tracking=${result.trackingNumber} carrier=${result.carrier} service=${result.serviceName} cost=$${result.labelCost?.toFixed(2)} (${orderElapsed}ms)`)
        } else {
          failed++
          errors.push({ orderNumber: order.orderNumber, error: result.error || 'Unknown error' })
          console.warn(`[Prepurchase] [${i + 1}/${orders.length}] #${order.orderNumber} ✗ ${result.error} (${orderElapsed}ms)`)
        }
      } catch (e: any) {
        const orderElapsed = Date.now() - orderStart
        failed++
        errors.push({ orderNumber: order.orderNumber, error: e.message })
        console.error(`[Prepurchase] [${i + 1}/${orders.length}] #${order.orderNumber} ✗✗ EXCEPTION: ${e.message} (${orderElapsed}ms)`)
      }
    }

    // Step 5: Summary
    console.log(`\n[Prepurchase] ${'─'.repeat(50)}`)
    console.log(`[Prepurchase] DONE — chunk ${chunkId}`)
    console.log(`[Prepurchase]   Total:     ${orders.length} orders`)
    console.log(`[Prepurchase]   Succeeded: ${succeeded} ($${totalCost.toFixed(2)} total label cost)`)
    console.log(`[Prepurchase]   Failed:    ${failed}`)
    console.log(`[Prepurchase]   Duration:  ${elapsed()}`)
    if (errors.length > 0) {
      console.log(`[Prepurchase]   Errors:`)
      errors.forEach(e => console.log(`[Prepurchase]     #${e.orderNumber}: ${e.error}`))
    }
    console.log(`${'='.repeat(70)}\n`)

    return NextResponse.json({
      total: orders.length,
      succeeded,
      failed,
      totalCost,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error: any) {
    console.error(`[Prepurchase] FATAL ERROR (${elapsed()}):`, error.message || error)
    console.error(error.stack)
    return NextResponse.json({ error: 'Prepurchase failed', details: error.message }, { status: 500 })
  }
}
