/**
 * FedEx REST API OAuth2 Authentication, Connection Testing & Utilities
 *
 * Production: https://apis.fedex.com
 * Sandbox:    https://apis-sandbox.fedex.com
 *
 * OAuth2 client_credentials flow:
 *   POST /oauth/token
 *   Content-Type: application/x-www-form-urlencoded
 *   Body: grant_type=client_credentials&client_id=XXX&client_secret=YYY
 *
 * Key difference from UPS: credentials go in the form body, not Basic auth header.
 */

export interface FedExConnectionConfig {
  clientId: string
  clientSecret: string
  accountNumber: string
  sandbox: boolean
}

interface TokenCacheEntry {
  token: string
  expiresAt: number
}

// ─── FedEx Service Catalog (domestic only, no LTL) ──────────────────────────

export const FEDEX_SERVICES = [
  // Domestic
  { code: 'FEDEX_GROUND', name: 'FedEx Ground', domestic: true, international: false },
  { code: 'GROUND_HOME_DELIVERY', name: 'FedEx Home Delivery', domestic: true, international: false },
  { code: 'FEDEX_EXPRESS_SAVER', name: 'FedEx Express Saver', domestic: true, international: false },
  { code: 'FEDEX_2_DAY', name: 'FedEx 2Day', domestic: true, international: false },
  { code: 'FEDEX_2_DAY_AM', name: 'FedEx 2Day A.M.', domestic: true, international: false },
  { code: 'STANDARD_OVERNIGHT', name: 'FedEx Standard Overnight', domestic: true, international: false },
  { code: 'PRIORITY_OVERNIGHT', name: 'FedEx Priority Overnight', domestic: true, international: false },
  { code: 'FIRST_OVERNIGHT', name: 'FedEx First Overnight', domestic: true, international: false },
  { code: 'FEDEX_GROUND_ECONOMY', name: 'FedEx Ground Economy', domestic: true, international: false },
  // International
  { code: 'INTERNATIONAL_ECONOMY', name: 'FedEx International Economy', domestic: false, international: true },
  { code: 'INTERNATIONAL_PRIORITY', name: 'FedEx International Priority', domestic: false, international: true },
  { code: 'INTERNATIONAL_FIRST', name: 'FedEx International First', domestic: false, international: true },
  { code: 'FEDEX_INTERNATIONAL_GROUND', name: 'FedEx International Ground', domestic: false, international: true },
  { code: 'INTERNATIONAL_PRIORITY_EXPRESS', name: 'FedEx International Priority Express', domestic: false, international: true },
] as const

export type FedExServiceCode = typeof FEDEX_SERVICES[number]['code']

// ─── Shared result interfaces ───────────────────────────────────────────────

export interface FedExTestResult {
  success: boolean
  message: string
  details?: {
    tokenAcquired: boolean
    addressValidated: boolean
    residentialIndicator?: string
    validatedAddress?: {
      street: string
      city: string
      state: string
      postalCode: string
      country: string
    }
  }
  error?: string
}

export interface FedExAddressInput {
  street: string
  city: string
  state: string
  postalCode: string
  country: string
}

export interface FedExAddressValidationResult {
  success: boolean
  candidates: Array<{
    street: string
    city: string
    state: string
    postalCode: string
    country: string
    classification: string
  }>
  error?: string
}

export interface FedExRateResult {
  success: boolean
  serviceCode: string
  serviceName: string
  totalCharges?: string
  currencyCode?: string
  transitDays?: string
  error?: string
}

export interface FedExTestLabelResult {
  success: boolean
  trackingNumber?: string
  labelBase64?: string
  labelFormat?: 'PNG' | 'PDF' | 'ZPL'
  totalCharges?: string
  serviceDescription?: string
  error?: string
}

// ─── Token Management ───────────────────────────────────────────────────────

const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000
const tokenCacheMap = new Map<string, TokenCacheEntry>()

function getBaseUrl(sandbox: boolean): string {
  return sandbox ? 'https://apis-sandbox.fedex.com' : 'https://apis.fedex.com'
}

/**
 * Acquire or return a cached FedEx OAuth2 Bearer token.
 * FedEx uses form-body credentials (not Basic auth header like UPS).
 */
export async function getFedExToken(config: FedExConnectionConfig): Promise<string> {
  const cached = tokenCacheMap.get(config.clientId)
  if (cached && Date.now() < cached.expiresAt - TOKEN_REFRESH_BUFFER_MS) {
    return cached.token
  }

  const base = getBaseUrl(config.sandbox)

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: config.clientId,
    client_secret: config.clientSecret,
  })

  const res = await fetch(`${base}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: body.toString(),
  })

  if (!res.ok) {
    const errText = await res.text()
    tokenCacheMap.delete(config.clientId)
    throw new Error(`FedEx OAuth failed (${res.status}): ${errText}`)
  }

  const data = await res.json()
  const expiresInMs = (data.expires_in || 3600) * 1000

  tokenCacheMap.set(config.clientId, {
    token: data.access_token,
    expiresAt: Date.now() + expiresInMs,
  })

  return data.access_token
}

export function clearFedExTokenCache(clientId?: string): void {
  if (clientId) {
    tokenCacheMap.delete(clientId)
  } else {
    tokenCacheMap.clear()
  }
}

// ─── Authenticated request helper ───────────────────────────────────────────

async function fedexFetch(config: FedExConnectionConfig, path: string, body: any): Promise<Response> {
  const token = await getFedExToken(config)
  const base = getBaseUrl(config.sandbox)

  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'x-locale': 'en_US',
    },
    body: JSON.stringify(body),
  })
}

// ─── Test Connection ────────────────────────────────────────────────────────

export async function testFedExConnection(config: FedExConnectionConfig): Promise<FedExTestResult> {
  clearFedExTokenCache(config.clientId)

  let token: string
  try {
    token = await getFedExToken(config)
  } catch (err: any) {
    return {
      success: false,
      message: 'OAuth2 token acquisition failed',
      details: { tokenAcquired: false, addressValidated: false },
      error: err.message || String(err),
    }
  }

  // Suppress unused-var -- token was acquired to prove OAuth works
  void token

  try {
    const avBody = {
      addressesToValidate: [{
        address: {
          streetLines: ['104 Eastside Drive'],
          city: 'Black Mountain',
          stateOrProvinceCode: 'NC',
          postalCode: '28711',
          countryCode: 'US',
        },
      }],
    }

    const res = await fedexFetch(config, '/address/v1/addresses/resolve', avBody)

    if (!res.ok) {
      const errText = await res.text()
      return {
        success: false,
        message: 'Token acquired but address validation call failed',
        details: { tokenAcquired: true, addressValidated: false },
        error: `FedEx AV returned ${res.status}: ${errText}`,
      }
    }

    const data = await res.json()
    const resolved = data?.output?.resolvedAddresses?.[0]

    const rawClass = resolved?.classification
    const classification = rawClass === 'BUSINESS' ? 'Commercial'
      : rawClass === 'RESIDENTIAL' ? 'Residential'
      : rawClass === 'MIXED' ? 'Mixed'
      : resolved?.attributes?.Residential === 'true' ? 'Residential'
      : rawClass || 'Unknown'

    return {
      success: true,
      message: `Connected — OAuth2 token acquired, address validation confirmed (${classification})`,
      details: {
        tokenAcquired: true,
        addressValidated: true,
        residentialIndicator: classification,
        validatedAddress: resolved ? {
          street: resolved.streetLinesToken?.[0] || resolved.streetLines?.[0] || '',
          city: resolved.city || '',
          state: resolved.stateOrProvinceCode || '',
          postalCode: resolved.postalCode || '',
          country: resolved.countryCode || 'US',
        } : undefined,
      },
    }
  } catch (err: any) {
    return {
      success: false,
      message: 'Token acquired but address validation request failed',
      details: { tokenAcquired: true, addressValidated: false },
      error: err.message || String(err),
    }
  }
}

// ─── Test Label ─────────────────────────────────────────────────────────────

export async function generateFedExTestLabel(config: FedExConnectionConfig): Promise<FedExTestLabelResult> {
  try {
    await getFedExToken(config)
  } catch (err: any) {
    return { success: false, error: `OAuth failed: ${err.message || String(err)}` }
  }

  const shipBody = {
    labelResponseOptions: 'LABEL',
    accountNumber: { value: config.accountNumber },
    requestedShipment: {
      shipper: {
        contact: { personName: 'Shipping Dept', phoneNumber: '8285551234', companyName: 'Pirani' },
        address: {
          streetLines: ['104 Eastside Drive'],
          city: 'Black Mountain',
          stateOrProvinceCode: 'NC',
          postalCode: '28711',
          countryCode: 'US',
        },
      },
      recipients: [{
        contact: { personName: 'Test Recipient', phoneNumber: '4105551234' },
        address: {
          streetLines: ['123 Main St'],
          city: 'Timonium',
          stateOrProvinceCode: 'MD',
          postalCode: '21030',
          countryCode: 'US',
          residential: false,
        },
      }],
      pickupType: 'DROPOFF_AT_FEDEX_LOCATION',
      serviceType: 'FEDEX_GROUND',
      packagingType: 'YOUR_PACKAGING',
      shippingChargesPayment: {
        paymentType: 'SENDER',
        payor: {
          responsibleParty: {
            accountNumber: { value: config.accountNumber },
          },
        },
      },
      labelSpecification: {
        imageType: 'PNG',
        labelStockType: 'STOCK_4X6',
        labelPrintingOrientation: 'TOP_EDGE_OF_TEXT_FIRST',
      },
      requestedPackageLineItems: [{
        weight: { units: 'LB', value: 1 },
        dimensions: { length: 10, width: 10, height: 10, units: 'IN' },
      }],
    },
  }

  try {
    const res = await fedexFetch(config, '/ship/v1/shipments', shipBody)

    if (!res.ok) {
      const errText = await res.text()
      return { success: false, error: `FedEx Ship API returned ${res.status}: ${errText}` }
    }

    const data = await res.json()
    const txn = data?.output?.transactionShipments?.[0]
    const pkg = txn?.pieceResponses?.[0]

    const trackingNumber = pkg?.trackingNumber || txn?.masterTrackingNumber || 'N/A'
    const labelBase64 = pkg?.packageDocuments?.[0]?.encodedLabel
      || txn?.shipmentDocuments?.[0]?.encodedLabel

    const charges = txn?.completedShipmentDetail?.shipmentRating?.shipmentRateDetails?.[0]
    const totalCharges = charges
      ? `$${charges.totalNetCharge || charges.totalNetFedExCharge || '0.00'}`
      : undefined

    const svcDesc = txn?.serviceType || 'FedEx Ground'

    return {
      success: true,
      trackingNumber,
      labelBase64: labelBase64 || undefined,
      labelFormat: 'PNG',
      totalCharges,
      serviceDescription: svcDesc,
    }
  } catch (err: any) {
    return { success: false, error: err.message || String(err) }
  }
}

// ─── Address Validation (custom address) ────────────────────────────────────

export async function validateFedExAddress(
  config: FedExConnectionConfig,
  address: FedExAddressInput,
): Promise<FedExAddressValidationResult> {
  try {
    await getFedExToken(config)
  } catch (err: any) {
    return { success: false, candidates: [], error: `OAuth failed: ${err.message || String(err)}` }
  }

  const body = {
    addressesToValidate: [{
      address: {
        streetLines: [address.street],
        city: address.city,
        stateOrProvinceCode: address.state,
        postalCode: address.postalCode,
        countryCode: address.country || 'US',
      },
    }],
  }

  try {
    const res = await fedexFetch(config, '/address/v1/addresses/resolve', body)

    if (!res.ok) {
      const errText = await res.text()
      return { success: false, candidates: [], error: `FedEx AV returned ${res.status}: ${errText}` }
    }

    const data = await res.json()
    const resolvedArr = data?.output?.resolvedAddresses || []

    const candidates = resolvedArr.map((r: any) => ({
      street: (r.streetLinesToken || r.streetLines || []).join(', '),
      city: r.city || '',
      state: r.stateOrProvinceCode || '',
      postalCode: r.postalCode || '',
      country: r.countryCode || 'US',
      classification: r.classification === 'BUSINESS' ? 'Commercial'
        : r.classification === 'RESIDENTIAL' ? 'Residential'
        : r.classification || 'Unknown',
    }))

    return { success: true, candidates }
  } catch (err: any) {
    return { success: false, candidates: [], error: err.message || String(err) }
  }
}

// ─── Single-Service Rating ──────────────────────────────────────────────────

const PIRANI_ADDRESS = {
  streetLines: ['104 Eastside Drive'],
  city: 'Black Mountain',
  stateOrProvinceCode: 'NC',
  postalCode: '28711',
  countryCode: 'US',
}

const DUMMY_SHIP_TO = {
  streetLines: ['123 Main St'],
  city: 'Timonium',
  stateOrProvinceCode: 'MD',
  postalCode: '21030',
  countryCode: 'US',
}

export async function getFedExRate(
  config: FedExConnectionConfig,
  serviceCode: string,
  weight: string = '1',
  dims: { length: string; width: string; height: string } = { length: '10', width: '10', height: '10' },
): Promise<FedExRateResult> {
  const svcEntry = FEDEX_SERVICES.find(s => s.code === serviceCode)
  const serviceName = svcEntry?.name || `FedEx ${serviceCode}`

  try {
    await getFedExToken(config)
  } catch (err: any) {
    return { success: false, serviceCode, serviceName, error: `OAuth failed: ${err.message || String(err)}` }
  }

  const rateBody = {
    accountNumber: { value: config.accountNumber },
    requestedShipment: {
      shipper: { address: PIRANI_ADDRESS },
      recipient: { address: DUMMY_SHIP_TO },
      pickupType: 'DROPOFF_AT_FEDEX_LOCATION',
      serviceType: serviceCode,
      packagingType: 'YOUR_PACKAGING',
      rateRequestType: ['ACCOUNT'],
      requestedPackageLineItems: [{
        weight: { units: 'LB', value: parseFloat(weight) || 1 },
        dimensions: {
          length: parseInt(dims.length) || 10,
          width: parseInt(dims.width) || 10,
          height: parseInt(dims.height) || 10,
          units: 'IN',
        },
      }],
    },
  }

  try {
    const res = await fedexFetch(config, '/rate/v1/rates/quotes', rateBody)

    if (!res.ok) {
      const errText = await res.text()
      return { success: false, serviceCode, serviceName, error: `HTTP ${res.status}: ${errText}` }
    }

    const data = await res.json()
    const rateReply = data?.output?.rateReplyDetails?.[0]

    if (!rateReply) {
      return { success: false, serviceCode, serviceName, error: 'No rateReplyDetails in response' }
    }

    const ratedDetail = rateReply.ratedShipmentDetails?.[0]
    const totalNet = ratedDetail?.totalNetCharge || ratedDetail?.totalNetFedExCharge
    const currency = ratedDetail?.currency || 'USD'
    const transit = rateReply.commit?.dateDetail?.dayCount
      || rateReply.commit?.transitDays?.description

    return {
      success: true,
      serviceCode,
      serviceName,
      totalCharges: totalNet != null ? String(totalNet) : undefined,
      currencyCode: currency,
      transitDays: transit ? String(transit) : undefined,
    }
  } catch (err: any) {
    return { success: false, serviceCode, serviceName, error: err.message || String(err) }
  }
}

// ─── Rate Shop (parallel across multiple services) ──────────────────────────

export async function rateShopFedEx(
  config: FedExConnectionConfig,
  serviceCodes: string[],
  weight: string = '1',
  dims: { length: string; width: string; height: string } = { length: '10', width: '10', height: '10' },
): Promise<FedExRateResult[]> {
  const results = await Promise.all(
    serviceCodes.map(code => getFedExRate(config, code, weight, dims))
  )

  return results.sort((a, b) => {
    if (a.success && !b.success) return -1
    if (!a.success && b.success) return 1
    const aVal = parseFloat(a.totalCharges || '999999')
    const bVal = parseFloat(b.totalCharges || '999999')
    return aVal - bVal
  })
}
