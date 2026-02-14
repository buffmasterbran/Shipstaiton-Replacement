import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { OrderStatus } from '@prisma/client'
import { getBoxes, getFeedbackRules, getPackingEfficiency, findBestBox } from '@/lib/box-config'
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

// Type for the cached box suggestion
interface SuggestedBox {
  boxId: string | null
  boxName: string | null
  confidence: 'confirmed' | 'calculated' | 'unknown'
  reason?: string
  // Box dimensions and weight for rate shopping
  lengthInches?: number
  widthInches?: number
  heightInches?: number
  weightLbs?: number
}

// Result from calculateBoxSuggestion including unmatched SKUs
interface BoxSuggestionResult {
  suggestedBox: SuggestedBox
  unmatchedSkus: Array<{ sku: string; itemName: string | null }>
}

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

// Calculate box suggestion for an order's items
async function calculateBoxSuggestion(
  items: Array<{ sku?: string; quantity?: number; name?: string }>,
  sizes: ProductSize[],
  boxes: Awaited<ReturnType<typeof getBoxes>>,
  feedbackRules: Awaited<ReturnType<typeof getFeedbackRules>>,
  packingEfficiency: number,
  orderNumber?: string // For logging
): Promise<BoxSuggestionResult> {
  const unmatchedSkus: Array<{ sku: string; itemName: string | null }> = []
  const logPrefix = `[BoxSelect ${orderNumber || 'unknown'}]`

  if (!items || items.length === 0) {
    console.log(`${logPrefix} No items in order`)
    return { suggestedBox: { boxId: null, boxName: null, confidence: 'unknown' }, unmatchedSkus }
  }

  // Filter out insurance items
  const nonInsuranceItems = items.filter(item => {
    const sku = (item.sku || '').toUpperCase()
    const name = (item.name || '').toUpperCase()
    return !sku.includes('INSURANCE') && !sku.includes('SHIPPING') && !name.includes('INSURANCE')
  })

  if (nonInsuranceItems.length === 0) {
    console.log(`${logPrefix} All items filtered (insurance/shipping)`)
    return { suggestedBox: { boxId: null, boxName: null, confidence: 'unknown' }, unmatchedSkus }
  }

  // Map SKUs to product sizes
  const mappedItems: { productId: string; quantity: number; size: ProductSize }[] = []

  for (const item of nonInsuranceItems) {
    const sku = item.sku || ''
    const qty = Number(item.quantity) || 1

    const size = await matchSkuToSize(prisma, sku)
    if (size) {
      console.log(`${logPrefix} SKU "${sku}" → Size "${size.name}" (singleBoxId: ${size.singleBoxId || 'none'})`)
      mappedItems.push({ productId: size.id, quantity: qty, size })
    } else if (sku) {
      console.log(`${logPrefix} SKU "${sku}" → NO MATCH`)
      unmatchedSkus.push({ sku, itemName: item.name || null })
    }
  }

  if (mappedItems.length === 0) {
    // Check if all items are stickers (PL-STCK*)
    const allStickers = nonInsuranceItems.every(item => {
      const sku = (item.sku || '').toUpperCase()
      return sku.startsWith('PL-STCK')
    })

    if (allStickers && nonInsuranceItems.length > 0) {
      console.log(`${logPrefix} STICKER-ONLY ORDER: All ${nonInsuranceItems.length} item(s) are stickers`)
      // Find a box named "Stickers" (case-insensitive)
      const stickerBox = boxes.find(b => b.name.toLowerCase() === 'stickers' && b.active)
      if (stickerBox) {
        console.log(`${logPrefix} ✓ STICKER BOX FOUND: "${stickerBox.name}"`)
        return {
          suggestedBox: {
            boxId: stickerBox.id,
            boxName: stickerBox.name,
            confidence: 'confirmed',
            reason: 'sticker-only',
            lengthInches: stickerBox.lengthInches,
            widthInches: stickerBox.widthInches,
            heightInches: stickerBox.heightInches,
            weightLbs: stickerBox.weightLbs,
          },
          unmatchedSkus,
        }
      } else {
        console.log(`${logPrefix} WARNING: No "Stickers" box found in database. Available boxes: ${boxes.map(b => b.name).join(', ')}`)
      }
    }

    console.log(`${logPrefix} No items matched to product sizes`)
    return { suggestedBox: { boxId: null, boxName: null, confidence: 'unknown' }, unmatchedSkus }
  }

  // CHECK 1: Single item with dedicated box (singleBoxId)
  const totalQty = mappedItems.reduce((sum, i) => sum + i.quantity, 0)
  console.log(`${logPrefix} Mapped ${mappedItems.length} item type(s), totalQty=${totalQty}`)

  if (mappedItems.length === 1 && totalQty === 1) {
    const singleSize = mappedItems[0].size
    console.log(`${logPrefix} PATH A CHECK: Single item order. Size="${singleSize.name}", singleBoxId="${singleSize.singleBoxId || 'NOT SET'}"`)

    if (singleSize.singleBoxId) {
      const dedicatedBox = boxes.find(b => b.id === singleSize.singleBoxId && b.active)
      console.log(`${logPrefix} PATH A: Looking for box id="${singleSize.singleBoxId}". Found: ${dedicatedBox ? `"${dedicatedBox.name}" (active=${dedicatedBox.active})` : 'NOT FOUND'}`)

      if (dedicatedBox) {
        console.log(`${logPrefix} ✓ PATH A SUCCESS: Using dedicated box "${dedicatedBox.name}"`)
        return {
          suggestedBox: {
            boxId: dedicatedBox.id,
            boxName: dedicatedBox.name,
            confidence: 'confirmed',
            reason: 'dedicated-box',
            lengthInches: dedicatedBox.lengthInches,
            widthInches: dedicatedBox.widthInches,
            heightInches: dedicatedBox.heightInches,
            weightLbs: dedicatedBox.weightLbs,
          },
          unmatchedSkus,
        }
      } else {
        console.log(`${logPrefix} PATH A FAILED: Dedicated box not found or not active. Available boxes: ${boxes.map(b => `${b.id}(active=${b.active})`).join(', ')}`)
      }
    } else {
      console.log(`${logPrefix} PATH A SKIPPED: No singleBoxId set on product size`)
    }
  } else {
    console.log(`${logPrefix} PATH A SKIPPED: Not single item (types=${mappedItems.length}, qty=${totalQty})`)
  }

  // CHECK 2: Use standard box fitting algorithm
  console.log(`${logPrefix} PATH B: Using findBestBox algorithm`)
  const productItems = mappedItems.map(i => ({ productId: i.productId, quantity: i.quantity }))
  const result = findBestBox(productItems, sizes, boxes, feedbackRules, packingEfficiency)
  console.log(`${logPrefix} PATH B RESULT: box="${result.box?.name || 'none'}", confidence="${result.confidence}"`)

  return {
    suggestedBox: {
      boxId: result.box?.id || null,
      boxName: result.box?.name || null,
      confidence: result.confidence as 'confirmed' | 'calculated' | 'unknown',
      lengthInches: result.box?.lengthInches,
      widthInches: result.box?.widthInches,
      heightInches: result.box?.heightInches,
      weightLbs: result.box?.weightLbs,
    },
    unmatchedSkus,
  }
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
        console.log(`[Ingest] Skipping wholesale order: ${orderNumber}`)
        return false
      }
      return true
    })
    
    const skippedCount = originalCount - orders.length
    if (skippedCount > 0) {
      console.log(`[Ingest] Filtered out ${skippedCount} wholesale order(s) (SO prefix)`)
    }

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
    console.log(`[Ingest] Loaded ${shippingMethodMappings.length} active shipping method mappings, ${weightRules.length} active weight rules`)

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
      const { suggestedBox, unmatchedSkus } = await calculateBoxSuggestion(items, sizes, boxes, feedbackRules, packingEfficiency, String(orderNumber))

      // Collect unmatched SKUs with order context
      for (const unmatched of unmatchedSkus) {
        allUnmatchedSkus.push({
          sku: unmatched.sku,
          orderNumber: String(orderNumber),
          itemName: unmatched.itemName,
        })
      }

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
        console.log(`${logPrefix} Mapping matched (service): "${requestedService}" → ${matchedMapping.serviceName}${matchedMapping.isExpedited ? ' (EXPEDITED)' : ''}, orderType=${orderType}`)
      } else if (matchedMapping && mappingUsesRateShopper && matchedMapping.rateShopperId) {
        // Shipping method mapping matched → use mapping's rate shopper
        orderType = matchedMapping.isExpedited
          ? 'EXPEDITED'
          : classifyOrder(order)

        console.log(`${logPrefix} Mapping matched (rate_shopper): "${requestedService}" → Rate Shopper "${matchedMapping.rateShopper?.name || matchedMapping.rateShopperId}"${matchedMapping.isExpedited ? ' (EXPEDITED)' : ''}`)

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
            console.log(`${logPrefix} Mapping rate shop success: ${rateResult.rate.serviceName} $${rateResult.rate.price}`)
          } else {
            rateShopStatus = 'FAILED'
            rateShopError = rateResult.error || 'Mapping rate shopping failed'
            console.log(`${logPrefix} Mapping rate shop failed: ${rateShopError}`)
          }
        } else if (!mappingRateShopper || !mappingRateShopper.active) {
          rateShopStatus = 'FAILED'
          rateShopError = 'Mapped rate shopper is inactive or missing'
          console.log(`${logPrefix} Mapping rate shopper inactive/missing`)
        } else {
          rateShopStatus = 'FAILED'
          rateShopError = 'No box suggestion available for rate shopping'
          console.log(`${logPrefix} Mapping rate shop skipped: no box dimensions`)
        }
      } else {
        // No mapping, or mapping says "use weight rules" → classify and continue
        if (matchedMapping && mappingUsesWeightRules) {
          // Mapping explicitly routes to weight rules
          orderType = matchedMapping.isExpedited
            ? 'EXPEDITED'
            : classifyOrder(order)
          console.log(`${logPrefix} Mapping matched (weight_rules): "${requestedService}" → falling through to weight rules, orderType=${orderType}`)
        } else {
          // No mapping at all
          orderType = classifyOrder(order)
          console.log(`${logPrefix} Order type: ${orderType} (no shipping method mapping matched)`)
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
              console.log(`${logPrefix} Weight rule matched: ${weightOz.toFixed(1)} oz → ${matchedRule.serviceName} (direct service)`)
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
                  console.log(`${logPrefix} Weight rule matched: ${weightOz.toFixed(1)} oz → Rate Shopper "${ruleRateShopper.name}" → ${rateResult.rate.serviceName} $${rateResult.rate.price}`)
                } else {
                  rateShopStatus = 'FAILED'
                  rateShopError = rateResult.error || 'Weight rule rate shopping failed'
                  weightRuleMatched = true
                  console.log(`${logPrefix} Weight rule rate shop failed: ${rateShopError}`)
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
            console.log(`${logPrefix} Singles carrier set: ${singlesCarrier.serviceName}`)
          } else {
            rateShopStatus = 'FAILED'
            rateShopError = singlesCarrier
              ? 'Singles carrier has no carrier ID configured. Go to Settings > Singles Carrier and re-select the carrier.'
              : 'Singles carrier not configured. Go to Settings to configure.'
            console.log(`${logPrefix} Singles carrier ${singlesCarrier ? 'missing carrierId' : 'not configured'} - marking as FAILED`)
          }
        } else if (!weightRuleMatched && orderType === 'EXPEDITED') {
          // Expedited orders (matched by keyword in classifyOrder) keep their original carrier
          rateShopStatus = 'SKIPPED'
          console.log(`${logPrefix} Expedited order (keyword match) - skipping rate shopping`)
        } else if (!weightRuleMatched && orderType === 'BULK') {
          // Bulk orders need rate shopping
          if (!rateShopper) {
            rateShopStatus = 'SKIPPED'
            console.log(`${logPrefix} No rate shopper profile configured - skipping rate shopping`)
          } else if (!suggestedBox.boxId || !suggestedBox.lengthInches || !suggestedBox.widthInches || !suggestedBox.heightInches) {
            rateShopStatus = 'FAILED'
            rateShopError = 'No box suggestion available for rate shopping'
            console.log(`${logPrefix} Rate shopping failed: no box suggestion`)
          } else {
            // Calculate shipment weight (box + products)
            const boxWeight = suggestedBox.weightLbs || 0
            shippedWeight = await calculateShipmentWeight(prisma, items, boxWeight)
            console.log(`${logPrefix} Calculated weight: ${shippedWeight} lbs (box: ${boxWeight} lbs)`)

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
              console.log(`${logPrefix} Rate shopping success: ${rateResult.rate.carrier} ${rateResult.rate.serviceName} $${rateResult.rate.price}`)
            } else {
              rateShopStatus = 'FAILED'
              rateShopError = rateResult.error || 'Unknown rate shopping error'
              console.log(`${logPrefix} Rate shopping failed: ${rateShopError}`)
            }
          }
        }
      }

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


