import {
  isDirectCarrier,
  validateDirectAddress,
} from '@/lib/shipping/provider-router'

const SE_KEY = process.env.SHIPENGINE_API_KEY || ''
const SE_BASE = 'https://api.shipengine.com/v1'

export interface AddressValidationResult {
  status: 'verified' | 'unverified' | 'warning' | 'error'
  originalAddress: Record<string, any>
  matchedAddress: Record<string, any> | null
  messages: Array<{ type: string; code: string; message: string }>
  classification?: string
  autoAccepted?: boolean
}

// ─── Smart auto-accept ───────────────────────────────────────────────────────
// Shared across ALL validation providers. If the only differences between
// the original and suggested address are cosmetic, auto-promote to "verified"
// so the user isn't prompted for every single order.

const STREET_ABBREVIATIONS: Record<string, string> = {
  STREET: 'ST', STR: 'ST', AVENUE: 'AVE', AV: 'AVE', BOULEVARD: 'BLVD',
  DRIVE: 'DR', DRIV: 'DR', LANE: 'LN', ROAD: 'RD', COURT: 'CT',
  CIRCLE: 'CIR', PLACE: 'PL', TERRACE: 'TER', TRAIL: 'TRL', WAY: 'WAY',
  HIGHWAY: 'HWY', PARKWAY: 'PKWY', PIKE: 'PIKE', SQUARE: 'SQ',
  NORTH: 'N', SOUTH: 'S', EAST: 'E', WEST: 'W',
  NORTHEAST: 'NE', NORTHWEST: 'NW', SOUTHEAST: 'SE', SOUTHWEST: 'SW',
  APARTMENT: 'APT', SUITE: 'STE', UNIT: 'UNIT', BUILDING: 'BLDG',
  FLOOR: 'FL', ROOM: 'RM', DEPARTMENT: 'DEPT',
}

function normalizeStreet(s: string): string {
  return s
    .trim()
    .toUpperCase()
    .replace(/[.,#\-]/g, '')
    .replace(/\s+/g, ' ')
    .split(' ')
    .map(word => STREET_ABBREVIATIONS[word] || word)
    .join(' ')
}

function normalizeBaseZip(zip: string): string {
  return zip.trim().split('-')[0].replace(/\s/g, '')
}

function normalizeCity(c: string): string {
  return c.trim().toUpperCase().replace(/[.,]/g, '').replace(/\s+/g, ' ')
}

/**
 * Determine whether the differences between original and suggested address
 * are trivial (abbreviations, casing, +4 zip extension).
 * If so, auto-accept the suggestion without prompting the user.
 */
function isAutoAcceptable(
  original: { street1?: string; street2?: string; city?: string; state?: string; postalCode?: string },
  matched: { street1?: string; street2?: string; city?: string; state?: string; postalCode?: string },
): boolean {
  const origStreet = normalizeStreet(original.street1 || '')
  const matchStreet = normalizeStreet(matched.street1 || '')
  const origStreet2 = normalizeStreet(original.street2 || '')
  const matchStreet2 = normalizeStreet(matched.street2 || '')
  const origCity = normalizeCity(original.city || '')
  const matchCity = normalizeCity(matched.city || '')
  const origState = (original.state || '').trim().toUpperCase()
  const matchState = (matched.state || '').trim().toUpperCase()
  const origZip = normalizeBaseZip(original.postalCode || '')
  const matchZip = normalizeBaseZip(matched.postalCode || '')

  if (origStreet !== matchStreet) return false
  if (origStreet2 !== matchStreet2) return false
  if (origCity !== matchCity) return false
  if (origState !== matchState) return false
  if (origZip !== matchZip) return false

  return true
}

/**
 * Post-process any validation result. If the status is "warning" but the
 * differences are only cosmetic, auto-promote to "verified" and silently
 * accept the matched address. Works for ShipEngine, UPS Direct, FedEx Direct.
 */
function applySmartAutoAccept(result: AddressValidationResult): AddressValidationResult {
  if (result.status !== 'warning' || !result.matchedAddress) return result

  const original = result.originalAddress as any
  const matched = result.matchedAddress as any

  if (isAutoAcceptable(original, matched)) {
    console.log('[Address Validation] Auto-accepting cosmetic changes (abbreviations/zip+4)')
    return {
      ...result,
      status: 'verified',
      autoAccepted: true,
      messages: [],
    }
  }

  return result
}

/**
 * Validate an address. If a direct carrier is assigned, routes through
 * UPS/FedEx direct API. Otherwise falls through to ShipEngine.
 */
export async function validateAddress(
  address: {
    name?: string
    company?: string
    street1: string
    street2?: string
    city: string
    state: string
    postalCode: string
    country?: string
    phone?: string
  },
  carrierInfo?: {
    carrierCode?: string
    carrierId?: string
  },
): Promise<AddressValidationResult> {
  // Route through direct carrier if assigned
  if (carrierInfo?.carrierCode && carrierInfo?.carrierId && isDirectCarrier(carrierInfo.carrierCode)) {
    console.log(`[Address Validation] Routing through direct carrier: ${carrierInfo.carrierCode}`)
    const directResult = await validateDirectAddress(
      carrierInfo.carrierId,
      carrierInfo.carrierCode,
      address,
    )
    return applySmartAutoAccept({
      status: directResult.status,
      originalAddress: directResult.originalAddress,
      matchedAddress: directResult.matchedAddress,
      messages: directResult.messages,
      classification: directResult.classification,
    })
  }

  // ShipEngine path
  const body = [
    {
      address_line1: address.street1 || '',
      address_line2: address.street2 || '',
      city_locality: address.city || '',
      state_province: address.state || '',
      postal_code: address.postalCode || '',
      country_code: address.country || 'US',
      name: address.name || '',
      company_name: address.company || '',
      phone: address.phone || '',
    },
  ]

  const res = await fetch(`${SE_BASE}/addresses/validate`, {
    method: 'POST',
    headers: {
      'API-Key': SE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error('[Address Validation] ShipEngine error:', err)
    return {
      status: 'error',
      originalAddress: address,
      matchedAddress: null,
      messages: [{ type: 'error', code: 'api_error', message: `ShipEngine returned ${res.status}` }],
    }
  }

  const data = await res.json()
  const result = data[0]

  const matched = result.matched_address
    ? {
        name: result.matched_address.name || address.name,
        company: result.matched_address.company_name || '',
        street1: result.matched_address.address_line1 || '',
        street2: result.matched_address.address_line2 || '',
        city: result.matched_address.city_locality || '',
        state: result.matched_address.state_province || '',
        postalCode: result.matched_address.postal_code || '',
        country: result.matched_address.country_code || 'US',
        phone: address.phone || '',
        residential: result.matched_address.address_residential_indicator === 'yes',
      }
    : null

  return applySmartAutoAccept({
    status: result.status as AddressValidationResult['status'],
    originalAddress: address,
    matchedAddress: matched,
    messages: (result.messages || []).map((m: any) => ({
      type: m.type || 'info',
      code: m.code || '',
      message: m.message || '',
    })),
  })
}
