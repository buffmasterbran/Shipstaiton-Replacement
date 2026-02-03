import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const SHIPENGINE_API_KEY = process.env.SHIPENGINE_API_KEY
const SHIPENGINE_RATES_URL = 'https://api.shipengine.com/v1/rates'

// Normalize US state to 2-letter code
function normalizeStateCode(state: string | undefined | null, countryCode: string): string {
  if (!state) return ''
  
  const s = state.trim().toUpperCase()
  
  // Already a 2-letter code
  if (s.length === 2) return s
  
  // Only normalize for US states
  if (countryCode !== 'US') return state.trim()
  
  const stateMap: Record<string, string> = {
    'ALABAMA': 'AL',
    'ALASKA': 'AK',
    'ARIZONA': 'AZ',
    'ARKANSAS': 'AR',
    'CALIFORNIA': 'CA',
    'COLORADO': 'CO',
    'CONNECTICUT': 'CT',
    'DELAWARE': 'DE',
    'FLORIDA': 'FL',
    'GEORGIA': 'GA',
    'HAWAII': 'HI',
    'IDAHO': 'ID',
    'ILLINOIS': 'IL',
    'INDIANA': 'IN',
    'IOWA': 'IA',
    'KANSAS': 'KS',
    'KENTUCKY': 'KY',
    'LOUISIANA': 'LA',
    'MAINE': 'ME',
    'MARYLAND': 'MD',
    'MASSACHUSETTS': 'MA',
    'MICHIGAN': 'MI',
    'MINNESOTA': 'MN',
    'MISSISSIPPI': 'MS',
    'MISSOURI': 'MO',
    'MONTANA': 'MT',
    'NEBRASKA': 'NE',
    'NEVADA': 'NV',
    'NEW HAMPSHIRE': 'NH',
    'NEW JERSEY': 'NJ',
    'NEW MEXICO': 'NM',
    'NEW YORK': 'NY',
    'NORTH CAROLINA': 'NC',
    'NORTH DAKOTA': 'ND',
    'OHIO': 'OH',
    'OKLAHOMA': 'OK',
    'OREGON': 'OR',
    'PENNSYLVANIA': 'PA',
    'RHODE ISLAND': 'RI',
    'SOUTH CAROLINA': 'SC',
    'SOUTH DAKOTA': 'SD',
    'TENNESSEE': 'TN',
    'TEXAS': 'TX',
    'UTAH': 'UT',
    'VERMONT': 'VT',
    'VIRGINIA': 'VA',
    'WASHINGTON': 'WA',
    'WEST VIRGINIA': 'WV',
    'WISCONSIN': 'WI',
    'WYOMING': 'WY',
    // Territories
    'DISTRICT OF COLUMBIA': 'DC',
    'PUERTO RICO': 'PR',
    'GUAM': 'GU',
    'AMERICAN SAMOA': 'AS',
    'U.S. VIRGIN ISLANDS': 'VI',
    'VIRGIN ISLANDS': 'VI',
    'NORTHERN MARIANA ISLANDS': 'MP',
  }
  
  return stateMap[s] || state.trim()
}

// Normalize country to 2-letter ISO code
function normalizeCountryCode(country: string | undefined | null): string {
  if (!country) return 'US'
  
  const c = country.trim().toUpperCase()
  
  // Already a 2-letter code
  if (c.length === 2) return c
  
  // Common country name mappings
  const countryMap: Record<string, string> = {
    'UNITED STATES': 'US',
    'UNITED STATES OF AMERICA': 'US',
    'USA': 'US',
    'U.S.A.': 'US',
    'U.S.': 'US',
    'AMERICA': 'US',
    'CANADA': 'CA',
    'MEXICO': 'MX',
    'UNITED KINGDOM': 'GB',
    'UK': 'GB',
    'GREAT BRITAIN': 'GB',
    'ENGLAND': 'GB',
    'AUSTRALIA': 'AU',
    'GERMANY': 'DE',
    'FRANCE': 'FR',
    'ITALY': 'IT',
    'SPAIN': 'ES',
    'JAPAN': 'JP',
    'CHINA': 'CN',
    'INDIA': 'IN',
    'BRAZIL': 'BR',
    'NETHERLANDS': 'NL',
    'SWITZERLAND': 'CH',
    'SWEDEN': 'SE',
    'NORWAY': 'NO',
    'DENMARK': 'DK',
    'FINLAND': 'FI',
    'IRELAND': 'IE',
    'NEW ZEALAND': 'NZ',
    'SINGAPORE': 'SG',
    'HONG KONG': 'HK',
    'SOUTH KOREA': 'KR',
    'KOREA': 'KR',
    'TAIWAN': 'TW',
    'BELGIUM': 'BE',
    'AUSTRIA': 'AT',
    'PORTUGAL': 'PT',
    'POLAND': 'PL',
    'GREECE': 'GR',
    'ISRAEL': 'IL',
    'SOUTH AFRICA': 'ZA',
    'ARGENTINA': 'AR',
    'CHILE': 'CL',
    'COLOMBIA': 'CO',
    'PERU': 'PE',
    'PHILIPPINES': 'PH',
    'THAILAND': 'TH',
    'VIETNAM': 'VN',
    'MALAYSIA': 'MY',
    'INDONESIA': 'ID',
    'PUERTO RICO': 'PR',
  }
  
  return countryMap[c] || 'US'
}

export async function POST(request: NextRequest) {
  try {
    if (!SHIPENGINE_API_KEY) {
      return NextResponse.json(
        { error: 'ShipEngine API key not configured' },
        { status: 500 }
      )
    }

    const body = await request.json()

    // Get ship_from from request body, or fall back to default location from database
    let shipFrom = body.shipFrom
    if (!shipFrom || !shipFrom.street1) {
      try {
        // Try to get the default location from the database
        const defaultLocation = await prisma.location.findFirst({
          where: { isDefault: true, active: true },
        }) || await prisma.location.findFirst({
          where: { active: true },
        })

        if (defaultLocation) {
          shipFrom = {
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
        }
      } catch (dbError) {
        console.error('Error fetching default location:', dbError)
        // Continue with provided shipFrom or defaults
      }
    }

    // Build the rate request
    const rateRequest: any = {
      shipment: {
        validate_address: 'no_validation',
        ship_to: (() => {
          const countryCode = normalizeCountryCode(body.shipTo?.country)
          return {
            name: body.shipTo?.name || 'Customer',
            address_line1: body.shipTo?.street1 || '',
            address_line2: body.shipTo?.street2,
            city_locality: body.shipTo?.city || '',
            state_province: normalizeStateCode(body.shipTo?.state, countryCode),
            postal_code: body.shipTo?.postalCode || '',
            country_code: countryCode,
            address_residential_indicator: body.shipTo?.residential ? 'yes' : 'no',
            phone: body.shipTo?.phone || '',
          }
        })(),
        ship_from: (() => {
          const countryCode = normalizeCountryCode(shipFrom?.country)
          return {
            name: shipFrom?.name || 'Warehouse',
            company_name: shipFrom?.company,
            address_line1: shipFrom?.street1 || '',
            address_line2: shipFrom?.street2,
            city_locality: shipFrom?.city || '',
            state_province: normalizeStateCode(shipFrom?.state, countryCode),
            postal_code: shipFrom?.postalCode || '',
            country_code: countryCode,
            phone: shipFrom?.phone || '',
          }
        })(),
        packages: (body.packages || []).map((pkg: any) => ({
          weight: {
            value: pkg.weight?.value || 1,
            unit: pkg.weight?.unit || 'pound',
          },
          dimensions: pkg.dimensions
            ? {
                length: pkg.dimensions.length,
                width: pkg.dimensions.width,
                height: pkg.dimensions.height,
                unit: pkg.dimensions.unit || 'inch',
              }
            : undefined,
        })),
      },
    }

    // Get carrier IDs and service codes from request or saved settings
    let carrierIds = body.carrierIds
    let serviceCodes = body.serviceCodes

    if ((!carrierIds || carrierIds.length === 0) && (!serviceCodes || serviceCodes.length === 0)) {
      try {
        // First, try to get selected services from app settings
        const selectedServicesSetting = await prisma.appSetting.findUnique({
          where: { key: 'selected_services' },
        })

        if (selectedServicesSetting?.value && 
            typeof selectedServicesSetting.value === 'object' &&
            'services' in selectedServicesSetting.value &&
            Array.isArray((selectedServicesSetting.value as any).services) &&
            (selectedServicesSetting.value as any).services.length > 0) {
          const services = (selectedServicesSetting.value as any).services
          // Extract unique carrier IDs and service codes
          carrierIds = Array.from(new Set(services.map((s: any) => s.carrierId))) as string[]
          serviceCodes = services.map((s: any) => s.serviceCode)
        } else {
          // Fall back to fetching all available carriers from ShipEngine
          const carriersResponse = await fetch('https://api.shipengine.com/v1/carriers', {
            headers: {
              'API-Key': SHIPENGINE_API_KEY,
            },
          })
          
          if (carriersResponse.ok) {
            const carriersData = await carriersResponse.json()
            carrierIds = (carriersData.carriers || []).map((c: any) => c.carrier_id)
          }
        }
      } catch (err) {
        console.error('Error fetching carriers/services:', err)
      }
    }

    // ShipEngine requires rate_options with carrier_ids
    // Note: ShipEngine doesn't support filtering by specific service codes in rate requests,
    // so we only pass carrier_ids to limit the query to relevant carriers.
    // The service-level filtering happens after we receive the results.
    if (carrierIds && carrierIds.length > 0) {
      rateRequest.rate_options = {
        carrier_ids: carrierIds,
      }
    } else {
      return NextResponse.json(
        { error: 'No carriers available. Please configure carriers in your ShipEngine account.' },
        { status: 400 }
      )
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
      console.error('ShipEngine Get Rates Error:', {
        status: response.status,
        error: data,
      })

      const errorMessage =
        data.message ||
        data.errors?.[0]?.message ||
        `Failed to fetch rates (Status: ${response.status})`

      return NextResponse.json({ error: errorMessage }, { status: response.status })
    }

    // Transform rates for frontend
    let rates = (data.rate_response?.rates || []).map((rate: any) => ({
      rateId: rate.rate_id,
      carrier: rate.carrier_friendly_name,
      carrierCode: rate.carrier_code,
      carrierId: rate.carrier_id,
      serviceCode: rate.service_code,
      serviceName: rate.service_type,
      price: rate.shipping_amount?.amount || 0,
      currency: rate.shipping_amount?.currency || 'USD',
      deliveryDays: rate.delivery_days,
      estimatedDeliveryDate: rate.estimated_delivery_date,
      trackable: rate.trackable,
      attributes: rate.rate_attributes || [], // ['cheapest', 'fastest', 'best_value']
      validationStatus: rate.validation_status,
      warningMessages: rate.warning_messages || [],
      errorMessages: rate.error_messages || [],
    }))

    // Filter rates to only include selected services (if we have service codes selected)
    if (serviceCodes && serviceCodes.length > 0) {
      rates = rates.filter((rate: any) => serviceCodes.includes(rate.serviceCode))
    }

    // Sort: best_value first, then cheapest to most expensive
    rates.sort((a: any, b: any) => {
      if (a.attributes.includes('best_value')) return -1
      if (b.attributes.includes('best_value')) return 1
      return a.price - b.price
    })

    return NextResponse.json({
      rates,
      invalidRates: data.rate_response?.invalid_rates || [],
      shipmentId: data.rate_response?.shipment_id,
      rateRequestId: data.rate_response?.rate_request_id,
      filteredByServices: serviceCodes && serviceCodes.length > 0,
      selectedServiceCount: serviceCodes?.length || 0,
    })
  } catch (error: any) {
    console.error('ShipEngine Get Rates Error:', error)
    return NextResponse.json(
      {
        error: error.message || 'An error occurred while fetching rates',
      },
      { status: 500 }
    )
  }
}
