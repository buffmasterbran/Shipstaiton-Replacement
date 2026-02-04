import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  shopRates,
  getDefaultRateShopper,
  getDefaultLocation,
  calculateShipmentWeight,
  type ShipToAddress,
} from '@/lib/rate-shop'

/**
 * PATCH /api/orders/[id] - Update an order's address, carrier, weight, or retry rate shopping
 *
 * Body (all fields optional):
 * - address: { name?, company?, street1?, street2?, city?, state?, postalCode?, country?, phone? }
 * - carrier: { carrierId, carrierCode, carrier, serviceCode, serviceName }
 * - weight: number (lbs)
 * - retryRateShopping: boolean
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    const body = await request.json()

    const { address, carrier, weight, retryRateShopping } = body

    // Fetch existing order
    const order = await prisma.orderLog.findUnique({ where: { id } })
    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Build update data
    const updateData: any = {}

    // Handle rawPayload (array-or-object pattern used throughout codebase)
    let rawPayload = order.rawPayload as any
    const isArray = Array.isArray(rawPayload)
    let orderData = isArray ? rawPayload[0] : rawPayload

    // --- Address update ---
    if (address && typeof address === 'object') {
      const existingShipTo = orderData.shipTo || {}
      orderData = {
        ...orderData,
        shipTo: { ...existingShipTo, ...address },
      }

      if (isArray) {
        rawPayload = [orderData, ...rawPayload.slice(1)]
      } else {
        rawPayload = orderData
      }
      updateData.rawPayload = rawPayload
    }

    // --- Weight update ---
    if (weight !== undefined && typeof weight === 'number') {
      updateData.shippedWeight = weight
    }

    // --- Carrier override ---
    if (carrier && typeof carrier === 'object') {
      updateData.preShoppedRate = {
        carrierId: carrier.carrierId || '',
        carrierCode: carrier.carrierCode || '',
        carrier: carrier.carrier || '',
        serviceCode: carrier.serviceCode || '',
        serviceName: carrier.serviceName || '',
        price: 0,
        currency: 'USD',
        deliveryDays: null,
        rateId: null,
      }
      updateData.rateShopStatus = 'SUCCESS'
      updateData.rateShopError = null
      updateData.rateFetchedAt = new Date()
    }

    // --- Retry rate shopping ---
    if (retryRateShopping) {
      const rateShopper = await getDefaultRateShopper(prisma)
      if (!rateShopper) {
        return NextResponse.json(
          { error: 'No rate shopper profile configured. Go to Settings to set one up.' },
          { status: 400 }
        )
      }

      // Use the (possibly updated) rawPayload
      const currentPayload = updateData.rawPayload || rawPayload
      const currentOrderData = Array.isArray(currentPayload) ? currentPayload[0] : currentPayload
      const shipTo = currentOrderData.shipTo || {}

      const shipToAddress: ShipToAddress = {
        name: shipTo.name || currentOrderData.billTo?.name,
        company: shipTo.company,
        street1: shipTo.street1 || shipTo.address1 || '',
        street2: shipTo.street2 || shipTo.address2,
        city: shipTo.city || '',
        state: shipTo.state || '',
        postalCode: shipTo.postalCode || shipTo.zip || '',
        country: shipTo.country || 'US',
        phone: shipTo.phone,
        residential: shipTo.residential !== false,
      }

      // Get box dimensions from suggestedBox
      const suggestedBox = order.suggestedBox as any
      let dimensions = { length: 6, width: 6, height: 6 } // fallback
      if (suggestedBox?.lengthInches && suggestedBox?.widthInches && suggestedBox?.heightInches) {
        dimensions = {
          length: suggestedBox.lengthInches,
          width: suggestedBox.widthInches,
          height: suggestedBox.heightInches,
        }
      }

      // Calculate weight
      const items = currentOrderData.items || []
      const boxWeight = suggestedBox?.weightLbs || 0
      const totalWeight = updateData.shippedWeight ?? order.shippedWeight ?? await calculateShipmentWeight(prisma, items, boxWeight)

      // Shop rates
      const rateResult = await shopRates(prisma, shipToAddress, totalWeight, dimensions, rateShopper)

      if (rateResult.success && rateResult.rate) {
        updateData.preShoppedRate = {
          carrierId: rateResult.rate.carrierId,
          carrierCode: rateResult.rate.carrierCode,
          carrier: rateResult.rate.carrier,
          serviceCode: rateResult.rate.serviceCode,
          serviceName: rateResult.rate.serviceName,
          price: rateResult.rate.price,
          currency: rateResult.rate.currency,
          deliveryDays: rateResult.rate.deliveryDays,
          rateId: rateResult.rate.rateId,
        }
        updateData.rateShopStatus = 'SUCCESS'
        updateData.rateShopError = null
        updateData.shippedWeight = totalWeight
      } else {
        updateData.rateShopStatus = 'FAILED'
        updateData.rateShopError = rateResult.error || 'Rate shopping failed'
      }
      updateData.rateFetchedAt = new Date()
    }

    // Persist
    const updated = await prisma.orderLog.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        rawPayload: true,
        preShoppedRate: true,
        shippedWeight: true,
        rateShopStatus: true,
        rateShopError: true,
        rateFetchedAt: true,
        suggestedBox: true,
        orderType: true,
        customerReachedOut: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return NextResponse.json({ success: true, order: updated })
  } catch (error: any) {
    console.error('Error updating order:', error)
    return NextResponse.json(
      { error: 'Failed to update order', details: error.message },
      { status: 500 }
    )
  }
}
