import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  shopRates,
  getDefaultRateShopper,
  getDefaultLocation,
  calculateShipmentWeight,
  type ShipToAddress,
} from '@/lib/rate-shop'
import { validateAddress, type AddressValidationResult } from '@/lib/address-validation'
import { updateItemFulfillment, isNetSuiteConfigured } from '@/lib/netsuite'
import { isDirectCarrier, parseDirectServiceCode, getDirectRate } from '@/lib/shipping/provider-router'

/**
 * Normalize carrier codes to their base network for comparison.
 * "ups-direct" and "ups" are the same network; "fedex-direct" and "fedex" are the same.
 * Used to detect when the actual shipping network changes (e.g. USPS → UPS).
 */
function getBaseCarrier(carrierCode: string | undefined): string | null {
  if (!carrierCode) return null
  const c = carrierCode.toLowerCase()
  if (c.includes('ups')) return 'ups'
  if (c.includes('fedex') || c.includes('fdx')) return 'fedex'
  if (c.includes('usps') || c.includes('stamps') || c.includes('endicia')) return 'usps'
  if (c.includes('dhl')) return 'dhl'
  return c
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const order = await prisma.orderLog.findUnique({ where: { id: params.id } })
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    return NextResponse.json(order)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * PATCH /api/orders/[id] - Update an order's address, carrier, weight, box, or retry rate shopping
 *
 * Body (all fields optional):
 * - address: { name?, company?, street1?, street2?, city?, state?, postalCode?, country?, phone? }
 * - carrier: { carrierId, carrierCode, carrier, serviceCode, serviceName }
 * - weight: number (lbs)
 * - box: { boxId?, boxName?, lengthInches, widthInches, heightInches, weightLbs? }
 * - retryRateShopping: boolean
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    const body = await request.json()

    const { address, carrier, weight, box, retryRateShopping, shipFrom } = body

    const order = await prisma.orderLog.findUnique({ where: { id } })
    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    const updateData: any = {}
    let addressValidation: AddressValidationResult | null = null

    let rawPayload = order.rawPayload as any
    const isArray = Array.isArray(rawPayload)
    let orderData = isArray ? rawPayload[0] : rawPayload

    // --- Address update + validation ---
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

      // Validate via direct carrier or ShipEngine
      const existingRate = order.preShoppedRate as any
      try {
        addressValidation = await validateAddress(
          {
            name: address.name || existingShipTo.name || '',
            company: address.company || existingShipTo.company || '',
            street1: address.street1 || existingShipTo.street1 || '',
            street2: address.street2 || existingShipTo.street2 || '',
            city: address.city || existingShipTo.city || '',
            state: address.state || existingShipTo.state || '',
            postalCode: address.postalCode || existingShipTo.postalCode || '',
            country: address.country || existingShipTo.country || 'US',
          },
          existingRate?.carrierCode && existingRate?.carrierId
            ? { carrierCode: existingRate.carrierCode, carrierId: existingRate.carrierId }
            : undefined,
        )
        updateData.addressValidated = addressValidation.status === 'verified'
        updateData.addressOverridden = false

        // Auto-accepted: silently save the corrected address to the order
        if (addressValidation.autoAccepted && addressValidation.matchedAddress) {
          const m = addressValidation.matchedAddress
          orderData = {
            ...orderData,
            shipTo: {
              ...orderData.shipTo,
              street1: m.street1 || orderData.shipTo.street1,
              street2: m.street2 ?? orderData.shipTo.street2,
              city: m.city || orderData.shipTo.city,
              state: m.state || orderData.shipTo.state,
              postalCode: m.postalCode || orderData.shipTo.postalCode,
              country: m.country || orderData.shipTo.country,
              residential: m.residential,
            },
          }
          if (isArray) {
            rawPayload = [orderData, ...rawPayload.slice(1)]
          } else {
            rawPayload = orderData
          }
          updateData.rawPayload = rawPayload
        }
      } catch (err) {
        console.error('Address validation call failed:', err)
        updateData.addressValidated = false
      }
    }

    // --- Accept matched address (user clicked "Accept" on suggestion) ---
    if (body.acceptMatchedAddress && typeof body.acceptMatchedAddress === 'object') {
      const matched = body.acceptMatchedAddress
      const existingShipTo = orderData.shipTo || {}
      orderData = {
        ...orderData,
        shipTo: { ...existingShipTo, ...matched },
      }
      if (isArray) {
        rawPayload = [orderData, ...rawPayload.slice(1)]
      } else {
        rawPayload = orderData
      }
      updateData.rawPayload = rawPayload
      updateData.addressValidated = true
      updateData.addressOverridden = false
    }

    // --- Override address (user clicked "Keep Mine" on suggestion) ---
    if (body.overrideAddress === true) {
      updateData.addressOverridden = true
    }

    // --- Ship From update ---
    if (shipFrom && typeof shipFrom === 'object') {
      orderData = { ...orderData, shipFrom }
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

    // --- Box update ---
    if (box && typeof box === 'object') {
      updateData.suggestedBox = {
        boxId: box.boxId || null,
        boxName: box.boxName || null,
        confidence: 'confirmed',
        lengthInches: box.lengthInches,
        widthInches: box.widthInches,
        heightInches: box.heightInches,
        weightLbs: box.weightLbs || 0,
      }
    }

    // --- Carrier override ---
    if (carrier && typeof carrier === 'object') {
      let ratePrice = 0
      let rateDeliveryDays: number | null = null
      let rateCurrency = 'USD'

      // For direct carriers, immediately fetch the rate
      if (isDirectCarrier(carrier.carrierCode) && carrier.serviceCode) {
        const parsed = parseDirectServiceCode(carrier.serviceCode)
        if (parsed) {
          const currentPayload = updateData.rawPayload || rawPayload
          const currentOrderData = Array.isArray(currentPayload) ? currentPayload[0] : currentPayload
          const st = currentOrderData?.shipTo || {}
          const currentBox = (updateData.suggestedBox || order.suggestedBox) as any
          const dims = currentBox?.lengthInches
            ? { length: currentBox.lengthInches, width: currentBox.widthInches, height: currentBox.heightInches }
            : { length: 6, width: 6, height: 6 }
          const wt = updateData.shippedWeight ?? order.shippedWeight ?? 1

          const defaultLoc = await getDefaultLocation(prisma)
          const rateResult = await getDirectRate(
            carrier.carrierId,
            parsed.carrierCode,
            parsed.rawServiceCode,
            {
              city: st.city || '',
              state: st.state || '',
              postalCode: st.postalCode || st.zip || '',
              country: st.country || 'US',
              residential: st.residential !== false,
            },
            {
              city: defaultLoc?.city || '',
              state: defaultLoc?.state || '',
              postalCode: defaultLoc?.postalCode || '',
              country: defaultLoc?.country || 'US',
            },
            wt,
            dims,
          )

          if (rateResult.success) {
            ratePrice = rateResult.price
            rateDeliveryDays = rateResult.deliveryDays
            rateCurrency = rateResult.currency
          }
        }
      }

      updateData.preShoppedRate = {
        carrierId: carrier.carrierId || '',
        carrierCode: carrier.carrierCode || '',
        carrier: carrier.carrier || '',
        serviceCode: carrier.serviceCode || '',
        serviceName: carrier.serviceName || '',
        price: ratePrice,
        currency: rateCurrency,
        deliveryDays: rateDeliveryDays,
        rateId: null,
        fallbackCarrierId: carrier.fallbackCarrierId || null,
        fallbackServiceCode: carrier.fallbackServiceCode || null,
        fallbackCarrierCode: carrier.fallbackCarrierCode || null,
      }
      updateData.rateShopStatus = 'SUCCESS'
      updateData.rateShopError = null
      updateData.rateFetchedAt = new Date()

      // Invalidate address validation when the carrier network changes
      // (e.g. USPS → UPS, FedEx → USPS) since different carriers have
      // different address rules (PO boxes, residential, etc.)
      const existingRate = order.preShoppedRate as any
      const oldBase = getBaseCarrier(existingRate?.carrierCode)
      const newBase = getBaseCarrier(carrier.carrierCode)
      if (oldBase && newBase && oldBase !== newBase && order.addressValidated) {
        console.log(`[Order PATCH] Carrier network changed: ${oldBase} → ${newBase}, invalidating address validation`)
        updateData.addressValidated = false
        updateData.addressOverridden = false
      }
    }

    // --- Retry NetSuite push ---
    if (body.retryNetsuite === true) {
      if (order.status !== 'SHIPPED') {
        return NextResponse.json({ error: 'Order is not shipped — cannot retry NetSuite' }, { status: 400 })
      }

      const netsuiteIfId = orderData?.netsuiteIfId
      if (!netsuiteIfId) {
        return NextResponse.json({
          error: 'No netsuiteIfId in order payload — cannot push to NetSuite',
          netsuiteResponse: { skipReason: 'No netsuiteIfId found in order payload' },
        }, { status: 400 })
      }

      if (!isNetSuiteConfigured()) {
        return NextResponse.json({
          error: 'NetSuite credentials not configured',
          netsuiteResponse: { skipReason: 'NetSuite credentials not configured' },
        }, { status: 400 })
      }

      let nsResponse: any = null
      let nsUpdated = false
      let nsError: string | undefined

      try {
        const nsResult = await updateItemFulfillment({
          internalId: netsuiteIfId,
          trackingNumber: order.trackingNumber || '',
          carrier: order.carrier || '',
          shippingCost: order.labelCost || 0,
          packages: [{
            packageTrackingNumber: order.trackingNumber || '',
            packageWeight: order.shippedWeight || 0,
          }],
        })
        nsResponse = { status: nsResult.status, data: nsResult.data }
        if (nsResult.status >= 200 && nsResult.status < 300) {
          nsUpdated = true
        } else {
          nsError = `NetSuite returned ${nsResult.status}: ${typeof nsResult.data === 'string' ? nsResult.data : JSON.stringify(nsResult.data)}`
        }
      } catch (e: any) {
        nsError = e.message || 'NetSuite update failed'
        nsResponse = { error: nsError }
      }

      updateData.netsuiteUpdated = nsUpdated

      await prisma.shipmentLog.create({
        data: {
          orderLogId: id,
          action: 'LABEL_CREATED',
          trackingNumber: order.trackingNumber,
          carrier: order.carrier,
          netsuiteUpdated: nsUpdated,
          netsuiteError: nsError || (nsResponse ? JSON.stringify(nsResponse) : null),
          createdByName: body.userName || 'System',
        },
      })

      const updated = await prisma.orderLog.update({
        where: { id },
        data: updateData,
      })

      return NextResponse.json({
        success: nsUpdated,
        order: updated,
        netsuiteUpdated: nsUpdated,
        netsuiteError: nsError,
        netsuiteResponse: nsResponse,
      })
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

      // Prefer updated box over existing
      const currentBox = (updateData.suggestedBox || order.suggestedBox) as any
      let dimensions = { length: 6, width: 6, height: 6 }
      if (currentBox?.lengthInches && currentBox?.widthInches && currentBox?.heightInches) {
        dimensions = {
          length: currentBox.lengthInches,
          width: currentBox.widthInches,
          height: currentBox.heightInches,
        }
      }

      const items = currentOrderData.items || []
      const boxWeight = currentBox?.weightLbs || 0
      const totalWeight = updateData.shippedWeight ?? order.shippedWeight ?? await calculateShipmentWeight(prisma, items, boxWeight)

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
        addressValidated: true,
        addressOverridden: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return NextResponse.json({
      success: true,
      order: updated,
      addressValidation: addressValidation || undefined,
    })
  } catch (error: any) {
    console.error('Error updating order:', error)
    return NextResponse.json(
      { error: 'Failed to update order', details: error.message },
      { status: 500 }
    )
  }
}
