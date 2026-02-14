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

    // Load all active mappings
    const mappings = await prisma.shippingMethodMapping.findMany({
      where: { isActive: true },
    })

    // Build a lookup map: lowercase incoming name -> mapping
    const mappingLookup = new Map<string, typeof mappings[0]>()
    for (const m of mappings) {
      mappingLookup.set(m.incomingName.toLowerCase(), m)
    }

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

        // Check if this order matches a shipping method mapping
        const matchedMapping = requestedService
          ? mappingLookup.get(requestedService.toLowerCase())
          : undefined

        if (matchedMapping) {
          // Mapping found - use mapped carrier/service
          const newOrderType = matchedMapping.isExpedited
            ? 'EXPEDITED'
            : isSingleItemOrder(items)
              ? 'SINGLE'
              : 'BULK'

          await prisma.orderLog.update({
            where: { id: order.id },
            data: {
              orderType: newOrderType,
              preShoppedRate: {
                carrierId: matchedMapping.carrierId,
                carrierCode: matchedMapping.carrierCode,
                carrier: matchedMapping.serviceName.split(' ')[0] || matchedMapping.carrierCode,
                serviceCode: matchedMapping.serviceCode,
                serviceName: matchedMapping.serviceName,
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
            action: `Mapped to ${matchedMapping.serviceName}${matchedMapping.isExpedited ? ' (expedited)' : ''}`,
          })
          updated++
        } else {
          // No mapping match - classify normally
          const orderType = isSingleItemOrder(items) ? 'SINGLE' : 'BULK'

          if (orderType === 'SINGLE') {
            // Singles use fixed carrier
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
          } else if (orderType === 'BULK') {
            // Bulk orders get rate shopped
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
              const box = order.suggestedBox as any
              if (!box?.lengthInches || !box?.widthInches || !box?.heightInches) {
                await prisma.orderLog.update({
                  where: { id: order.id },
                  data: {
                    orderType: 'BULK',
                    rateShopStatus: 'FAILED',
                    rateShopError: 'No box suggestion available for rate shopping',
                  },
                })
                details.push({ orderNumber: order.orderNumber, action: 'Bulk - no box dimensions' })
              } else {
                const boxWeight = box.weightLbs || 0
                const shippedWeight = await calculateShipmentWeight(prisma, items, boxWeight)

                const shipTo = orderData?.shipTo || {}
                const shipToAddress: ShipToAddress = {
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

                const rateResult = await shopRates(
                  prisma,
                  shipToAddress,
                  shippedWeight,
                  {
                    length: box.lengthInches,
                    width: box.widthInches,
                    height: box.heightInches,
                  },
                  rateShopper
                )

                if (rateResult.success && rateResult.rate) {
                  await prisma.orderLog.update({
                    where: { id: order.id },
                    data: {
                      orderType: 'BULK',
                      shippedWeight,
                      preShoppedRate: {
                        carrierId: rateResult.rate.carrierId,
                        carrierCode: rateResult.rate.carrierCode,
                        carrier: rateResult.rate.carrier,
                        serviceCode: rateResult.rate.serviceCode,
                        serviceName: rateResult.rate.serviceName,
                        price: rateResult.rate.price,
                        currency: rateResult.rate.currency,
                        deliveryDays: rateResult.rate.deliveryDays,
                        rateId: rateResult.rate.rateId,
                      },
                      rateFetchedAt: new Date(),
                      rateShopStatus: 'SUCCESS',
                      rateShopError: null,
                    },
                  })
                  details.push({ orderNumber: order.orderNumber, action: `Bulk → ${rateResult.rate.serviceName} $${rateResult.rate.price}` })
                } else {
                  await prisma.orderLog.update({
                    where: { id: order.id },
                    data: {
                      orderType: 'BULK',
                      rateShopStatus: 'FAILED',
                      rateShopError: rateResult.error || 'Unknown error',
                    },
                  })
                  details.push({ orderNumber: order.orderNumber, action: `Bulk - rate shop failed: ${rateResult.error}` })
                }
              }
            }
            updated++
          }
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
