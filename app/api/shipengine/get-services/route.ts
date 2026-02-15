import { NextRequest, NextResponse } from 'next/server'

const SHIPENGINE_API_KEY = process.env.SHIPENGINE_API_KEY
const SHIPENGINE_RATES_URL = 'https://api.shipengine.com/v1/rates'
const SHIPENGINE_CARRIERS_URL = 'https://api.shipengine.com/v1/carriers'

export async function POST(request: NextRequest) {
  try {
    if (!SHIPENGINE_API_KEY) {
      console.error('[ShipEngine Services] API key not configured!')
      return NextResponse.json(
        { error: 'ShipEngine API key not configured' },
        { status: 500 }
      )
    }

    const body = await request.json()

    // First, try to get services from carriers endpoint (more reliable)
    let services: Array<{ service_code: string; service_name: string; carrier: string }> = []
    
    try {
      const carriersResponse = await fetch(SHIPENGINE_CARRIERS_URL, {
        headers: { 'API-Key': SHIPENGINE_API_KEY },
      })

      if (carriersResponse.ok) {
        const carriersData = await carriersResponse.json()
        const allCarriers = carriersData.carriers || []

        // Get services for ALL carriers
        for (const carrier of allCarriers) {
          try {
            const servicesResponse = await fetch(`${SHIPENGINE_CARRIERS_URL}/${carrier.carrier_id}/services`, {
              headers: { 'API-Key': SHIPENGINE_API_KEY },
            })

            if (servicesResponse.ok) {
              const servicesData = await servicesResponse.json()
              if (servicesData.services) {
                const carrierServices = servicesData.services
                  .filter((s: any) => s.domestic === true)
                  .map((s: any) => ({
                    service_code: s.service_code,
                    service_name: s.name,
                    carrier: carrier.friendly_name || carrier.carrier_code,
                  }))
                services.push(...carrierServices)
              }
            }
          } catch (err: any) {
            console.warn(`[ShipEngine Services] Could not fetch services for ${carrier.friendly_name}: ${err.message}`)
          }
        }
      } else {
        console.error(`[ShipEngine Services] Carriers fetch failed: ${carriersResponse.status}`)
      }
    } catch (err: any) {
      console.error(`[ShipEngine Services] Carrier lookup error: ${err.message}`)
    }

    // If we got services from carriers endpoint, return them
    if (services.length > 0) {
      return NextResponse.json({
        services,
        source: 'carriers_endpoint',
      })
    }

    // Fallback: Use rate shopping to get available services for this shipment
    const rateRequest = {
      shipment: {
        ship_to: {
          name: body.shipTo?.name || 'Test',
          address_line1: body.shipTo?.street1 || '123 Main St',
          city_locality: body.shipTo?.city || 'Austin',
          state_province: body.shipTo?.state || 'TX',
          postal_code: body.shipTo?.postalCode || '78701',
          country_code: body.shipTo?.country || 'US',
        },
        ship_from: {
          name: body.shipFrom?.name || 'Test Company',
          address_line1: body.shipFrom?.street1 || '456 Business Ave',
          city_locality: body.shipFrom?.city || 'Austin',
          state_province: body.shipFrom?.state || 'TX',
          postal_code: body.shipFrom?.postalCode || '78702',
          country_code: body.shipFrom?.country || 'US',
        },
        packages: [
          {
            weight: {
              value: body.weight?.value || 0.7,
              unit: body.weight?.unit || 'pound',
            },
            dimensions: {
              length: body.dimensions?.length || 7,
              width: body.dimensions?.width || 7,
              height: body.dimensions?.height || 2.5,
              unit: body.dimensions?.unit || 'inch',
            },
          },
        ],
      },
    }

    const response = await fetch(SHIPENGINE_RATES_URL, {
      method: 'POST',
      headers: {
        'API-Key': SHIPENGINE_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(rateRequest),
    })

    const data = await response.json()

    if (!response.ok) {
      // Log the error for debugging
      console.error('ShipEngine Rate Shopping Error:', {
        status: response.status,
        error: data,
      })
      
      // Provide more detailed error message
      const errorMessage = data.message || 
        data.errors?.[0]?.message || 
        `Failed to fetch services (Status: ${response.status})`
      
      return NextResponse.json(
        { error: errorMessage },
        { status: response.status }
      )
    }

    // Extract unique service codes from rate responses
    const rateServicesMap = new Map<string, { service_code: string; service_name: string; carrier: string }>()
    
    if (data.rate_response?.rates) {
      data.rate_response.rates.forEach((rate: any) => {
        if (rate.service_code && rate.service_name) {
          const key = `${rate.carrier_code}_${rate.service_code}`
          if (!rateServicesMap.has(key)) {
            rateServicesMap.set(key, {
              service_code: rate.service_code,
              service_name: rate.service_name,
              carrier: rate.carrier_friendly_name || rate.carrier_code,
            })
          }
        }
      })
    }

    const rateServices = Array.from(rateServicesMap.values())
    
    return NextResponse.json({
      services: rateServices,
      source: 'rate_shopping',
      rawResponse: data,
    })
  } catch (error: any) {
    console.error('ShipEngine Get Services Error:', error)
    return NextResponse.json(
      {
        error: error.message || 'An error occurred while fetching services',
      },
      { status: 500 }
    )
  }
}

