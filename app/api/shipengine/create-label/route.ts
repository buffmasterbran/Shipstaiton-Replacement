import { NextRequest, NextResponse } from 'next/server'

const SHIPENGINE_API_KEY = process.env.SHIPENGINE_API_KEY || 'TEST_uhYzVt5jrvjfnn5hvcfI06gaVIU4tKpl6b7rZwRrVSs'
const SHIPENGINE_API_URL = 'https://api.shipengine.com/v1/labels'
const SHIPENGINE_CARRIERS_URL = 'https://api.shipengine.com/v1/carriers'

// Map our service codes to ShipEngine service codes
const serviceCodeMap: { [key: string]: string } = {
  'usps_priority': 'usps_priority_mail',
  'usps_first_class': 'usps_first_class_mail',
  'usps_priority_mail_express': 'usps_priority_mail_express',
  'ups_ground': 'ups_ground',
  'ups_2nd_day_air': 'ups_2nd_day_air',
  'fedex_ground': 'fedex_ground',
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // First, try to get carriers to find a valid carrier_id
    let carrierId: string | undefined = body.carrierId
    
    if (!carrierId) {
      try {
        const carriersResponse = await fetch(SHIPENGINE_CARRIERS_URL, {
          headers: {
            'API-Key': SHIPENGINE_API_KEY,
          },
        })
        
        if (carriersResponse.ok) {
          const carriersData = await carriersResponse.json()
          // Find USPS carrier (usually the first one or look for stamps_com)
          const uspsCarrier = carriersData.carriers?.find((c: any) => 
            c.carrier_code === 'stamps_com' || c.carrier_code === 'usps' || c.friendly_name?.toLowerCase().includes('usps')
          )
          if (uspsCarrier) {
            carrierId = uspsCarrier.carrier_id
            console.log('Found carrier:', uspsCarrier.carrier_id, uspsCarrier.friendly_name)
          }
        }
      } catch (err) {
        console.log('Could not fetch carriers, proceeding without carrier_id')
      }
    }

    // Map service code to ShipEngine format
    const mappedServiceCode = serviceCodeMap[body.serviceCode] || body.serviceCode || 'usps_priority_mail'

    // Transform the request to ShipEngine format
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
          country_code: body.shipTo.country || 'US',
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
          country_code: body.shipFrom.country || 'US',
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
          },
        ],
        label_format: 'pdf',
      },
    }

    // Add carrier_id if we found one
    if (carrierId) {
      shipEngineRequest.shipment.carrier_id = carrierId
    }

    // Log the request for debugging
    console.log('ShipEngine Request:', JSON.stringify(shipEngineRequest, null, 2))

    // Make request to ShipEngine
    const response = await fetch(SHIPENGINE_API_URL, {
      method: 'POST',
      headers: {
        'API-Key': SHIPENGINE_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(shipEngineRequest),
    })

    const data = await response.json()
    
    // Log the response for debugging
    console.log('ShipEngine Response Status:', response.status)
    console.log('ShipEngine Response:', JSON.stringify(data, null, 2))

    if (!response.ok) {
      return NextResponse.json(
        {
          error: data.message || data.error?.message || 'Failed to create label',
          request: shipEngineRequest,
          response: data,
        },
        { status: response.status }
      )
    }

    return NextResponse.json(data)
  } catch (error: any) {
    console.error('ShipEngine API Error:', error)
    return NextResponse.json(
      {
        error: error.message || 'An error occurred while creating the label',
      },
      { status: 500 }
    )
  }
}

