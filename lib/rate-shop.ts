import type { PrismaClient } from '@prisma/client'
import { matchSkuToSize, type ProductSize } from './products'

const SHIPENGINE_API_KEY = process.env.SHIPENGINE_API_KEY
const SHIPENGINE_RATES_URL = 'https://api.shipengine.com/v1/rates'

// ============================================================================
// Types
// ============================================================================

export interface ShipToAddress {
  name?: string
  company?: string
  street1: string
  street2?: string
  city: string
  state: string
  postalCode: string
  country?: string
  phone?: string
  residential?: boolean
}

export interface ShipFromAddress {
  name?: string
  company?: string
  street1: string
  street2?: string
  city: string
  state: string
  postalCode: string
  country?: string
  phone?: string
}

export interface OrderItem {
  sku?: string
  name?: string
  quantity?: number
}

export interface RateShopResult {
  success: boolean
  rate?: {
    rateId: string
    carrierId: string
    carrierCode: string
    carrier: string
    serviceCode: string
    serviceName: string
    price: number
    currency: string
    deliveryDays: number | null
    estimatedDeliveryDate: string | null
  }
  error?: string
  totalWeightLbs?: number
}

export interface RateShopperProfile {
  id: string
  name: string
  services: Array<{
    carrierId: string
    carrierCode?: string
    carrierName: string
    serviceCode: string
    serviceName: string
  }>
  transitTimeRestriction?: string | null
  preferenceEnabled: boolean
  preferredServiceCode?: string | null
  preferenceType?: string | null
  preferenceValue?: number | null
}

// ============================================================================
// Order Classification
// ============================================================================

export type OrderType = 'SINGLE' | 'BULK' | 'EXPEDITED' | 'ERROR'

/**
 * Check if an order is expedited (UPS Next Day, 2 Day, 3 Day, etc.)
 */
export function isExpeditedOrder(rawPayload: any): boolean {
  const order = Array.isArray(rawPayload) ? rawPayload[0] : rawPayload
  const serviceCode = order?.requestedShippingService || order?.shippingService || ''
  const serviceName = (serviceCode || '').toUpperCase()

  const expeditedKeywords = [
    'NEXT DAY', 'OVERNIGHT', 'EXPRESS', '2 DAY', '2-DAY', 'TWO DAY',
    '3 DAY', '3-DAY', 'THREE DAY', 'PRIORITY OVERNIGHT', 'STANDARD OVERNIGHT',
    '2ND DAY', '3RD DAY', 'NEXT_DAY', 'SECOND_DAY', 'THIRD_DAY'
  ]

  return expeditedKeywords.some(keyword => serviceName.includes(keyword))
}

/**
 * Check if an order is a single-item order (1 item type, quantity 1)
 */
export function isSingleItemOrder(items: OrderItem[]): boolean {
  // Filter out insurance items
  const nonInsuranceItems = items.filter(item => {
    const sku = (item.sku || '').toUpperCase()
    const name = (item.name || '').toUpperCase()
    return !sku.includes('INSURANCE') && !sku.includes('SHIPPING') && !name.includes('INSURANCE')
  })

  if (nonInsuranceItems.length !== 1) return false

  const item = nonInsuranceItems[0]
  return (item.quantity || 1) === 1
}

/**
 * Classify an order based on its contents and shipping service
 */
export function classifyOrder(rawPayload: any): OrderType {
  const order = Array.isArray(rawPayload) ? rawPayload[0] : rawPayload
  const items = order?.items || []

  // Check expedited first (takes priority)
  if (isExpeditedOrder(rawPayload)) {
    return 'EXPEDITED'
  }

  // Check if single item
  if (isSingleItemOrder(items)) {
    return 'SINGLE'
  }

  // Everything else is bulk (will be grouped later)
  return 'BULK'
}

// ============================================================================
// Weight Calculation
// ============================================================================

/**
 * Calculate total shipment weight: box weight + sum of (product weight × quantity)
 */
export async function calculateShipmentWeight(
  prisma: PrismaClient,
  items: OrderItem[],
  boxWeightLbs: number
): Promise<number> {
  let productWeight = 0

  for (const item of items) {
    const sku = item.sku || ''
    const qty = item.quantity || 1

    // Skip insurance items
    const skuUpper = sku.toUpperCase()
    const nameUpper = (item.name || '').toUpperCase()
    if (skuUpper.includes('INSURANCE') || skuUpper.includes('SHIPPING') || nameUpper.includes('INSURANCE')) {
      continue
    }

    // Look up product size to get weight
    const productSize = await matchSkuToSize(prisma, sku)
    if (productSize) {
      productWeight += productSize.weightLbs * qty
    }
  }

  return boxWeightLbs + productWeight
}

// ============================================================================
// Address Normalization (copied from get-rates route)
// ============================================================================

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
    'WISCONSIN': 'WI', 'WYOMING': 'WY',
    'DISTRICT OF COLUMBIA': 'DC', 'PUERTO RICO': 'PR', 'GUAM': 'GU',
    'AMERICAN SAMOA': 'AS', 'U.S. VIRGIN ISLANDS': 'VI', 'VIRGIN ISLANDS': 'VI',
    'NORTHERN MARIANA ISLANDS': 'MP',
  }

  return stateMap[s] || state.trim()
}

function normalizeCountryCode(country: string | undefined | null): string {
  if (!country) return 'US'

  const c = country.trim().toUpperCase()

  if (c.length === 2) return c

  const countryMap: Record<string, string> = {
    'UNITED STATES': 'US', 'UNITED STATES OF AMERICA': 'US', 'USA': 'US',
    'U.S.A.': 'US', 'U.S.': 'US', 'AMERICA': 'US',
    'CANADA': 'CA', 'MEXICO': 'MX', 'UNITED KINGDOM': 'GB', 'UK': 'GB',
    'GREAT BRITAIN': 'GB', 'ENGLAND': 'GB', 'AUSTRALIA': 'AU', 'GERMANY': 'DE',
    'FRANCE': 'FR', 'ITALY': 'IT', 'SPAIN': 'ES', 'JAPAN': 'JP', 'CHINA': 'CN',
    'INDIA': 'IN', 'BRAZIL': 'BR', 'NETHERLANDS': 'NL', 'SWITZERLAND': 'CH',
    'SWEDEN': 'SE', 'NORWAY': 'NO', 'DENMARK': 'DK', 'FINLAND': 'FI',
    'IRELAND': 'IE', 'NEW ZEALAND': 'NZ', 'SINGAPORE': 'SG', 'HONG KONG': 'HK',
    'SOUTH KOREA': 'KR', 'KOREA': 'KR', 'TAIWAN': 'TW', 'BELGIUM': 'BE',
    'AUSTRIA': 'AT', 'PORTUGAL': 'PT', 'POLAND': 'PL', 'GREECE': 'GR',
    'ISRAEL': 'IL', 'SOUTH AFRICA': 'ZA', 'ARGENTINA': 'AR', 'CHILE': 'CL',
    'COLOMBIA': 'CO', 'PERU': 'PE', 'PHILIPPINES': 'PH', 'THAILAND': 'TH',
    'VIETNAM': 'VN', 'MALAYSIA': 'MY', 'INDONESIA': 'ID', 'PUERTO RICO': 'PR',
  }

  return countryMap[c] || 'US'
}

// ============================================================================
// Rate Shopping
// ============================================================================

/**
 * Get the default RateShopper profile
 */
export async function getDefaultRateShopper(prisma: PrismaClient): Promise<RateShopperProfile | null> {
  const rateShopper = await prisma.rateShopper.findFirst({
    where: { isDefault: true, active: true },
  })

  if (!rateShopper) {
    // Fall back to any active rate shopper
    const anyRateShopper = await prisma.rateShopper.findFirst({
      where: { active: true },
    })

    if (!anyRateShopper) return null

    return {
      id: anyRateShopper.id,
      name: anyRateShopper.name,
      services: anyRateShopper.services as RateShopperProfile['services'],
      transitTimeRestriction: anyRateShopper.transitTimeRestriction,
      preferenceEnabled: anyRateShopper.preferenceEnabled,
      preferredServiceCode: anyRateShopper.preferredServiceCode,
      preferenceType: anyRateShopper.preferenceType,
      preferenceValue: anyRateShopper.preferenceValue,
    }
  }

  return {
    id: rateShopper.id,
    name: rateShopper.name,
    services: rateShopper.services as RateShopperProfile['services'],
    transitTimeRestriction: rateShopper.transitTimeRestriction,
    preferenceEnabled: rateShopper.preferenceEnabled,
    preferredServiceCode: rateShopper.preferredServiceCode,
    preferenceType: rateShopper.preferenceType,
    preferenceValue: rateShopper.preferenceValue,
  }
}

/**
 * Get the default ship-from location
 */
export async function getDefaultLocation(prisma: PrismaClient): Promise<ShipFromAddress | null> {
  const location = await prisma.location.findFirst({
    where: { isDefault: true, active: true },
  }) || await prisma.location.findFirst({
    where: { active: true },
  })

  if (!location) return null

  return {
    name: location.name,
    company: location.company || undefined,
    street1: location.addressLine1,
    street2: location.addressLine2 || undefined,
    city: location.city,
    state: location.state,
    postalCode: location.postalCode,
    country: location.country,
    phone: location.phone,
  }
}

/**
 * Perform rate shopping for an order using the default RateShopper profile
 */
export async function shopRates(
  prisma: PrismaClient,
  shipTo: ShipToAddress,
  weightLbs: number,
  dimensions: { length: number; width: number; height: number },
  rateShopper: RateShopperProfile
): Promise<RateShopResult> {
  try {
    if (!SHIPENGINE_API_KEY) {
      return { success: false, error: 'ShipEngine API key not configured' }
    }

    // Get default location
    const shipFrom = await getDefaultLocation(prisma)
    if (!shipFrom) {
      return { success: false, error: 'No ship-from location configured' }
    }

    // Validate ship-to address
    if (!shipTo.street1 || !shipTo.city || !shipTo.postalCode) {
      return { success: false, error: 'Invalid ship-to address: missing required fields' }
    }

    // Extract carrier IDs and service codes from rate shopper profile
    const carrierIds = Array.from(new Set(rateShopper.services.map(s => s.carrierId)))
    const serviceCodes = rateShopper.services.map(s => s.serviceCode)

    if (carrierIds.length === 0) {
      return { success: false, error: 'No carriers configured in rate shopper profile' }
    }

    // Build the rate request
    const shipToCountry = normalizeCountryCode(shipTo.country)
    const shipFromCountry = normalizeCountryCode(shipFrom.country)

    const rateRequest = {
      shipment: {
        validate_address: 'no_validation',
        ship_to: {
          name: shipTo.name || 'Customer',
          address_line1: shipTo.street1,
          address_line2: shipTo.street2,
          city_locality: shipTo.city,
          state_province: normalizeStateCode(shipTo.state, shipToCountry),
          postal_code: shipTo.postalCode,
          country_code: shipToCountry,
          address_residential_indicator: shipTo.residential ? 'yes' : 'no',
          phone: shipTo.phone || '',
        },
        ship_from: {
          name: shipFrom.name || 'Warehouse',
          company_name: shipFrom.company,
          address_line1: shipFrom.street1,
          address_line2: shipFrom.street2,
          city_locality: shipFrom.city,
          state_province: normalizeStateCode(shipFrom.state, shipFromCountry),
          postal_code: shipFrom.postalCode,
          country_code: shipFromCountry,
          phone: shipFrom.phone || '',
        },
        packages: [{
          weight: {
            value: weightLbs,
            unit: 'pound',
          },
          dimensions: {
            length: dimensions.length,
            width: dimensions.width,
            height: dimensions.height,
            unit: 'inch',
          },
        }],
      },
      rate_options: {
        carrier_ids: carrierIds,
      },
    }

    // Call ShipEngine API
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
      const errorMessage = data.message || data.errors?.[0]?.message || `ShipEngine error (${response.status})`
      return { success: false, error: errorMessage, totalWeightLbs: weightLbs }
    }

    // Filter rates to only include services from the rate shopper profile
    let rates = (data.rate_response?.rates || [])
      .filter((rate: any) => serviceCodes.includes(rate.service_code))
      .map((rate: any) => ({
        rateId: rate.rate_id,
        carrierId: rate.carrier_id,
        carrierCode: rate.carrier_code,
        carrier: rate.carrier_friendly_name,
        serviceCode: rate.service_code,
        serviceName: rate.service_type,
        price: rate.shipping_amount?.amount || 0,
        currency: rate.shipping_amount?.currency || 'USD',
        deliveryDays: rate.delivery_days,
        estimatedDeliveryDate: rate.estimated_delivery_date,
        attributes: rate.rate_attributes || [],
      }))

    // Apply transit time restriction if set
    if (rateShopper.transitTimeRestriction && rateShopper.transitTimeRestriction !== 'no_restriction') {
      const maxDays = parseInt(rateShopper.transitTimeRestriction.replace('_days', '').replace('_day', ''))
      if (!isNaN(maxDays)) {
        rates = rates.filter((rate: any) => rate.deliveryDays && rate.deliveryDays <= maxDays)
      }
    }

    if (rates.length === 0) {
      return { success: false, error: 'No rates available for the selected services', totalWeightLbs: weightLbs }
    }

    // Sort by price (cheapest first)
    rates.sort((a: any, b: any) => a.price - b.price)

    // Apply preference if enabled
    let selectedRate = rates[0]

    if (rateShopper.preferenceEnabled && rateShopper.preferredServiceCode) {
      const preferredRate = rates.find((r: any) => r.serviceCode === rateShopper.preferredServiceCode)

      if (preferredRate && rateShopper.preferenceValue) {
        const cheapestPrice = rates[0].price
        const preferredPrice = preferredRate.price

        let withinTolerance = false
        if (rateShopper.preferenceType === 'dollar') {
          withinTolerance = (preferredPrice - cheapestPrice) <= rateShopper.preferenceValue
        } else if (rateShopper.preferenceType === 'percentage') {
          const percentDiff = ((preferredPrice - cheapestPrice) / cheapestPrice) * 100
          withinTolerance = percentDiff <= rateShopper.preferenceValue
        }

        if (withinTolerance) {
          selectedRate = preferredRate
        }
      }
    }

    return {
      success: true,
      rate: {
        rateId: selectedRate.rateId,
        carrierId: selectedRate.carrierId,
        carrierCode: selectedRate.carrierCode,
        carrier: selectedRate.carrier,
        serviceCode: selectedRate.serviceCode,
        serviceName: selectedRate.serviceName,
        price: selectedRate.price,
        currency: selectedRate.currency,
        deliveryDays: selectedRate.deliveryDays,
        estimatedDeliveryDate: selectedRate.estimatedDeliveryDate,
      },
      totalWeightLbs: weightLbs,
    }
  } catch (error: any) {
    console.error('Rate shopping error:', error)
    return { success: false, error: error.message || 'Rate shopping failed', totalWeightLbs: weightLbs }
  }
}

/**
 * Get the singles carrier setting (default: USPS First Class Mail)
 */
export async function getSinglesCarrier(prisma: PrismaClient): Promise<{
  carrierId: string
  carrierCode: string
  carrier: string
  serviceCode: string
  serviceName: string
} | null> {
  const setting = await prisma.appSetting.findUnique({
    where: { key: 'singles_carrier' },
  })

  if (setting?.value && typeof setting.value === 'object') {
    return setting.value as any
  }

  // Return default USPS First Class Mail
  return {
    carrierId: '', // Will be filled in when actually used
    carrierCode: 'usps',
    carrier: 'USPS',
    serviceCode: 'usps_first_class_mail',
    serviceName: 'USPS First Class Mail',
  }
}
