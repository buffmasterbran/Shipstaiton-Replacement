import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import {
  isSingleItemOrder,
  calculateShipmentWeight,
  getDefaultRateShopper,
  shopRates,
  getSinglesCarrier,
  type ShipToAddress,
} from '@/lib/rate-shop'

// POST - Recalculate shipping method assignments for all awaiting orders
export async function POST() {
  try {
    const session = await getSession()
    if (!session || !session.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Load all active mappings (with rate shopper relation)
    const mappings = await prisma.shippingMethodMapping.findMany({
      where: { isActive: true },
      include: { rateShopper: true },
    })

    // Build a lookup map: lowercase incoming name -> mapping
    const mappingLookup = new Map<string, typeof mappings[0]>()
    for (const m of mappings) {
      mappingLookup.set(m.incomingName.toLowerCase(), m)
    }

    // Load weight rules
    const weightRules = await prisma.weightRule.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: { rateShopper: true },
    })

    // Load rate shopping config
    const [rateShopper, singlesCarrier] = await Promise.all([
      getDefaultRateShopper(prisma),
      getSinglesCarrier(prisma),
    ])

    // Fetch all awaiting shipment orders
    const orders = await prisma.orderLog.findMany({
      where: { status: 'AWAITING_SHIPMENT' },
      select: {
        id: true,
        orderNumber: true,
        rawPayload: true,
        orderType: true,
        rateShopStatus: true,
        suggestedBox: true,
      },
    })

    let updated = 0
    let errors = 0
    const details: Array<{ orderNumber: string; action: string }> = []

    // Helper to build ShipToAddress
    const buildShipTo = (orderData: any): ShipToAddress => {
      const shipTo = orderData?.shipTo || {}
      return {
        name: shipTo.name || orderData?.billTo?.name,
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
    }

    // Helper to rate shop with a given rate shopper profile
    const doRateShop = async (
      rsProfile: any,
      orderData: any,
      items: any[],
      box: any
    ): Promise<{ success: boolean; rate?: any; error?: string; weight?: number }> => {
      if (!box?.lengthInches || !box?.widthInches || !box?.heightInches) {
        return { success: false, error: 'No box dimensions available' }
      }
      const boxWeight = box.weightLbs || 0
      const weight = await calculateShipmentWeight(prisma, items, boxWeight)
      const shipToAddress = buildShipTo(orderData)
      const result = await shopRates(
        prisma,
        shipToAddress,
        weight,
        { length: box.lengthInches, width: box.widthInches, height: box.heightInches },
        rsProfile
      )
      return { ...result, weight }
    }

    for (const order of orders) {
      try {
        const payload = order.rawPayload as any
        const orderData = Array.isArray(payload) ? payload[0] : payload
        const requestedService = (
          orderData?.requestedShippingService ||
          orderData?.shippingMethod ||
          ''
        ).trim()

        const items = orderData?.items || []
        const box = order.suggestedBox as any

        // Check if this order matches a shipping method mapping
        const matchedMapping = requestedService
          ? mappingLookup.get(requestedService.toLowerCase())
          : undefined

        const isSingle = isSingleItemOrder(items)

        // ---- MAPPING: Specific Service ----
        if (matchedMapping && (matchedMapping.targetType === 'service' || !matchedMapping.targetType)) {
          const newOrderType = matchedMapping.isExpedited
            ? 'EXPEDITED'
            : isSingle ? 'SINGLE' : 'BULK'

          await prisma.orderLog.update({
            where: { id: order.id },
            data: {
              orderType: newOrderType,
              preShoppedRate: {
                carrierId: matchedMapping.carrierId || '',
                carrierCode: matchedMapping.carrierCode || '',
                carrier: (matchedMapping.serviceName || '').split(' ')[0] || matchedMapping.carrierCode || '',
                serviceCode: matchedMapping.serviceCode || '',
                serviceName: matchedMapping.serviceName || '',
                price: 0,
                currency: 'USD',
                deliveryDays: null,
              },
              rateShopStatus: 'MAPPED',
              rateShopError: null,
              rateFetchedAt: new Date(),
            },
          })

          details.push({
            orderNumber: order.orderNumber,
            action: `Mapped → ${matchedMapping.serviceName}${matchedMapping.isExpedited ? ' (expedited)' : ''}`,
          })
          updated++
          continue
        }

        // ---- MAPPING: Rate Shopper ----
        if (matchedMapping && matchedMapping.targetType === 'rate_shopper' && matchedMapping.rateShopperId) {
          const newOrderType = matchedMapping.isExpedited
            ? 'EXPEDITED'
            : isSingle ? 'SINGLE' : 'BULK'

          const rs = matchedMapping.rateShopper
          if (rs && rs.active) {
            const rsProfile = {
              id: rs.id,
              name: rs.name,
              services: rs.services as any,
              transitTimeRestriction: rs.transitTimeRestriction,
              preferenceEnabled: rs.preferenceEnabled,
              preferredServiceCode: rs.preferredServiceCode,
              preferenceType: rs.preferenceType,
              preferenceValue: rs.preferenceValue,
            }

            const result = await doRateShop(rsProfile, orderData, items, box)
            if (result.success && result.rate) {
              await prisma.orderLog.update({
                where: { id: order.id },
                data: {
                  orderType: newOrderType,
                  shippedWeight: result.weight,
                  preShoppedRate: {
                    carrierId: result.rate.carrierId,
                    carrierCode: result.rate.carrierCode,
                    carrier: result.rate.carrier,
                    serviceCode: result.rate.serviceCode,
                    serviceName: result.rate.serviceName,
                    price: result.rate.price,
                    currency: result.rate.currency,
                    deliveryDays: result.rate.deliveryDays,
                    rateId: result.rate.rateId,
                  },
                  rateFetchedAt: new Date(),
                  rateShopStatus: 'SUCCESS',
                  rateShopError: null,
                },
              })
              details.push({ orderNumber: order.orderNumber, action: `Mapped → Rate Shop "${rs.name}" → ${result.rate.serviceName} $${result.rate.price}` })
            } else {
              await prisma.orderLog.update({
                where: { id: order.id },
                data: {
                  orderType: newOrderType,
                  rateShopStatus: 'FAILED',
                  rateShopError: result.error || 'Mapping rate shop failed',
                },
              })
              details.push({ orderNumber: order.orderNumber, action: `Mapped → Rate Shop "${rs.name}" failed: ${result.error}` })
            }
          } else {
            await prisma.orderLog.update({
              where: { id: order.id },
              data: {
                orderType: newOrderType,
                rateShopStatus: 'FAILED',
                rateShopError: 'Mapped rate shopper inactive or missing',
              },
            })
            details.push({ orderNumber: order.orderNumber, action: 'Mapped → Rate shopper inactive/missing' })
          }
          updated++
          continue
        }

        // ---- MAPPING: Weight Rules (explicit) or NO MAPPING ----
        // Both paths fall through to weight rules, then default handling
        const isWeightRulesMapping = matchedMapping?.targetType === 'weight_rules'
        const newOrderType = matchedMapping?.isExpedited
          ? 'EXPEDITED'
          : isSingle ? 'SINGLE' : 'BULK'

        // Try weight rules first (skip for expedited keyword orders unless explicitly mapped)
        let weightRuleHandled = false

        if (newOrderType !== 'EXPEDITED' && weightRules.length > 0 && box?.boxId) {
          const boxWeight = box.weightLbs || 0
          const calcWeight = await calculateShipmentWeight(prisma, items, boxWeight)
          const weightOz = calcWeight * 16

          const matchedRule = weightRules.find(
            (wr) => weightOz >= wr.minOz && weightOz < wr.maxOz
          )

          if (matchedRule) {
            if (matchedRule.targetType === 'service' && matchedRule.serviceCode) {
              await prisma.orderLog.update({
                where: { id: order.id },
                data: {
                  orderType: newOrderType,
                  shippedWeight: calcWeight,
                  preShoppedRate: {
                    carrierId: matchedRule.carrierId || '',
                    carrierCode: matchedRule.carrierCode || '',
                    carrier: (matchedRule.serviceName || '').split(' ')[0] || matchedRule.carrierCode || '',
                    serviceCode: matchedRule.serviceCode,
                    serviceName: matchedRule.serviceName || '',
                    price: 0,
                    currency: 'USD',
                    deliveryDays: null,
                  },
                  rateFetchedAt: new Date(),
                  rateShopStatus: 'SUCCESS',
                  rateShopError: null,
                },
              })
              details.push({ orderNumber: order.orderNumber, action: `${isWeightRulesMapping ? 'Mapped → ' : ''}Weight rule: ${weightOz.toFixed(0)} oz → ${matchedRule.serviceName}` })
              weightRuleHandled = true
            } else if (matchedRule.targetType === 'rate_shopper' && matchedRule.rateShopperId && matchedRule.rateShopper?.active) {
              const ruleRs = await prisma.rateShopper.findUnique({ where: { id: matchedRule.rateShopperId } })
              if (ruleRs && ruleRs.active) {
                const rsProfile = {
                  id: ruleRs.id,
                  name: ruleRs.name,
                  services: ruleRs.services as any,
                  transitTimeRestriction: ruleRs.transitTimeRestriction,
                  preferenceEnabled: ruleRs.preferenceEnabled,
                  preferredServiceCode: ruleRs.preferredServiceCode,
                  preferenceType: ruleRs.preferenceType,
                  preferenceValue: ruleRs.preferenceValue,
                }
                const result = await doRateShop(rsProfile, orderData, items, box)
                if (result.success && result.rate) {
                  await prisma.orderLog.update({
                    where: { id: order.id },
                    data: {
                      orderType: newOrderType,
                      shippedWeight: result.weight,
                      preShoppedRate: {
                        carrierId: result.rate.carrierId,
                        carrierCode: result.rate.carrierCode,
                        carrier: result.rate.carrier,
                        serviceCode: result.rate.serviceCode,
                        serviceName: result.rate.serviceName,
                        price: result.rate.price,
                        currency: result.rate.currency,
                        deliveryDays: result.rate.deliveryDays,
                        rateId: result.rate.rateId,
                      },
                      rateFetchedAt: new Date(),
                      rateShopStatus: 'SUCCESS',
                      rateShopError: null,
                    },
                  })
                  details.push({ orderNumber: order.orderNumber, action: `${isWeightRulesMapping ? 'Mapped → ' : ''}Weight rule: ${weightOz.toFixed(0)} oz → Rate Shop "${ruleRs.name}" → ${result.rate.serviceName} $${result.rate.price}` })
                } else {
                  await prisma.orderLog.update({
                    where: { id: order.id },
                    data: {
                      orderType: newOrderType,
                      rateShopStatus: 'FAILED',
                      rateShopError: result.error || 'Weight rule rate shop failed',
                    },
                  })
                  details.push({ orderNumber: order.orderNumber, action: `${isWeightRulesMapping ? 'Mapped → ' : ''}Weight rule rate shop failed: ${result.error}` })
                }
                weightRuleHandled = true
              }
            }
            if (weightRuleHandled) {
              updated++
              continue
            }
          }
        }

        // ---- DEFAULT FALLBACK: Singles carrier / Bulk rate shop / Expedited skip ----
        if (newOrderType === 'SINGLE') {
          if (singlesCarrier && singlesCarrier.carrierId) {
            await prisma.orderLog.update({
              where: { id: order.id },
              data: {
                orderType: 'SINGLE',
                preShoppedRate: {
                  carrierId: singlesCarrier.carrierId,
                  carrierCode: singlesCarrier.carrierCode,
                  carrier: singlesCarrier.carrier,
                  serviceCode: singlesCarrier.serviceCode,
                  serviceName: singlesCarrier.serviceName,
                  price: 0,
                  currency: 'USD',
                  deliveryDays: null,
                },
                rateShopStatus: 'SUCCESS',
                rateShopError: null,
                rateFetchedAt: new Date(),
              },
            })
            details.push({ orderNumber: order.orderNumber, action: `Single → ${singlesCarrier.serviceName}` })
          } else {
            await prisma.orderLog.update({
              where: { id: order.id },
              data: {
                orderType: 'SINGLE',
                preShoppedRate: Prisma.DbNull,
                rateShopStatus: 'FAILED',
                rateShopError: 'Singles carrier not configured',
              },
            })
            details.push({ orderNumber: order.orderNumber, action: 'Single - no carrier configured' })
          }
          updated++
        } else if (newOrderType === 'EXPEDITED') {
          await prisma.orderLog.update({
            where: { id: order.id },
            data: {
              orderType: 'EXPEDITED',
              rateShopStatus: 'SKIPPED',
              rateShopError: null,
            },
          })
          details.push({ orderNumber: order.orderNumber, action: 'Expedited - skipped rate shopping' })
          updated++
        } else if (newOrderType === 'BULK') {
          if (!rateShopper) {
            await prisma.orderLog.update({
              where: { id: order.id },
              data: {
                orderType: 'BULK',
                rateShopStatus: 'SKIPPED',
                rateShopError: 'No rate shopper configured',
              },
            })
            details.push({ orderNumber: order.orderNumber, action: 'Bulk - no rate shopper' })
          } else {
            const rsProfile = {
              id: rateShopper.id,
              name: rateShopper.name,
              services: rateShopper.services as any,
              transitTimeRestriction: rateShopper.transitTimeRestriction,
              preferenceEnabled: rateShopper.preferenceEnabled,
              preferredServiceCode: rateShopper.preferredServiceCode,
              preferenceType: rateShopper.preferenceType,
              preferenceValue: rateShopper.preferenceValue,
            }
            const result = await doRateShop(rsProfile, orderData, items, box)
            if (result.success && result.rate) {
              await prisma.orderLog.update({
                where: { id: order.id },
                data: {
                  orderType: 'BULK',
                  shippedWeight: result.weight,
                  preShoppedRate: {
                    carrierId: result.rate.carrierId,
                    carrierCode: result.rate.carrierCode,
                    carrier: result.rate.carrier,
                    serviceCode: result.rate.serviceCode,
                    serviceName: result.rate.serviceName,
                    price: result.rate.price,
                    currency: result.rate.currency,
                    deliveryDays: result.rate.deliveryDays,
                    rateId: result.rate.rateId,
                  },
                  rateFetchedAt: new Date(),
                  rateShopStatus: 'SUCCESS',
                  rateShopError: null,
                },
              })
              details.push({ orderNumber: order.orderNumber, action: `Bulk → ${result.rate.serviceName} $${result.rate.price}` })
            } else {
              await prisma.orderLog.update({
                where: { id: order.id },
                data: {
                  orderType: 'BULK',
                  rateShopStatus: 'FAILED',
                  rateShopError: result.error || 'Unknown error',
                },
              })
              details.push({ orderNumber: order.orderNumber, action: `Bulk - rate shop failed: ${result.error}` })
            }
          }
          updated++
        }
      } catch (err: any) {
        console.error(`[Recalc] Error processing order ${order.orderNumber}:`, err)
        errors++
        details.push({ orderNumber: order.orderNumber, action: `Error: ${err.message}` })
      }
    }

    return NextResponse.json({
      success: true,
      totalOrders: orders.length,
      updated,
      errors,
      details: details.slice(0, 100), // Cap detail output
    })
  } catch (error: any) {
    console.error('Error during recalculation:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to recalculate orders' },
      { status: 500 }
    )
  }
}
