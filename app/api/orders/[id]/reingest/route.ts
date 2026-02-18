import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getBoxes, getFeedbackRules, getPackingEfficiency, calculateBoxSuggestion } from '@/lib/box-config'
import { getProductSizes } from '@/lib/products'
import {
  classifyOrder,
  calculateShipmentWeight,
  getDefaultRateShopper,
  shopRates,
  getSinglesCarrier,
  type ShipToAddress,
} from '@/lib/rate-shop'
import { validateAddress } from '@/lib/address-validation'

/**
 * POST /api/orders/[id]/reingest
 *
 * Re-runs the full ingest pipeline on a single order for debugging.
 * Logs every step to the server console with a [Re-Ingest <orderNumber>] prefix.
 * Updates the order in the DB with new results.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params

  try {
    const order = await prisma.orderLog.findUnique({ where: { id } })
    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    const rawPayload = order.rawPayload as any
    const orderData = Array.isArray(rawPayload) ? rawPayload[0] : rawPayload
    const orderNumber = order.orderNumber
    const log = (msg: string) => console.log(`[Re-Ingest ${orderNumber}] ${msg}`)

    log('Starting re-ingest...')

    // Load all config (same as ingest-batch)
    const [sizes, boxes, feedbackRules, packingEfficiency, rateShopper, singlesCarrier, shippingMethodMappings, weightRules] = await Promise.all([
      getProductSizes(prisma),
      getBoxes(prisma),
      getFeedbackRules(prisma),
      getPackingEfficiency(prisma),
      getDefaultRateShopper(prisma),
      getSinglesCarrier(prisma),
      prisma.shippingMethodMapping.findMany({
        where: { isActive: true },
        include: { rateShopper: true },
      }),
      prisma.weightRule.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
        include: { rateShopper: { select: { id: true, name: true, active: true } } },
      }),
    ])
    log(`Config loaded: ${boxes.length} boxes, ${sizes.length} product sizes, ${shippingMethodMappings.length} mappings, ${weightRules.length} weight rules`)

    const mappingLookup = new Map<string, typeof shippingMethodMappings[0]>()
    for (const m of shippingMethodMappings) {
      mappingLookup.set(m.incomingName.toLowerCase(), m)
    }

    // === STEP 1: Box suggestion ===
    const items = orderData.items || []
    log(`Items: ${items.length} line items`)
    const { suggestedBox, unmatchedSkus } = await calculateBoxSuggestion(prisma, items, sizes, boxes, feedbackRules, packingEfficiency)
    log(`Box suggestion: ${suggestedBox.boxName ? `"${suggestedBox.boxName}" (${suggestedBox.confidence}, ${suggestedBox.lengthInches}x${suggestedBox.widthInches}x${suggestedBox.heightInches})` : 'NONE (unknown)'}`)
    if (unmatchedSkus.length > 0) {
      log(`Unmatched SKUs: ${unmatchedSkus.map(s => s.sku).join(', ')}`)
    }

    // === STEP 2: Address validation ===
    const shipToRaw = orderData.shipTo || {}
    let addressValidated = false
    try {
      const addrResult = await validateAddress({
        name: shipToRaw.name || orderData.billTo?.name || '',
        company: shipToRaw.company || '',
        street1: shipToRaw.street1 || shipToRaw.address1 || '',
        street2: shipToRaw.street2 || shipToRaw.address2 || '',
        city: shipToRaw.city || '',
        state: shipToRaw.state || '',
        postalCode: shipToRaw.postalCode || shipToRaw.zip || '',
        country: shipToRaw.country || 'US',
      })
      addressValidated = addrResult.status === 'verified'
      log(`Address validation: ${addrResult.status}${addrResult.messages?.length ? ` (${addrResult.messages.map(m => m.message).join('; ')})` : ''}`)
    } catch (e: any) {
      log(`Address validation ERROR: ${e.message}`)
    }

    // === STEP 3: Personalization check ===
    const isPersonalized = !!(
      orderData.isPersonalized || orderData.personalized || orderData.customization || orderData.engravingText ||
      (orderData.items || []).some((item: any) => item.isPersonalized || item.personalized || item.customization || item.engravingText)
    )
    log(`Personalized: ${isPersonalized}`)

    // === STEP 4: Shipping method mapping + classification ===
    let preShoppedRate: any = null
    let shippedWeight: number | null = null
    let rateShopStatus = 'SKIPPED'
    let rateShopError: string | null = null

    const requestedService = (orderData.requestedShippingService || orderData.shippingMethod || '').trim()
    const matchedMapping = requestedService ? mappingLookup.get(requestedService.toLowerCase()) : undefined
    log(`Requested service: "${requestedService || '(none)'}"`)
    if (matchedMapping) {
      log(`Shipping method mapping: "${requestedService}" -> ${matchedMapping.targetType} (${matchedMapping.serviceName || matchedMapping.rateShopperId || 'weight_rules'})`)
    } else {
      log('Shipping method mapping: no match')
    }

    let orderType: string
    const mappingUsesWeightRules = matchedMapping?.targetType === 'weight_rules'
    const mappingUsesRateShopper = matchedMapping?.targetType === 'rate_shopper'
    const mappingUsesService = matchedMapping?.targetType === 'service' || (matchedMapping && !matchedMapping.targetType)

    // Helper to build ShipToAddress
    const buildShipTo = (): ShipToAddress => {
      const st = orderData.shipTo || {}
      return {
        name: st.name || orderData.billTo?.name,
        company: st.company,
        street1: st.street1 || st.address1 || '',
        street2: st.street2 || st.address2,
        city: st.city || '',
        state: st.state || '',
        postalCode: st.postalCode || st.zip || '',
        country: st.country || 'US',
        phone: st.phone,
        residential: st.residential !== false,
      }
    }

    // Helper to rate shop with a profile
    const doRateShop = async (profileData: any, weight: number, label: string) => {
      if (!suggestedBox.boxId || !suggestedBox.lengthInches || !suggestedBox.widthInches || !suggestedBox.heightInches) {
        log(`${label}: SKIPPED - no box dimensions`)
        return { success: false, error: 'No box dimensions' }
      }
      log(`${label}: Shopping with weight=${weight.toFixed(2)}lbs, dims=${suggestedBox.lengthInches}x${suggestedBox.widthInches}x${suggestedBox.heightInches}, profile="${profileData.name}"`)
      const result = await shopRates(prisma, buildShipTo(), weight, {
        length: suggestedBox.lengthInches,
        width: suggestedBox.widthInches,
        height: suggestedBox.heightInches,
      }, profileData)
      if (result.success && result.rate) {
        log(`${label}: SUCCESS - ${result.rate.serviceName} $${result.rate.price?.toFixed(2)} (${result.rate.deliveryDays ?? '?'}d)`)
      } else {
        log(`${label}: FAILED - ${result.error}`)
      }
      return result
    }

    if (matchedMapping && mappingUsesService) {
      orderType = matchedMapping.isExpedited ? 'EXPEDITED' : classifyOrder(orderData)
      preShoppedRate = {
        carrierId: matchedMapping.carrierId || '', carrierCode: matchedMapping.carrierCode || '',
        carrier: (matchedMapping.serviceName || '').split(' ')[0] || matchedMapping.carrierCode || '',
        serviceCode: matchedMapping.serviceCode || '', serviceName: matchedMapping.serviceName || '',
        price: 0, currency: 'USD', deliveryDays: null,
      }
      rateShopStatus = 'MAPPED'
      log(`Order type: ${orderType} (mapped to service)`)
    } else if (matchedMapping && mappingUsesRateShopper && matchedMapping.rateShopperId) {
      orderType = matchedMapping.isExpedited ? 'EXPEDITED' : classifyOrder(orderData)
      log(`Order type: ${orderType} (mapping -> rate shopper)`)
      const mrs = matchedMapping.rateShopper
      if (mrs && mrs.active && suggestedBox.boxId) {
        const boxWeight = suggestedBox.weightLbs || 0
        const calcWeight = await calculateShipmentWeight(prisma, items, boxWeight)
        shippedWeight = calcWeight
        const rsProfile = { id: mrs.id, name: mrs.name, services: mrs.services as any, transitTimeRestriction: mrs.transitTimeRestriction, preferenceEnabled: mrs.preferenceEnabled, preferredServiceCode: mrs.preferredServiceCode, preferenceType: mrs.preferenceType, preferenceValue: mrs.preferenceValue }
        const rateResult = await doRateShop(rsProfile, calcWeight, 'Mapping rate shop')
        if (rateResult.success && rateResult.rate) {
          preShoppedRate = { carrierId: rateResult.rate.carrierId, carrierCode: rateResult.rate.carrierCode, carrier: rateResult.rate.carrier, serviceCode: rateResult.rate.serviceCode, serviceName: rateResult.rate.serviceName, price: rateResult.rate.price, currency: rateResult.rate.currency, deliveryDays: rateResult.rate.deliveryDays, rateId: rateResult.rate.rateId }
          rateShopStatus = 'SUCCESS'
        } else {
          rateShopStatus = 'FAILED'
          rateShopError = rateResult.error || 'Mapping rate shopping failed'
        }
      } else {
        rateShopStatus = 'FAILED'
        rateShopError = !mrs?.active ? 'Mapped rate shopper is inactive' : 'No box for rate shopping'
        log(`Mapping rate shop: FAILED - ${rateShopError}`)
      }
    } else {
      if (matchedMapping && mappingUsesWeightRules) {
        orderType = matchedMapping.isExpedited ? 'EXPEDITED' : classifyOrder(orderData)
        log(`Order type: ${orderType} (mapping -> weight rules)`)
      } else {
        orderType = classifyOrder(orderData)
        log(`Order type: ${orderType} (classified)`)
      }

      // Weight rules
      let weightRuleMatched = false
      if (orderType !== 'EXPEDITED' && weightRules.length > 0 && suggestedBox.boxId) {
        const boxWeight = suggestedBox.weightLbs || 0
        const calcWeight = await calculateShipmentWeight(prisma, items, boxWeight)
        const weightOz = calcWeight * 16
        log(`Weight: ${calcWeight.toFixed(2)} lbs (${weightOz.toFixed(1)} oz) - checking ${weightRules.length} weight rules`)

        const matchedRule = weightRules.find(wr => weightOz >= wr.minOz && weightOz < wr.maxOz)
        if (matchedRule) {
          shippedWeight = calcWeight
          log(`Weight rule matched: ${matchedRule.minOz}-${matchedRule.maxOz}oz -> ${matchedRule.targetType} (${matchedRule.serviceCode || matchedRule.rateShopperId || '?'})`)

          if (matchedRule.targetType === 'service' && matchedRule.serviceCode) {
            preShoppedRate = { carrierId: matchedRule.carrierId || '', carrierCode: matchedRule.carrierCode || '', carrier: (matchedRule.serviceName || '').split(' ')[0] || matchedRule.carrierCode || '', serviceCode: matchedRule.serviceCode, serviceName: matchedRule.serviceName || '', price: 0, currency: 'USD', deliveryDays: null }
            rateShopStatus = 'SUCCESS'
            weightRuleMatched = true
          } else if (matchedRule.targetType === 'rate_shopper' && matchedRule.rateShopperId && matchedRule.rateShopper?.active) {
            const rrs = await prisma.rateShopper.findUnique({ where: { id: matchedRule.rateShopperId } })
            if (rrs && rrs.active && suggestedBox.lengthInches && suggestedBox.widthInches && suggestedBox.heightInches) {
              const rsProfile = { id: rrs.id, name: rrs.name, services: rrs.services as any, transitTimeRestriction: rrs.transitTimeRestriction, preferenceEnabled: rrs.preferenceEnabled, preferredServiceCode: rrs.preferredServiceCode, preferenceType: rrs.preferenceType, preferenceValue: rrs.preferenceValue }
              const rateResult = await doRateShop(rsProfile, calcWeight, 'Weight rule rate shop')
              if (rateResult.success && rateResult.rate) {
                preShoppedRate = { carrierId: rateResult.rate.carrierId, carrierCode: rateResult.rate.carrierCode, carrier: rateResult.rate.carrier, serviceCode: rateResult.rate.serviceCode, serviceName: rateResult.rate.serviceName, price: rateResult.rate.price, currency: rateResult.rate.currency, deliveryDays: rateResult.rate.deliveryDays, rateId: rateResult.rate.rateId }
                rateShopStatus = 'SUCCESS'
                weightRuleMatched = true
              } else {
                rateShopStatus = 'FAILED'
                rateShopError = rateResult.error || 'Weight rule rate shopping failed'
                weightRuleMatched = true
              }
            }
          }
        } else {
          log(`Weight rules: no rule matched for ${weightOz.toFixed(1)} oz`)
        }
      }

      // Fallback
      if (!weightRuleMatched && orderType === 'SINGLE') {
        if (singlesCarrier && singlesCarrier.carrierId) {
          preShoppedRate = { carrierId: singlesCarrier.carrierId, carrierCode: singlesCarrier.carrierCode, carrier: singlesCarrier.carrier, serviceCode: singlesCarrier.serviceCode, serviceName: singlesCarrier.serviceName, price: 0, currency: 'USD', deliveryDays: null }
          rateShopStatus = 'SUCCESS'
          log(`Singles carrier: ${singlesCarrier.serviceName}`)
        } else {
          rateShopStatus = 'FAILED'
          rateShopError = 'Singles carrier not configured'
          log(`Singles carrier: NOT CONFIGURED`)
        }
      } else if (!weightRuleMatched && orderType === 'EXPEDITED') {
        rateShopStatus = 'SKIPPED'
        log('Expedited: rate shopping skipped')
      } else if (!weightRuleMatched && orderType === 'BULK') {
        if (!rateShopper) {
          rateShopStatus = 'SKIPPED'
          log('Bulk: no rate shopper configured, skipped')
        } else if (!suggestedBox.boxId || !suggestedBox.lengthInches) {
          rateShopStatus = 'FAILED'
          rateShopError = 'No box suggestion for rate shopping'
          log(`Bulk rate shop: FAILED - no box`)
        } else {
          const boxWeight = suggestedBox.weightLbs || 0
          shippedWeight = await calculateShipmentWeight(prisma, items, boxWeight)
          log(`Weight: ${shippedWeight.toFixed(2)} lbs (box: ${boxWeight}, items: ${(shippedWeight - boxWeight).toFixed(2)})`)
          const rateResult = await doRateShop(rateShopper, shippedWeight, 'Bulk rate shop')
          if (rateResult.success && rateResult.rate) {
            preShoppedRate = { carrierId: rateResult.rate.carrierId, carrierCode: rateResult.rate.carrierCode, carrier: rateResult.rate.carrier, serviceCode: rateResult.rate.serviceCode, serviceName: rateResult.rate.serviceName, price: rateResult.rate.price, currency: rateResult.rate.currency, deliveryDays: rateResult.rate.deliveryDays, rateId: rateResult.rate.rateId }
            rateShopStatus = 'SUCCESS'
          } else {
            rateShopStatus = 'FAILED'
            rateShopError = rateResult.error || 'Rate shopping failed'
          }
        }
      }
    }

    log(`Final: type=${orderType}, rateStatus=${rateShopStatus}, rate=${preShoppedRate ? `${preShoppedRate.serviceName} $${preShoppedRate.price}` : 'none'}, addressValidated=${addressValidated}`)

    // === Update order in DB ===
    const updated = await prisma.orderLog.update({
      where: { id },
      data: {
        suggestedBox: suggestedBox as any,
        orderType,
        isPersonalized,
        shippedWeight,
        preShoppedRate: preShoppedRate as any,
        rateFetchedAt: rateShopStatus === 'SUCCESS' ? new Date() : null,
        rateShopStatus,
        rateShopError,
        addressValidated,
      },
      select: {
        id: true, orderNumber: true, status: true, rawPayload: true,
        preShoppedRate: true, shippedWeight: true, rateShopStatus: true, rateShopError: true,
        rateFetchedAt: true, suggestedBox: true, orderType: true,
        customerReachedOut: true, addressValidated: true, addressOverridden: true,
        onHoldReason: true, batchId: true, createdAt: true, updatedAt: true,
      },
    })

    log('Order updated successfully')

    return NextResponse.json({ success: true, order: updated })
  } catch (error: any) {
    console.error(`[Re-Ingest] Error:`, error)
    return NextResponse.json({ error: 'Re-ingest failed', details: error.message }, { status: 500 })
  }
}
