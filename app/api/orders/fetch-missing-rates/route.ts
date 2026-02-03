import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSinglesCarrier } from '@/lib/rate-shop'

const SHIPENGINE_API_KEY = process.env.SHIPENGINE_API_KEY
const SHIPENGINE_RATES_URL = 'https://api.shipengine.com/v1/rates'

// Normalize country to 2-letter ISO code
function normalizeCountryCode(country: string | undefined | null): string {
  if (!country) return 'US'
  
  const c = country.trim().toUpperCase()
  if (c.length === 2) return c
  
  const countryMap: Record<string, string> = {
    'UNITED STATES': 'US', 'UNITED STATES OF AMERICA': 'US', 'USA': 'US',
    'U.S.A.': 'US', 'U.S.': 'US', 'AMERICA': 'US',
    'CANADA': 'CA', 'MEXICO': 'MX', 'UNITED KINGDOM': 'GB', 'UK': 'GB',
  }
  
  return countryMap[c] || 'US'
}

// Normalize US state to 2-letter code
function normalizeStateCode(state: string | undefined | null, countryCode: string): string {
  if (!state) return ''
  const s = state.trim().toUpperCase()
  if (s.length === 2) return s
  if (countryCode !== 'US') return state.trim()
  
  const stateMap: Record<string, string> = {
    'ALABAMA': 'AL', 'ALASKA': 'AK', 'ARIZONA': 'AZ', 'ARKANSAS': 'AR',
    'CALIFORNIA': 'CA', 'COLORADO': 'CO', 'CONNECTICUT': 'CT', 'DELAWARE': 'DE',
    'FLORIDA': 'FL', 'GEORGIA': 'GA', 'HAWAII': 'HI', 'IDAHO': 'ID',
    'ILLINOIS': 'IL', 'INDIANA': 'IN', 'IOWA': 'IA', 'KANSAS': 'KS',
    'KENTUCKY': 'KY', 'LOUISIANA': 'LA', 'MAINE': 'ME', 'MARYLAND': 'MD',
    'MASSACHUSETTS': 'MA', 'MICHIGAN': 'MI', 'MINNESOTA': 'MN', 'MISSISSIPPI': 'MS',
    'MISSOURI': 'MO', 'MONTANA': 'MT', 'NEBRASKA': 'NE', 'NEVADA': 'NV',
    'NEW HAMPSHIRE': 'NH', 'NEW JERSEY': 'NJ', 'NEW MEXICO': 'NM', 'NEW YORK': 'NY',
    'NORTH CAROLINA': 'NC', 'NORTH DAKOTA': 'ND', 'OHIO': 'OH', 'OKLAHOMA': 'OK',
    'OREGON': 'OR', 'PENNSYLVANIA': 'PA', 'RHODE ISLAND': 'RI', 'SOUTH CAROLINA': 'SC',
    'SOUTH DAKOTA': 'SD', 'TENNESSEE': 'TN', 'TEXAS': 'TX', 'UTAH': 'UT',
    'VERMONT': 'VT', 'VIRGINIA': 'VA', 'WASHINGTON': 'WA', 'WEST VIRGINIA': 'WV',
    'WISCONSIN': 'WI', 'WYOMING': 'WY', 'DISTRICT OF COLUMBIA': 'DC', 'PUERTO RICO': 'PR',
  }
  
  return stateMap[s] || state.trim()
}

// Fetch carrier IDs from ShipEngine
async function getCarrierIds(): Promise<string[]> {
  if (!SHIPENGINE_API_KEY) return []
  
  try {
    const response = await fetch('https://api.shipengine.com/v1/carriers', {
      headers: { 'API-Key': SHIPENGINE_API_KEY },
    })
    
    if (response.ok) {
      const data = await response.json()
      return (data.carriers || []).map((c: any) => c.carrier_id)
    }
  } catch (err) {
    console.error('Error fetching carriers:', err)
  }
  
  return []
}

// Fetch rate from ShipEngine for a specific order
async function fetchRateFromShipEngine(
  order: { rawPayload: any; suggestedBox: any },
  singlesCarrier: { carrierId: string; carrierCode: string; serviceCode: string },
  shipFrom: any,
  box: { lengthInches: number; widthInches: number; heightInches: number } | null,
  totalWeight: number,
  carrierIds: string[]
): Promise<{ price: number; deliveryDays: number | null; rateId: string | null } | null> {
  if (!SHIPENGINE_API_KEY) return null

  const payload = order.rawPayload as any
  const orderData = Array.isArray(payload) ? payload[0] : payload
  const shipTo = orderData?.shipTo || orderData?.shipping_address || {}

  // Determine which carrier IDs to use
  const requestCarrierIds = singlesCarrier.carrierId 
    ? [singlesCarrier.carrierId] 
    : carrierIds

  if (requestCarrierIds.length === 0) {
    console.error('No carrier IDs available for rate request')
    return null
  }

  // Build rate request
  const rateRequest: any = {
    shipment: {
      validate_address: 'no_validation',
      ship_to: (() => {
        const toCountry = normalizeCountryCode(shipTo.country || shipTo.country_code)
        return {
          name: shipTo.name || `${shipTo.first_name || ''} ${shipTo.last_name || ''}`.trim() || 'Customer',
          address_line1: shipTo.street1 || shipTo.address1 || shipTo.address_line1 || '',
          address_line2: shipTo.street2 || shipTo.address2 || shipTo.address_line2 || '',
          city_locality: shipTo.city || '',
          state_province: normalizeStateCode(shipTo.state || shipTo.province, toCountry),
          postal_code: shipTo.postalCode || shipTo.postal_code || shipTo.zip || '',
          country_code: toCountry,
          address_residential_indicator: 'yes',
        }
      })(),
      ship_from: (() => {
        const fromCountry = normalizeCountryCode(shipFrom?.country)
        return {
          name: shipFrom?.name || 'Warehouse',
          company_name: shipFrom?.company,
          address_line1: shipFrom?.addressLine1 || '',
          address_line2: shipFrom?.addressLine2 || '',
          city_locality: shipFrom?.city || '',
          state_province: normalizeStateCode(shipFrom?.state, fromCountry),
          postal_code: shipFrom?.postalCode || '',
          country_code: fromCountry,
          phone: shipFrom?.phone || '',
        }
      })(),
      packages: [{
        weight: {
          value: Math.max(totalWeight, 0.1), // Minimum weight
          unit: 'pound',
        },
        dimensions: box ? {
          length: box.lengthInches,
          width: box.widthInches,
          height: box.heightInches,
          unit: 'inch',
        } : undefined,
      }],
    },
    rate_options: {
      carrier_ids: requestCarrierIds,
    },
  }

  try {
    const response = await fetch(SHIPENGINE_RATES_URL, {
      method: 'POST',
      headers: {
        'API-Key': SHIPENGINE_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(rateRequest),
    })

    if (!response.ok) {
      const errorBody = await response.text()
      console.error('ShipEngine rate fetch failed:', response.status, errorBody)
      return null
    }

    const data = await response.json()
    const rates = data.rate_response?.rates || []

    // Find the rate matching our service code
    const matchingRate = rates.find((r: any) => r.service_code === singlesCarrier.serviceCode)
    
    if (matchingRate) {
      return {
        price: matchingRate.shipping_amount?.amount || 0,
        deliveryDays: matchingRate.delivery_days,
        rateId: matchingRate.rate_id,
      }
    }

    // If no exact match, use the cheapest rate from this carrier
    if (rates.length > 0) {
      const cheapest = rates.reduce((min: any, r: any) => 
        (r.shipping_amount?.amount || 0) < (min.shipping_amount?.amount || 0) ? r : min
      )
      return {
        price: cheapest.shipping_amount?.amount || 0,
        deliveryDays: cheapest.delivery_days,
        rateId: cheapest.rate_id,
      }
    }

    return null
  } catch (err) {
    console.error('Error fetching rate from ShipEngine:', err)
    return null
  }
}

/**
 * POST /api/orders/fetch-missing-rates
 *
 * Simplified API: Accepts order IDs from the UI and processes exactly those orders.
 * 
 * Request body:
 * - action: "set-service" | "get-rates"
 * - orderIds: string[] - IDs of orders to process (from UI's visible/filtered orders)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const action = body.action || 'set-service'
    const orderIds: string[] = body.orderIds || []

    console.log(`[fetch-missing-rates] Action: ${action}, Order IDs: ${orderIds.length}`)

    if (orderIds.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No orders to process',
        updated: 0,
        total: 0,
      })
    }

    // Get the singles carrier setting
    const singlesCarrier = await getSinglesCarrier(prisma)

    if (!singlesCarrier) {
      return NextResponse.json(
        { error: 'Singles carrier not configured. Go to Settings to configure.' },
        { status: 400 }
      )
    }

    // Fetch the specified orders by ID
    const orders = await prisma.orderLog.findMany({
      where: {
        id: { in: orderIds },
      },
      select: {
        id: true,
        orderNumber: true,
        rawPayload: true,
        suggestedBox: true,
      },
    })

    console.log(`[fetch-missing-rates] Found ${orders.length} orders in database`)

    if (orders.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No matching orders found',
        updated: 0,
        total: 0,
      })
    }

    // Get boxes to calculate weights and dimensions
    const boxes = await prisma.box.findMany({ where: { active: true } })

    // Get product sizes for weight calculation
    const productSkus = await prisma.productSku.findMany({
      include: { productSize: true },
    })

    // Get default ship-from location
    const shipFrom = await prisma.location.findFirst({
      where: { isDefault: true, active: true },
    }) || await prisma.location.findFirst({
      where: { active: true },
    })

    // Get carrier IDs for rate fetching (needed if singlesCarrier.carrierId is empty)
    let carrierIds: string[] = []
    if (action === 'get-rates' && !singlesCarrier.carrierId) {
      carrierIds = await getCarrierIds()
      if (carrierIds.length === 0) {
        return NextResponse.json(
          { error: 'No carriers available. Please configure carriers in your ShipEngine account.' },
          { status: 400 }
        )
      }
    }

    let updated = 0
    const errors: Array<{ orderNumber: string; error: string }> = []

    for (const order of orders) {
      try {
        const payload = order.rawPayload as any
        const orderData = Array.isArray(payload) ? payload[0] : payload
        const items = orderData?.items || []

        // Calculate weight from box + product
        let totalWeight = 0.5 // Default weight
        let boxDimensions: { lengthInches: number; widthInches: number; heightInches: number } | null = null

        // Try to get box weight and dimensions from suggested box
        const suggestedBox = order.suggestedBox as any
        if (suggestedBox?.boxId) {
          const box = boxes.find((b) => b.id === suggestedBox.boxId)
          if (box) {
            totalWeight = box.weightLbs
            boxDimensions = {
              lengthInches: box.lengthInches,
              widthInches: box.widthInches,
              heightInches: box.heightInches,
            }
          }
        }

        // Add product weights
        for (const item of items) {
          const sku = item.sku || ''
          const qty = item.quantity || 1

          // Skip insurance items
          const skuUpper = sku.toUpperCase()
          const nameUpper = (item.name || '').toUpperCase()
          if (skuUpper.includes('INSURANCE') || skuUpper.includes('SHIPPING') || nameUpper.includes('INSURANCE')) {
            continue
          }

          // Find matching product SKU
          const productSkuMatch = productSkus.find(ps =>
            sku.toLowerCase().includes(ps.sku.toLowerCase())
          )

          if (productSkuMatch?.productSize) {
            totalWeight += productSkuMatch.productSize.weightLbs * qty
          }
        }

        // Fetch rate from ShipEngine if action is 'get-rates'
        let price = 0
        let deliveryDays: number | null = null
        let rateId: string | null = null
        let rateFetched = false

        if (action === 'get-rates' && SHIPENGINE_API_KEY && shipFrom) {
          const rateResult = await fetchRateFromShipEngine(
            order,
            {
              carrierId: singlesCarrier.carrierId || '',
              carrierCode: singlesCarrier.carrierCode,
              serviceCode: singlesCarrier.serviceCode,
            },
            shipFrom,
            boxDimensions,
            totalWeight,
            carrierIds
          )

          if (rateResult) {
            price = rateResult.price
            deliveryDays = rateResult.deliveryDays
            rateId = rateResult.rateId
            rateFetched = true
          }
        }

        const preShoppedRate = {
          carrierId: singlesCarrier.carrierId || '',
          carrierCode: singlesCarrier.carrierCode,
          carrier: singlesCarrier.carrier,
          serviceCode: singlesCarrier.serviceCode,
          serviceName: singlesCarrier.serviceName,
          price: price,
          currency: 'USD',
          deliveryDays: deliveryDays,
          rateId: rateId,
        }

        // Update the order with the assigned carrier and rate
        await prisma.orderLog.update({
          where: { id: order.id },
          data: {
            preShoppedRate: preShoppedRate,
            shippedWeight: totalWeight,
            rateShopStatus: action === 'get-rates' ? (rateFetched ? 'SUCCESS' : 'FAILED') : 'ASSIGNED',
            rateShopError: action === 'get-rates' && !rateFetched ? 'Could not fetch rate from ShipEngine' : null,
            rateFetchedAt: new Date(),
          },
        })

        updated++
      } catch (err: any) {
        console.error(`[fetch-missing-rates] Error processing order ${order.orderNumber}:`, err)
        errors.push({
          orderNumber: order.orderNumber,
          error: err.message || 'Unknown error',
        })
      }
    }

    const actionMessage = action === 'get-rates' 
      ? `Fetched rates for ${updated} orders` 
      : `Assigned ${singlesCarrier.carrier} ${singlesCarrier.serviceName} to ${updated} orders`

    console.log(`[fetch-missing-rates] Complete: ${actionMessage}`)
    
    return NextResponse.json({
      success: true,
      message: actionMessage,
      action,
      updated,
      total: orders.length,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error: any) {
    console.error('[fetch-missing-rates] Error:', error)
    return NextResponse.json(
      { error: 'Failed to process orders', details: error.message },
      { status: 500 }
    )
  }
}
