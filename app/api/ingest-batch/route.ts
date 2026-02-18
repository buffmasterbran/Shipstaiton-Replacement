import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { OrderStatus } from '@prisma/client'
import { getBoxes, getFeedbackRules, getPackingEfficiency, findBestBox, calculateBoxSuggestion } from '@/lib/box-config'
import { getProductSizes, matchSkuToSize, recordUnmatchedSkus, ProductSize } from '@/lib/products'
import {
  classifyOrder,
  calculateShipmentWeight,
  getDefaultRateShopper,
  shopRates,
  getSinglesCarrier,
  type OrderType,
  type ShipToAddress,
} from '@/lib/rate-shop'
import { validateAddress } from '@/lib/address-validation'

// Rate shopping result stored on order
interface PreShoppedRate {
  carrierId: string
  carrierCode: string
  carrier: string
  serviceCode: string
  serviceName: string
  price: number
  currency: string
  deliveryDays: number | null
  rateId?: string
}

function validateAuth(request: NextRequest): { valid: boolean; error?: string } {
  // Support both Basic Auth (like ShipStation) and x-api-secret header
  const authHeader = request.headers.get('authorization')
  const apiSecretHeader = request.headers.get('x-api-secret')

  // Method 1: Basic Authentication (ShipStation style)
  if (authHeader && authHeader.startsWith('Basic ')) {
    const base64Credentials = authHeader.split(' ')[1]
    try {
      const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8')
      const [apiKey, apiSecret] = credentials.split(':')

      const expectedApiKey = process.env.API_KEY
      const expectedApiSecret = process.env.API_SECRET

      if (!expectedApiKey || !expectedApiSecret) {
        return {
          valid: false,
          error: 'Server configuration error: API_KEY and API_SECRET must be set',
        }
      }

      if (apiKey === expectedApiKey && apiSecret === expectedApiSecret) {
        return { valid: true }
      }

      return {
        valid: false,
        error: 'Unauthorized: Invalid API key or secret',
      }
    } catch (error) {
      return {
        valid: false,
        error: 'Unauthorized: Invalid Basic Auth format',
      }
    }
  }

  // Method 2: x-api-secret header (backward compatibility)
  if (apiSecretHeader) {
    const expectedSecret = process.env.API_SECRET

    if (!expectedSecret) {
      return {
        valid: false,
        error: 'Server configuration error: API_SECRET must be set',
      }
    }

    if (apiSecretHeader === expectedSecret) {
      return { valid: true }
    }

    return {
      valid: false,
      error: 'Unauthorized: Invalid API secret',
    }
  }

  return {
    valid: false,
    error: 'Unauthorized: Missing authentication. Use Basic Auth or x-api-secret header',
  }
}

export async function POST(request: NextRequest) {
  try {
    // Security: Validate authentication
    const authResult = validateAuth(request)
    if (!authResult.valid) {
      return NextResponse.json({ error: authResult.error }, { status: 401 })
    }

    // Parse request body
    const body = await request.json()

    // Normalize polymorphic input: single object or array
    let orders: any[] = []
    if (Array.isArray(body)) {
      orders = body
    } else if (typeof body === 'object' && body !== null) {
      orders = [body]
    } else {
      return NextResponse.json(
        { error: 'Invalid request body: expected object or array' },
        { status: 400 }
      )
    }

    // Filter out wholesale/B2B orders (NetSuite Sales Orders start with "SO")
    // Shopify orders start with "#" - we only want those
    const originalCount = orders.length
    orders = orders.filter(order => {
      const orderNumber = String(
        order.order_number ||
        order.orderNumber ||
        order.order_id ||
        order.id ||
        order.number ||
        ''
      )
      // Skip orders that start with "SO" (NetSuite Sales Orders = wholesale)
      if (orderNumber.toUpperCase().startsWith('SO')) {
        return false
      }
      return true
    })
    
    const skippedCount = originalCount - orders.length

    // Load box config data, rate shopping config, shipping method mappings, and weight rules once for all orders
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

    // Build a lookup map for shipping method mappings (lowercase incoming name -> mapping)
    const mappingLookup = new Map<string, typeof shippingMethodMappings[0]>()
    for (const m of shippingMethodMappings) {
      mappingLookup.set(m.incomingName.toLowerCase(), m)
    }

    // Collect all unmatched SKUs across orders
    const allUnmatchedSkus: Array<{ sku: string; orderNumber: string; itemName: string | null }> = []

    // Validate and transform orders with box suggestions and rate shopping
    const orderLogs = await Promise.all(orders.map(async (order) => {
      // Extract order_number from the JSON payload
      const orderNumber =
        order.order_number ||
        order.orderNumber ||
        order.order_id ||
        order.id ||
        order.number ||
        'UNKNOWN'

      const logPrefix = `[Ingest ${orderNumber}]`

      // Calculate box suggestion based on items
      const items = order.items || []
      const { suggestedBox, unmatchedSkus } = await calculateBoxSuggestion(prisma, items, sizes, boxes, feedbackRules, packingEfficiency)

      // Collect unmatched SKUs with order context
      for (const unmatched of unmatchedSkus) {
        allUnmatchedSkus.push({
          sku: unmatched.sku,
          orderNumber: String(orderNumber),
          itemName: unmatched.itemName,
        })
      }

      // Kick off address validation in parallel (non-blocking)
      const shipToRaw = order.shipTo || {}
      const addressValidationPromise = validateAddress({
        name: shipToRaw.name || order.billTo?.name || '',
        company: shipToRaw.company || '',
        street1: shipToRaw.street1 || shipToRaw.address1 || '',
        street2: shipToRaw.street2 || shipToRaw.address2 || '',
        city: shipToRaw.city || '',
        state: shipToRaw.state || '',
        postalCode: shipToRaw.postalCode || shipToRaw.zip || '',
        country: shipToRaw.country || 'US',
      }).catch((err) => {
        console.error(`${logPrefix} Address validation failed:`, err.message)
        return null
      })

      // Check for personalization flag from NetSuite
      const isPersonalized = !!(
        order.isPersonalized ||
        order.personalized ||
        order.customization ||
        order.engravingText ||
        (order.items || []).some((item: any) =>
          item.isPersonalized || item.personalized || item.customization || item.engravingText
        )
      )

      // Initialize rate shopping fields
      let preShoppedRate: PreShoppedRate | null = null
      let shippedWeight: number | null = null
      let rateShopStatus: string = 'SKIPPED'
      let rateShopError: string | null = null

      // ======================================================================
      // STEP 1: Check shipping method mappings BEFORE classification
      // If the incoming requestedShippingService matches a mapping, use that
      // mapped carrier/service and bypass weight rules + rate shopping.
      // ======================================================================
      const requestedService = (
        order.requestedShippingService ||
        order.shippingMethod ||
        ''
      ).trim()

      const matchedMapping = requestedService
        ? mappingLookup.get(requestedService.toLowerCase())
        : undefined

      let orderType: string

      // Helper: determine if this mapping says to fall through to weight rules
      const mappingUsesWeightRules = matchedMapping?.targetType === 'weight_rules'
      const mappingUsesRateShopper = matchedMapping?.targetType === 'rate_shopper'
      const mappingUsesService = matchedMapping?.targetType === 'service' || (matchedMapping && !matchedMapping.targetType)

      if (matchedMapping && mappingUsesService) {
        // Shipping method mapping matched → use mapped carrier/service directly
        orderType = matchedMapping.isExpedited
          ? 'EXPEDITED'
          : classifyOrder(order)

        preShoppedRate = {
          carrierId: matchedMapping.carrierId || '',
          carrierCode: matchedMapping.carrierCode || '',
          carrier: (matchedMapping.serviceName || '').split(' ')[0] || matchedMapping.carrierCode || '',
          serviceCode: matchedMapping.serviceCode || '',
          serviceName: matchedMapping.serviceName || '',
          price: 0,
          currency: 'USD',
          deliveryDays: null,
        }
        rateShopStatus = 'MAPPED'
      } else if (matchedMapping && mappingUsesRateShopper && matchedMapping.rateShopperId) {
        // Shipping method mapping matched → use mapping's rate shopper
        orderType = matchedMapping.isExpedited
          ? 'EXPEDITED'
          : classifyOrder(order)

        // Only rate shop for non-expedited, or if explicitly mapped
        const mappingRateShopper = matchedMapping.rateShopper
        if (mappingRateShopper && mappingRateShopper.active && suggestedBox.boxId && suggestedBox.lengthInches && suggestedBox.widthInches && suggestedBox.heightInches) {
          const boxWeight = suggestedBox.weightLbs || 0
          const calcWeight = await calculateShipmentWeight(prisma, items, boxWeight)
          shippedWeight = calcWeight

          const rsProfile = {
            id: mappingRateShopper.id,
            name: mappingRateShopper.name,
            services: mappingRateShopper.services as any,
            transitTimeRestriction: mappingRateShopper.transitTimeRestriction,
            preferenceEnabled: mappingRateShopper.preferenceEnabled,
            preferredServiceCode: mappingRateShopper.preferredServiceCode,
            preferenceType: mappingRateShopper.preferenceType,
            preferenceValue: mappingRateShopper.preferenceValue,
          }

          const shipTo = order.shipTo || {}
          const shipToAddress: ShipToAddress = {
            name: shipTo.name || order.billTo?.name,
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
            calcWeight,
            {
              length: suggestedBox.lengthInches,
              width: suggestedBox.widthInches,
              height: suggestedBox.heightInches,
            },
            rsProfile
          )

          if (rateResult.success && rateResult.rate) {
            preShoppedRate = {
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
            rateShopStatus = 'SUCCESS'
          } else {
            rateShopStatus = 'FAILED'
            rateShopError = rateResult.error || 'Mapping rate shopping failed'
          }
        } else if (!mappingRateShopper || !mappingRateShopper.active) {
          rateShopStatus = 'FAILED'
          rateShopError = 'Mapped rate shopper is inactive or missing'
        } else {
          rateShopStatus = 'FAILED'
          rateShopError = 'No box suggestion available for rate shopping'
        }
      } else {
        // No mapping, or mapping says "use weight rules" → classify and continue
        if (matchedMapping && mappingUsesWeightRules) {
          // Mapping explicitly routes to weight rules
          orderType = matchedMapping.isExpedited
            ? 'EXPEDITED'
            : classifyOrder(order)
        } else {
          // No mapping at all
          orderType = classifyOrder(order)
        }

        // ======================================================================
        // STEP 2b: Check weight rules (only for non-expedited orders)
        // If a weight rule matches, use the rule's target carrier/service or rate shopper.
        // ======================================================================
        let weightRuleMatched = false

        if (orderType !== 'EXPEDITED' && weightRules.length > 0 && suggestedBox.boxId) {
          // Calculate weight for weight-rule matching
          const boxWeight = suggestedBox.weightLbs || 0
          const calcWeight = await calculateShipmentWeight(prisma, items, boxWeight)
          const weightOz = calcWeight * 16 // Convert lbs to oz for matching

          // Find matching weight rule
          const matchedRule = weightRules.find(
            (wr) => weightOz >= wr.minOz && weightOz < wr.maxOz
          )

          if (matchedRule) {
            shippedWeight = calcWeight

            if (matchedRule.targetType === 'service' && matchedRule.serviceCode) {
              // Direct carrier/service assignment
              preShoppedRate = {
                carrierId: matchedRule.carrierId || '',
                carrierCode: matchedRule.carrierCode || '',
                carrier: (matchedRule.serviceName || '').split(' ')[0] || matchedRule.carrierCode || '',
                serviceCode: matchedRule.serviceCode,
                serviceName: matchedRule.serviceName || '',
                price: 0,
                currency: 'USD',
                deliveryDays: null,
              }
              rateShopStatus = 'SUCCESS'
              weightRuleMatched = true
            } else if (matchedRule.targetType === 'rate_shopper' && matchedRule.rateShopperId && matchedRule.rateShopper?.active) {
              // Rate shop using the rule's rate shopper
              const ruleRateShopper = await prisma.rateShopper.findUnique({
                where: { id: matchedRule.rateShopperId },
              })

              if (ruleRateShopper && ruleRateShopper.active && suggestedBox.lengthInches && suggestedBox.widthInches && suggestedBox.heightInches) {
                const rsProfile = {
                  id: ruleRateShopper.id,
                  name: ruleRateShopper.name,
                  services: ruleRateShopper.services as any,
                  transitTimeRestriction: ruleRateShopper.transitTimeRestriction,
                  preferenceEnabled: ruleRateShopper.preferenceEnabled,
                  preferredServiceCode: ruleRateShopper.preferredServiceCode,
                  preferenceType: ruleRateShopper.preferenceType,
                  preferenceValue: ruleRateShopper.preferenceValue,
                }

                const shipTo = order.shipTo || {}
                const shipToAddress: ShipToAddress = {
                  name: shipTo.name || order.billTo?.name,
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
                  calcWeight,
                  {
                    length: suggestedBox.lengthInches,
                    width: suggestedBox.widthInches,
                    height: suggestedBox.heightInches,
                  },
                  rsProfile
                )

                if (rateResult.success && rateResult.rate) {
                  preShoppedRate = {
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
                  rateShopStatus = 'SUCCESS'
                  weightRuleMatched = true
                } else {
                  rateShopStatus = 'FAILED'
                  rateShopError = rateResult.error || 'Weight rule rate shopping failed'
                  weightRuleMatched = true
                }
              }
            }
          }
        }

        // ======================================================================
        // STEP 3: If no weight rule matched, fall back to normal handling
        // ======================================================================
        if (!weightRuleMatched && orderType === 'SINGLE') {
          // Singles use fixed carrier (USPS First Class Mail by default)
          if (singlesCarrier && singlesCarrier.carrierId) {
            preShoppedRate = {
              carrierId: singlesCarrier.carrierId,
              carrierCode: singlesCarrier.carrierCode,
              carrier: singlesCarrier.carrier,
              serviceCode: singlesCarrier.serviceCode,
              serviceName: singlesCarrier.serviceName,
              price: 0,
              currency: 'USD',
              deliveryDays: null,
            }
            rateShopStatus = 'SUCCESS'
          } else {
            rateShopStatus = 'FAILED'
            rateShopError = singlesCarrier
              ? 'Singles carrier has no carrier ID configured. Go to Settings > Singles Carrier and re-select the carrier.'
              : 'Singles carrier not configured. Go to Settings to configure.'
          }
        } else if (!weightRuleMatched && orderType === 'EXPEDITED') {
          // Expedited orders (matched by keyword in classifyOrder) keep their original carrier
          rateShopStatus = 'SKIPPED'
        } else if (!weightRuleMatched && orderType === 'BULK') {
          // Bulk orders need rate shopping
          if (!rateShopper) {
            rateShopStatus = 'SKIPPED'
          } else if (!suggestedBox.boxId || !suggestedBox.lengthInches || !suggestedBox.widthInches || !suggestedBox.heightInches) {
            rateShopStatus = 'FAILED'
            rateShopError = 'No box suggestion available for rate shopping'
          } else {
            // Calculate shipment weight (box + products)
            const boxWeight = suggestedBox.weightLbs || 0
            shippedWeight = await calculateShipmentWeight(prisma, items, boxWeight)

            // Get ship-to address from order
            const shipTo = order.shipTo || {}
            const shipToAddress: ShipToAddress = {
              name: shipTo.name || order.billTo?.name,
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

            // Perform rate shopping
            const rateResult = await shopRates(
              prisma,
              shipToAddress,
              shippedWeight,
              {
                length: suggestedBox.lengthInches,
                width: suggestedBox.widthInches,
                height: suggestedBox.heightInches,
              },
              rateShopper
            )

            if (rateResult.success && rateResult.rate) {
              preShoppedRate = {
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
              rateShopStatus = 'SUCCESS'
            } else {
              rateShopStatus = 'FAILED'
              rateShopError = rateResult.error || 'Unknown rate shopping error'
            }
          }
        }
      }

      // Await address validation result (already running in parallel)
      const addrResult = await addressValidationPromise
      const addressValidated = addrResult?.status === 'verified'

      return {
        orderNumber: String(orderNumber),
        status: OrderStatus.AWAITING_SHIPMENT,
        rawPayload: order,
        suggestedBox: suggestedBox as any,
        orderType,
        isPersonalized,
        shippedWeight,
        preShoppedRate: preShoppedRate as any,
        rateFetchedAt: rateShopStatus === 'SUCCESS' ? new Date() : null,
        rateShopStatus,
        rateShopError,
        addressValidated,
        addressOverridden: false,
      }
    }))

    // Record unmatched SKUs for tracking
    if (allUnmatchedSkus.length > 0) {
      await recordUnmatchedSkus(prisma, allUnmatchedSkus)
    }

    // Insert orders individually to get back internal IDs
    interface OrderResult {
      orderId: string
      success: boolean
      orderType?: string
      rateShopStatus?: string
      errorMessage?: string
    }

    const results: OrderResult[] = []
    let hasErrors = false

    for (const orderData of orderLogs) {
      try {
        // Check if order already exists
        const existing = await prisma.orderLog.findFirst({
          where: { orderNumber: orderData.orderNumber },
          select: { id: true },
        })

        if (existing) {
          // Order already exists - update rate shopping fields if needed
          await prisma.orderLog.update({
            where: { id: existing.id },
            data: {
              orderType: orderData.orderType,
              shippedWeight: orderData.shippedWeight,
              preShoppedRate: orderData.preShoppedRate,
              rateFetchedAt: orderData.rateFetchedAt,
              rateShopStatus: orderData.rateShopStatus,
              rateShopError: orderData.rateShopError,
              addressValidated: orderData.addressValidated,
            },
          })
          results.push({
            orderId: existing.id,
            success: true,
            orderType: orderData.orderType,
            rateShopStatus: orderData.rateShopStatus,
          })
        } else {
          // Create new order
          const created = await prisma.orderLog.create({
            data: orderData,
            select: { id: true },
          })

          results.push({
            orderId: created.id,
            success: true,
            orderType: orderData.orderType,
            rateShopStatus: orderData.rateShopStatus,
          })
        }
      } catch (err: any) {
        hasErrors = true
        results.push({
          orderId: '',
          success: false,
          errorMessage: err.message || 'Failed to create order',
        })
      }
    }

    return NextResponse.json(
      {
        hasErrors,
        results,
      },
      { status: 200 }
    )
  } catch (error: any) {
    console.error('Error ingesting batch orders:', error)
    return NextResponse.json(
      {
        error: 'Failed to ingest orders',
        details: error.message || 'Unknown error',
      },
      { status: 500 }
    )
  }
}
