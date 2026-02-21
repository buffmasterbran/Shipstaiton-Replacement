/**
 * UPS REST API OAuth2 Authentication, Connection Testing & Test Label
 *
 * Production: https://onlinetools.ups.com
 * Sandbox:    https://wwwcie.ups.com
 *
 * OAuth2 client_credentials flow:
 *   POST /security/v1/oauth/token
 *   Authorization: Basic base64(clientId:clientSecret)
 *   x-merchant-id: <clientId>
 *   Content-Type: application/x-www-form-urlencoded
 *   Body: grant_type=client_credentials
 *
 * Token lifetime: ~4 hours (14,399s). UPS limits ~250 token requests/day,
 * so aggressive caching is required.
 */

export interface UPSConnectionConfig {
  clientId: string
  clientSecret: string
  accountNumber: string
  sandbox: boolean
}

interface TokenCacheEntry {
  token: string
  expiresAt: number
}

export interface UPSTestResult {
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

// ─── UPS Service Catalog ────────────────────────────────────────────────────
export const UPS_SERVICES = [
  { code: '01', name: 'UPS Next Day Air', domestic: true, international: false },
  { code: '02', name: 'UPS 2nd Day Air', domestic: true, international: false },
  { code: '03', name: 'UPS Ground', domestic: true, international: false },
  { code: '12', name: 'UPS 3 Day Select', domestic: true, international: false },
  { code: '13', name: 'UPS Next Day Air Saver', domestic: true, international: false },
  { code: '14', name: 'UPS Next Day Air Early A.M.', domestic: true, international: false },
  { code: '59', name: 'UPS 2nd Day Air A.M.', domestic: true, international: false },
  { code: '92', name: 'UPS SurePost Less than 1 lb', domestic: true, international: false },
  { code: '93', name: 'UPS SurePost 1 lb or Greater', domestic: true, international: false },
  { code: '07', name: 'UPS Worldwide Express', domestic: false, international: true },
  { code: '08', name: 'UPS Worldwide Expedited', domestic: false, international: true },
  { code: '11', name: 'UPS Standard (Canada/Mexico)', domestic: false, international: true },
  { code: '54', name: 'UPS Worldwide Express Plus', domestic: false, international: true },
  { code: '65', name: 'UPS Worldwide Saver', domestic: false, international: true },
] as const

export type UPSServiceCode = typeof UPS_SERVICES[number]['code']

// ─── Interfaces ─────────────────────────────────────────────────────────────

export interface UPSAddressInput {
  street: string
  city: string
  state: string
  postalCode: string
  country: string
}

export interface UPSAddressValidationResult {
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

export interface UPSRateResult {
  success: boolean
  serviceCode: string
  serviceName: string
  totalCharges?: string
  currencyCode?: string
  transitDays?: string
  error?: string
}

export interface UPSTestLabelResult {
  success: boolean
  trackingNumber?: string
  labelBase64?: string
  labelFormat?: 'GIF' | 'PDF' | 'ZPL'
  totalCharges?: string
  serviceDescription?: string
  error?: string
}

const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000
const tokenCacheMap = new Map<string, TokenCacheEntry>()

function getBaseUrl(sandbox: boolean): string {
  return sandbox ? 'https://wwwcie.ups.com' : 'https://onlinetools.ups.com'
}

/**
 * Acquire or return a cached UPS OAuth2 Bearer token.
 * Tokens are cached per clientId so multiple connections sharing the
 * same app credentials reuse a single token.
 */
export async function getUPSToken(config: UPSConnectionConfig): Promise<string> {
  const cached = tokenCacheMap.get(config.clientId)
  if (cached && Date.now() < cached.expiresAt - TOKEN_REFRESH_BUFFER_MS) {
    return cached.token
  }

  const base = getBaseUrl(config.sandbox)
  const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')

  const res = await fetch(`${base}/security/v1/oauth/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'x-merchant-id': config.clientId,
      'Accept': 'application/json',
    },
    body: 'grant_type=client_credentials',
  })

  if (!res.ok) {
    const errText = await res.text()
    tokenCacheMap.delete(config.clientId)
    throw new Error(`UPS OAuth failed (${res.status}): ${errText}`)
  }

  const data = await res.json()
  const expiresInMs = (data.expires_in || 14399) * 1000

  tokenCacheMap.set(config.clientId, {
    token: data.access_token,
    expiresAt: Date.now() + expiresInMs,
  })

  return data.access_token
}

/**
 * Invalidate cached token(s). Pass a clientId to clear one, or omit to clear all.
 */
export function clearUPSTokenCache(clientId?: string): void {
  if (clientId) {
    tokenCacheMap.delete(clientId)
  } else {
    tokenCacheMap.clear()
  }
}

/**
 * Test UPS connectivity by acquiring a token and hitting the Address Validation API
 * with a known commercial address (Pirani warehouse).
 */
export async function testUPSConnection(config: UPSConnectionConfig): Promise<UPSTestResult> {
  clearUPSTokenCache(config.clientId)

  let token: string
  try {
    token = await getUPSToken(config)
  } catch (err: any) {
    return {
      success: false,
      message: 'OAuth2 token acquisition failed',
      details: { tokenAcquired: false, addressValidated: false },
      error: err.message || String(err),
    }
  }

  const base = getBaseUrl(config.sandbox)
  try {
    const avBody = {
      XAVRequest: {
        AddressKeyFormat: {
          AddressLine: ['104 Eastside Drive'],
          PoliticalDivision2: 'Black Mountain',
          PoliticalDivision1: 'NC',
          PostcodePrimaryLow: '28711',
          CountryCode: 'US',
        },
      },
    }

    const avRes = await fetch(`${base}/api/addressvalidation/v2/3`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'transId': `test-${Date.now()}`,
        'transactionSrc': 'pirani-batch-tool',
      },
      body: JSON.stringify(avBody),
    })

    if (!avRes.ok) {
      const errText = await avRes.text()
      return {
        success: false,
        message: 'Token acquired but address validation call failed',
        details: { tokenAcquired: true, addressValidated: false },
        error: `UPS AV returned ${avRes.status}: ${errText}`,
      }
    }

    const avData = await avRes.json()
    const candidate = avData?.XAVResponse?.Candidate?.[0] || avData?.XAVResponse?.Candidate
    const addr = candidate?.AddressKeyFormat

    const residentialIndicator = candidate?.AddressClassification?.Description || 'Unknown'

    return {
      success: true,
      message: `Connected — OAuth2 token acquired, address validation confirmed (${residentialIndicator})`,
      details: {
        tokenAcquired: true,
        addressValidated: true,
        residentialIndicator,
        validatedAddress: addr ? {
          street: Array.isArray(addr.AddressLine) ? addr.AddressLine.join(', ') : (addr.AddressLine || ''),
          city: addr.PoliticalDivision2 || '',
          state: addr.PoliticalDivision1 || '',
          postalCode: `${addr.PostcodePrimaryLow || ''}${addr.PostcodeExtendedLow ? '-' + addr.PostcodeExtendedLow : ''}`,
          country: addr.CountryCode || 'US',
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

/**
 * Generate a test label via the UPS Shipping API.
 * Ships a 1 lb package from Pirani warehouse to a dummy address using UPS Ground.
 * In sandbox mode this creates a non-billable test shipment.
 */
export async function generateTestLabel(config: UPSConnectionConfig): Promise<UPSTestLabelResult> {
  let token: string
  try {
    token = await getUPSToken(config)
  } catch (err: any) {
    return { success: false, error: `OAuth failed: ${err.message || String(err)}` }
  }

  const base = getBaseUrl(config.sandbox)

  const shipmentRequest = {
    ShipmentRequest: {
      Request: {
        SubVersion: '1801',
        RequestOption: 'nonvalidate',
        TransactionReference: { CustomerContext: 'pirani-test-label' },
      },
      Shipment: {
        Description: 'Test Label',
        Shipper: {
          Name: 'Pirani',
          AttentionName: 'Shipping Dept',
          Phone: { Number: '8285551234' },
          ShipperNumber: config.accountNumber,
          Address: {
            AddressLine: ['104 Eastside Drive'],
            City: 'Black Mountain',
            StateProvinceCode: 'NC',
            PostalCode: '28711',
            CountryCode: 'US',
          },
        },
        ShipTo: {
          Name: 'Test Recipient',
          AttentionName: 'Test',
          Phone: { Number: '4105551234' },
          Address: {
            AddressLine: ['123 Main St'],
            City: 'Timonium',
            StateProvinceCode: 'MD',
            PostalCode: '21030',
            CountryCode: 'US',
          },
        },
        ShipFrom: {
          Name: 'Pirani',
          AttentionName: 'Shipping Dept',
          Phone: { Number: '8285551234' },
          Address: {
            AddressLine: ['104 Eastside Drive'],
            City: 'Black Mountain',
            StateProvinceCode: 'NC',
            PostalCode: '28711',
            CountryCode: 'US',
          },
        },
        PaymentInformation: {
          ShipmentCharge: {
            Type: '01',
            BillShipper: { AccountNumber: config.accountNumber },
          },
        },
        Service: { Code: '03', Description: 'UPS Ground' },
        Package: {
          Description: 'Test Package',
          Packaging: { Code: '02', Description: 'Customer Supplied Package' },
          Dimensions: {
            UnitOfMeasurement: { Code: 'IN', Description: 'Inches' },
            Length: '10',
            Width: '10',
            Height: '10',
          },
          PackageWeight: {
            UnitOfMeasurement: { Code: 'LBS', Description: 'Pounds' },
            Weight: '1',
          },
        },
      },
      LabelSpecification: {
        LabelImageFormat: { Code: 'GIF', Description: 'GIF' },
        LabelStockSize: { Height: '6', Width: '4' },
        HTTPUserAgent: 'Mozilla/5.0',
      },
    },
  }

  try {
    const res = await fetch(`${base}/api/shipments/v2409/ship`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'transId': `test-label-${Date.now()}`,
        'transactionSrc': 'pirani-batch-tool',
      },
      body: JSON.stringify(shipmentRequest),
    })

    if (!res.ok) {
      const errText = await res.text()
      return { success: false, error: `UPS Shipping API returned ${res.status}: ${errText}` }
    }

    const data = await res.json()
    const shipResult = data?.ShipmentResponse?.ShipmentResults

    const trackingNumber = shipResult?.PackageResults?.TrackingNumber
      || shipResult?.PackageResults?.[0]?.TrackingNumber
      || 'N/A'

    const labelBase64 = shipResult?.PackageResults?.ShippingLabel?.GraphicImage
      || shipResult?.PackageResults?.[0]?.ShippingLabel?.GraphicImage

    const charges = shipResult?.ShipmentCharges?.TotalCharges
    const totalCharges = charges
      ? `$${charges.MonetaryValue} ${charges.CurrencyCode || 'USD'}`
      : undefined

    const svcDesc = shipResult?.Service?.Description || 'UPS Ground'

    return {
      success: true,
      trackingNumber,
      labelBase64: labelBase64 || undefined,
      labelFormat: 'GIF',
      totalCharges,
      serviceDescription: svcDesc,
    }
  } catch (err: any) {
    return { success: false, error: err.message || String(err) }
  }
}

// ─── Address Validation (custom address) ────────────────────────────────────

export async function validateAddress(
  config: UPSConnectionConfig,
  address: UPSAddressInput,
): Promise<UPSAddressValidationResult> {
  const tag = '[UPS Direct AV]'
  console.log(`${tag} Validating: ${address.street}, ${address.city}, ${address.state} ${address.postalCode} ${address.country || 'US'}`)

  let token: string
  try {
    token = await getUPSToken(config)
    console.log(`${tag} OAuth token acquired (account: ${config.accountNumber}, sandbox: ${config.sandbox})`)
  } catch (err: any) {
    console.error(`${tag} OAuth FAILED:`, err.message || String(err))
    return { success: false, candidates: [], error: `OAuth failed: ${err.message || String(err)}` }
  }

  const base = getBaseUrl(config.sandbox)

  const body = {
    XAVRequest: {
      AddressKeyFormat: {
        AddressLine: [address.street],
        PoliticalDivision2: address.city,
        PoliticalDivision1: address.state,
        PostcodePrimaryLow: address.postalCode,
        CountryCode: address.country || 'US',
      },
    },
  }

  // Request option 3 = Address Validation + Address Classification
  console.log(`${tag} POST ${base}/api/addressvalidation/v2/3`)
  console.log(`${tag} Request body:`, JSON.stringify(body.XAVRequest.AddressKeyFormat))

  const start = Date.now()
  try {
    const res = await fetch(`${base}/api/addressvalidation/v2/3`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'transId': `av-${Date.now()}`,
        'transactionSrc': 'pirani-batch-tool',
      },
      body: JSON.stringify(body),
    })

    const elapsed = Date.now() - start
    console.log(`${tag} Response: ${res.status} in ${elapsed}ms`)

    if (!res.ok) {
      const errText = await res.text()
      console.error(`${tag} ERROR response:`, errText.substring(0, 500))
      return { success: false, candidates: [], error: `UPS AV returned ${res.status}: ${errText}` }
    }

    const data = await res.json()
    const xav = data?.XAVResponse || {}
    console.log(`${tag} Raw response keys:`, Object.keys(xav))

    // UPS puts classification at the response level, not per-candidate
    const topClassification = xav.AddressClassification?.Description
      || xav.AddressClassification?.Code
    console.log(`${tag} Top-level classification:`, JSON.stringify(xav.AddressClassification))

    const rawCandidates = xav.Candidate
    const candidateArr = Array.isArray(rawCandidates) ? rawCandidates : rawCandidates ? [rawCandidates] : []

    console.log(`${tag} Candidates found: ${candidateArr.length}`)

    const candidates = candidateArr.map((c: any, i: number) => {
      const addr = c?.AddressKeyFormat || {}
      // Prefer candidate-level classification, fall back to response-level
      const candidateClass = c?.AddressClassification?.Description || c?.AddressClassification?.Code
      const classification = candidateClass || topClassification || 'Unknown'
      const street = Array.isArray(addr.AddressLine) ? addr.AddressLine.join(', ') : (addr.AddressLine || '')
      const postalCode = `${addr.PostcodePrimaryLow || ''}${addr.PostcodeExtendedLow ? '-' + addr.PostcodeExtendedLow : ''}`

      console.log(`${tag}   [${i}] ${street}, ${addr.PoliticalDivision2}, ${addr.PoliticalDivision1} ${postalCode} — ${classification} (candidate: ${JSON.stringify(c?.AddressClassification)})`)

      return {
        street,
        city: addr.PoliticalDivision2 || '',
        state: addr.PoliticalDivision1 || '',
        postalCode,
        country: addr.CountryCode || 'US',
        classification,
      }
    })

    console.log(`${tag} ✓ Validation complete — ${candidates.length} candidate(s)`)
    return { success: true, candidates }
  } catch (err: any) {
    console.error(`${tag} Network error after ${Date.now() - start}ms:`, err.message || String(err))
    return { success: false, candidates: [], error: err.message || String(err) }
  }
}

// ─── Single-Service Rating ──────────────────────────────────────────────────

const PIRANI_ADDRESS = {
  AddressLine: ['104 Eastside Drive'],
  City: 'Black Mountain',
  StateProvinceCode: 'NC',
  PostalCode: '28711',
  CountryCode: 'US',
}

const DUMMY_SHIP_TO = {
  AddressLine: ['123 Main St'],
  City: 'Timonium',
  StateProvinceCode: 'MD',
  PostalCode: '21030',
  CountryCode: 'US',
}

export async function getUPSRate(
  config: UPSConnectionConfig,
  serviceCode: string,
  weight: string = '1',
  dims: { length: string; width: string; height: string } = { length: '10', width: '10', height: '10' },
): Promise<UPSRateResult> {
  const svcEntry = UPS_SERVICES.find(s => s.code === serviceCode)
  const serviceName = svcEntry?.name || `UPS Service ${serviceCode}`

  let token: string
  try {
    token = await getUPSToken(config)
  } catch (err: any) {
    return { success: false, serviceCode, serviceName, error: `OAuth failed: ${err.message || String(err)}` }
  }

  const base = getBaseUrl(config.sandbox)

  const rateRequest = {
    RateRequest: {
      Request: {
        SubVersion: '1801',
        TransactionReference: { CustomerContext: `rate-${serviceCode}` },
      },
      Shipment: {
        Shipper: {
          Name: 'Pirani',
          ShipperNumber: config.accountNumber,
          Address: PIRANI_ADDRESS,
        },
        ShipTo: {
          Name: 'Test Recipient',
          Address: DUMMY_SHIP_TO,
        },
        ShipFrom: {
          Name: 'Pirani',
          Address: PIRANI_ADDRESS,
        },
        Service: { Code: serviceCode, Description: serviceName },
        Package: {
          PackagingType: { Code: '02', Description: 'Customer Supplied Package' },
          Dimensions: {
            UnitOfMeasurement: { Code: 'IN', Description: 'Inches' },
            Length: dims.length,
            Width: dims.width,
            Height: dims.height,
          },
          PackageWeight: {
            UnitOfMeasurement: { Code: 'LBS', Description: 'Pounds' },
            Weight: weight,
          },
        },
        PaymentDetails: {
          ShipmentCharge: {
            Type: '01',
            BillShipper: { AccountNumber: config.accountNumber },
          },
        },
      },
    },
  }

  try {
    const res = await fetch(`${base}/api/rating/v2403/rate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'transId': `rate-${serviceCode}-${Date.now()}`,
        'transactionSrc': 'pirani-batch-tool',
      },
      body: JSON.stringify(rateRequest),
    })

    if (!res.ok) {
      const errText = await res.text()
      return { success: false, serviceCode, serviceName, error: `HTTP ${res.status}: ${errText}` }
    }

    const data = await res.json()
    const rated = data?.RateResponse?.RatedShipment

    if (!rated) {
      return { success: false, serviceCode, serviceName, error: 'No RatedShipment in response' }
    }

    const ratedItem = Array.isArray(rated) ? rated[0] : rated
    const charges = ratedItem?.TotalCharges
    const transit = ratedItem?.GuaranteedDelivery?.BusinessDaysInTransit
      || ratedItem?.TimeInTransit?.ServiceSummary?.EstimatedArrival?.BusinessDaysInTransit

    return {
      success: true,
      serviceCode,
      serviceName,
      totalCharges: charges?.MonetaryValue,
      currencyCode: charges?.CurrencyCode || 'USD',
      transitDays: transit || undefined,
    }
  } catch (err: any) {
    return { success: false, serviceCode, serviceName, error: err.message || String(err) }
  }
}

// ─── Rate Shop (parallel across multiple services) ──────────────────────────

export async function rateShopUPS(
  config: UPSConnectionConfig,
  serviceCodes: string[],
  weight: string = '1',
  dims: { length: string; width: string; height: string } = { length: '10', width: '10', height: '10' },
): Promise<UPSRateResult[]> {
  const results = await Promise.all(
    serviceCodes.map(code => getUPSRate(config, code, weight, dims))
  )

  return results.sort((a, b) => {
    if (a.success && !b.success) return -1
    if (!a.success && b.success) return 1
    const aVal = parseFloat(a.totalCharges || '999999')
    const bVal = parseFloat(b.totalCharges || '999999')
    return aVal - bVal
  })
}
