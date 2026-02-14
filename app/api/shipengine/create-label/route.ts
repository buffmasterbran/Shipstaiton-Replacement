import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const SHIPENGINE_API_KEY = process.env.SHIPENGINE_API_KEY
const SHIPENGINE_API_URL = 'https://api.shipengine.com/v1/labels'
const SHIPENGINE_CARRIERS_URL = 'https://api.shipengine.com/v1/carriers'

// Normalize country to 2-letter ISO code (ShipEngine requires exactly 2 chars)
function normalizeCountryCode(country?: string): string {
  const c = (country || 'US').trim().toUpperCase()
  const map: Record<string, string> = {
    'UNITED STATES': 'US', 'USA': 'US', 'U.S.A.': 'US', 'U.S.': 'US',
    'CANADA': 'CA', 'MEXICO': 'MX', 'UNITED KINGDOM': 'GB', 'UK': 'GB',
    'AUSTRALIA': 'AU', 'GERMANY': 'DE', 'FRANCE': 'FR', 'JAPAN': 'JP',
  }
  return map[c] || (c.length === 2 ? c : 'US')
}

// Map our service codes to ShipEngine service codes
// Note: If the service code is already in ShipEngine format, it will pass through
const serviceCodeMap: { [key: string]: string } = {
  'usps_priority': 'usps_priority_mail',
  'usps_first_class': 'usps_first_class_mail',
  'usps_priority_mail_express': 'usps_priority_mail_express',
  'usps_ground_advantage': 'usps_ground_advantage',
  'ups_ground': 'ups_ground',
  'ups_2nd_day_air': 'ups_2nd_day_air',
  'fedex_ground': 'fedex_ground',
}

export async function POST(request: NextRequest) {
  try {
    if (!SHIPENGINE_API_KEY) {
      console.error('[ShipEngine Label] API key not configured!')
      return NextResponse.json(
        { error: 'ShipEngine API key not configured' },
        { status: 500 }
      )
    }

    const body = await request.json()
    console.log('[ShipEngine Label] ---- INCOMING REQUEST ----')
    console.log('[ShipEngine Label] Body:', JSON.stringify(body, null, 2))

    // Step 0: If shipFrom is missing or incomplete, load default location from DB
    if (!body.shipFrom || !body.shipFrom.street1) {
      console.log('[ShipEngine Label] No shipFrom provided, loading default location from DB...')
      try {
        const defaultLocation = await prisma.location.findFirst({
          where: { isDefault: true, active: true },
        }) || await prisma.location.findFirst({
          where: { active: true },
        })

        if (defaultLocation) {
          body.shipFrom = {
            name: defaultLocation.name,
            company: defaultLocation.company,
            street1: defaultLocation.addressLine1,
            street2: defaultLocation.addressLine2,
            city: defaultLocation.city,
            state: defaultLocation.state,
            postalCode: defaultLocation.postalCode,
            country: defaultLocation.country,
            phone: defaultLocation.phone,
          }
          console.log(`[ShipEngine Label] Using location: ${defaultLocation.name} (${defaultLocation.city}, ${defaultLocation.state})`)
        } else {
          console.error('[ShipEngine Label] No locations configured in database!')
          return NextResponse.json(
            { error: 'No ship-from location configured. Add one in Settings > Locations.' },
            { status: 400 }
          )
        }
      } catch (dbErr: any) {
        console.error('[ShipEngine Label] DB error loading location:', dbErr.message)
      }
    }

    // Step 1: Find carrier ID
    let carrierId: string | undefined = body.carrierId
    
    if (!carrierId) {
      console.log('[ShipEngine Label] No carrierId provided, looking up carriers...')
      try {
        const carriersResponse = await fetch(SHIPENGINE_CARRIERS_URL, {
          headers: { 'API-Key': SHIPENGINE_API_KEY },
        })
        
        if (carriersResponse.ok) {
          const carriersData = await carriersResponse.json()
          const allCarriers = carriersData.carriers || []
          console.log(`[ShipEngine Label] Found ${allCarriers.length} carrier(s):`, allCarriers.map((c: any) => `${c.carrier_code} (${c.friendly_name}) [${c.carrier_id}]`))

          // Try to match the carrier from the request, or fall back to USPS
          const requestedCarrier = (body.serviceCode || '').split('_')[0]?.toLowerCase()
          let matchedCarrier = null

          if (requestedCarrier) {
            matchedCarrier = allCarriers.find((c: any) => {
              const code = (c.carrier_code || '').toLowerCase()
              const name = (c.friendly_name || '').toLowerCase()
              return code.includes(requestedCarrier) || name.includes(requestedCarrier)
            })
          }

          if (!matchedCarrier) {
            // Fall back to USPS/stamps_com
            matchedCarrier = allCarriers.find((c: any) =>
              c.carrier_code === 'stamps_com' || c.carrier_code === 'usps' || c.friendly_name?.toLowerCase().includes('usps')
            )
          }

          if (matchedCarrier) {
            carrierId = matchedCarrier.carrier_id
            console.log(`[ShipEngine Label] Using carrier: ${matchedCarrier.friendly_name} (${matchedCarrier.carrier_id})`)
          } else {
            console.warn('[ShipEngine Label] No matching carrier found!')
          }
        } else {
          console.error(`[ShipEngine Label] Carrier lookup failed: ${carriersResponse.status} ${carriersResponse.statusText}`)
        }
      } catch (err: any) {
        console.error('[ShipEngine Label] Carrier lookup error:', err.message)
      }
    } else {
      console.log(`[ShipEngine Label] Using provided carrierId: ${carrierId}`)
    }

    // Step 2: Map service code
    const mappedServiceCode = serviceCodeMap[body.serviceCode] || body.serviceCode || 'usps_ground_advantage'
    console.log(`[ShipEngine Label] Service code: ${body.serviceCode} -> ${mappedServiceCode}`)

    // Step 3: Build ShipEngine request
    const shipEngineRequest: any = {
      shipment: {
        service_code: mappedServiceCode,
        ship_to: {
          name: body.shipTo.name,
          company_name: body.shipTo.company || undefined,
          address_line1: body.shipTo.street1,
          address_line2: body.shipTo.street2 || undefined,
          city_locality: body.shipTo.city,
          state_province: body.shipTo.state,
          postal_code: body.shipTo.postalCode,
          country_code: normalizeCountryCode(body.shipTo.country),
          phone: body.shipTo.phone || undefined,
          address_residential_indicator: 'yes',
        },
        ship_from: {
          name: body.shipFrom.name,
          company_name: body.shipFrom.company || undefined,
          address_line1: body.shipFrom.street1,
          address_line2: body.shipFrom.street2 || undefined,
          city_locality: body.shipFrom.city,
          state_province: body.shipFrom.state,
          postal_code: body.shipFrom.postalCode,
          country_code: normalizeCountryCode(body.shipFrom.country),
          phone: body.shipFrom.phone || undefined,
          address_residential_indicator: 'no',
        },
        packages: [
          {
            weight: {
              value: body.weight.value,
              unit: body.weight.unit || 'pound',
            },
            dimensions: {
              length: body.dimensions.length,
              width: body.dimensions.width,
              height: body.dimensions.height,
              unit: body.dimensions.unit || 'inch',
            },
            package_code: body.packageCode || 'package',
            ...(body.labelMessages && (body.labelMessages.reference1 || body.labelMessages.reference2 || body.labelMessages.reference3) ? {
              label_messages: {
                ...(body.labelMessages.reference1 && { reference1: body.labelMessages.reference1.substring(0, 60) }),
                ...(body.labelMessages.reference2 && { reference2: body.labelMessages.reference2.substring(0, 60) }),
                ...(body.labelMessages.reference3 && { reference3: body.labelMessages.reference3.substring(0, 60) }),
              },
            } : {}),
          },
        ],
        label_format: 'pdf',
      },
    }

    if (carrierId) {
      shipEngineRequest.shipment.carrier_id = carrierId
    }

    // Step 4: Send to ShipEngine
    console.log('[ShipEngine Label] ---- SENDING TO SHIPENGINE ----')
    console.log('[ShipEngine Label] POST', SHIPENGINE_API_URL)
    console.log('[ShipEngine Label] Request body:', JSON.stringify(shipEngineRequest, null, 2))

    const response = await fetch(SHIPENGINE_API_URL, {
      method: 'POST',
      headers: {
        'API-Key': SHIPENGINE_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(shipEngineRequest),
    })

    const data = await response.json()

    // Step 5: Log response
    console.log('[ShipEngine Label] ---- RESPONSE ----')
    console.log(`[ShipEngine Label] Status: ${response.status} ${response.statusText}`)

    if (!response.ok) {
      const errorDetail = data.errors
        ? data.errors.map((e: any) => `${e.error_source}: ${e.message}`).join('; ')
        : data.message || data.error?.message || 'Unknown error'
      console.error(`[ShipEngine Label] FAILED: ${errorDetail}`)
      console.error('[ShipEngine Label] Full error response:', JSON.stringify(data, null, 2))
      return NextResponse.json(
        { error: errorDetail, details: data },
        { status: response.status }
      )
    }

    // Success — log key info
    console.log(`[ShipEngine Label] SUCCESS!`)
    console.log(`[ShipEngine Label]   Label ID: ${data.label_id}`)
    console.log(`[ShipEngine Label]   Tracking: ${data.tracking_number}`)
    console.log(`[ShipEngine Label]   Cost: $${data.shipment_cost?.amount || data.insurance_cost?.amount || '?'}`)
    console.log(`[ShipEngine Label]   Label URL: ${data.label_download?.pdf || data.label_download?.href || 'N/A'}`)
    console.log(`[ShipEngine Label]   Status: ${data.status}`)

    return NextResponse.json(data)
  } catch (error: any) {
    console.error('[ShipEngine Label] EXCEPTION:', error.message)
    console.error('[ShipEngine Label] Stack:', error.stack)
    return NextResponse.json(
      { error: error.message || 'An error occurred while creating the label' },
      { status: 500 }
    )
  }
}

