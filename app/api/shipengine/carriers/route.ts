import { NextRequest, NextResponse } from 'next/server'

const SHIPENGINE_API_KEY = process.env.SHIPENGINE_API_KEY
const SHIPENGINE_CARRIERS_URL = 'https://api.shipengine.com/v1/carriers'

export async function GET(request: NextRequest) {
  try {
    if (!SHIPENGINE_API_KEY) {
      return NextResponse.json(
        { error: 'ShipEngine API key not configured' },
        { status: 500 }
      )
    }

    // Check if we should include services
    const { searchParams } = new URL(request.url)
    const includeServices = searchParams.get('includeServices') === 'true'

    const response = await fetch(SHIPENGINE_CARRIERS_URL, {
      method: 'GET',
      headers: {
        'API-Key': SHIPENGINE_API_KEY,
      },
    })

    if (!response.ok) {
      const errorData = await response.json()
      console.error('ShipEngine Carriers Error:', {
        status: response.status,
        error: errorData,
      })

      const errorMessage = errorData.message ||
        errorData.errors?.[0]?.message ||
        `Failed to fetch carriers (Status: ${response.status})`

      return NextResponse.json(
        { error: errorMessage },
        { status: response.status }
      )
    }

    const data = await response.json()
    let carriers = data.carriers || []

    // If requested, fetch services for each carrier
    if (includeServices) {
      carriers = await Promise.all(
        carriers.map(async (carrier: any) => {
          try {
            const servicesResponse = await fetch(
              `${SHIPENGINE_CARRIERS_URL}/${carrier.carrier_id}/services`,
              {
                headers: {
                  'API-Key': SHIPENGINE_API_KEY,
                },
              }
            )

            if (servicesResponse.ok) {
              const servicesData = await servicesResponse.json()
              return {
                ...carrier,
                services: servicesData.services || [],
              }
            }
          } catch (err) {
            console.error(`Error fetching services for carrier ${carrier.carrier_id}:`, err)
          }
          return carrier
        })
      )
    }

    return NextResponse.json({
      carriers,
      success: true,
    })
  } catch (error: any) {
    console.error('ShipEngine Carriers Error:', error)
    return NextResponse.json(
      {
        error: error.message || 'An error occurred while fetching carriers',
      },
      { status: 500 }
    )
  }
}
