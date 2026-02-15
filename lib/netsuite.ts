import OAuth from 'oauth-1.0a'
import crypto from 'crypto'

// ============================================================================
// NetSuite REST API Helper (Token-Based Authentication)
// ============================================================================

const NETSUITE_ACCOUNT_ID = process.env.NETSUITE_ACCOUNT_ID || ''
const NETSUITE_CONSUMER_KEY = process.env.NETSUITE_CONSUMER_KEY || ''
const NETSUITE_CONSUMER_SECRET = process.env.NETSUITE_CONSUMER_SECRET || ''
const NETSUITE_TOKEN_ID = process.env.NETSUITE_TOKEN_ID || ''
const NETSUITE_TOKEN_SECRET = process.env.NETSUITE_TOKEN_SECRET || ''

// Base URL for NetSuite REST record API
function getBaseUrl(): string {
  return `https://${NETSUITE_ACCOUNT_ID}.suitetalk.api.netsuite.com/services/rest/record/v1`
}

export function isNetSuiteConfigured(): boolean {
  return !!(
    NETSUITE_ACCOUNT_ID &&
    NETSUITE_CONSUMER_KEY &&
    NETSUITE_CONSUMER_SECRET &&
    NETSUITE_TOKEN_ID &&
    NETSUITE_TOKEN_SECRET
  )
}

// Build OAuth 1.0 authorization header for NetSuite TBA
function getOAuthHeader(method: string, url: string): string {
  const oauth = new OAuth({
    consumer: {
      key: NETSUITE_CONSUMER_KEY,
      secret: NETSUITE_CONSUMER_SECRET,
    },
    signature_method: 'HMAC-SHA256',
    hash_function(baseString: string, key: string) {
      return crypto.createHmac('sha256', key).update(baseString).digest('base64')
    },
    realm: NETSUITE_ACCOUNT_ID,
  })

  const token = {
    key: NETSUITE_TOKEN_ID,
    secret: NETSUITE_TOKEN_SECRET,
  }

  const authData = oauth.authorize({ url, method }, token)
  return oauth.toHeader(authData).Authorization
}

// Generic NetSuite REST API call
async function netsuiteRequest(
  method: string,
  path: string,
  body?: Record<string, unknown>
): Promise<{ status: number; data: unknown; raw: string }> {
  const url = `${getBaseUrl()}${path}`
  const authHeader = getOAuthHeader(method, url)

  const headers: Record<string, string> = {
    Authorization: authHeader,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }

  // No async preference — we want synchronous responses so we can see errors

  const options: RequestInit = {
    method,
    headers,
  }

  if (body && (method === 'POST' || method === 'PATCH' || method === 'PUT')) {
    options.body = JSON.stringify(body)
  }

  const res = await fetch(url, options)
  const raw = await res.text()

  let data: unknown = raw
  try {
    data = JSON.parse(raw)
  } catch {
    // Response wasn't JSON, keep raw text
  }

  return { status: res.status, data, raw }
}

// ============================================================================
// Item Fulfillment Operations
// ============================================================================

export interface FulfillmentPackage {
  packageWeight: number // weight in lbs
  packageTrackingNumber: string
  packageDescr?: string // box name/description
  packageLength?: number // inches
  packageWidth?: number // inches
  packageHeight?: number // inches
}

export interface FulfillmentUpdate {
  internalId: string
  trackingNumber: string
  carrier?: string // e.g., "UPS", "USPS", "FedEx"
  shippingMethod?: string // NetSuite shipping method internal ID
  shippingCost?: number
  packages?: FulfillmentPackage[]
  memo?: string
}

/**
 * Get an Item Fulfillment record by internal ID
 */
export async function getItemFulfillment(internalId: string) {
  return netsuiteRequest('GET', `/itemFulfillment/${internalId}?expandSubResources=true`)
}

/**
 * Update an Item Fulfillment record — single PATCH request
 * - shipStatus "C" = Shipped
 * - shippingCost = label cost
 * - package.items[] = tracking number + weight (REST API requires this for tracking)
 */
export async function updateItemFulfillment(update: FulfillmentUpdate) {
  const body: Record<string, unknown> = {
    shipStatus: 'C',
  }

  if (update.shippingCost !== undefined && update.shippingCost !== null) {
    body.shippingCost = update.shippingCost
  }

  if (update.memo) {
    body.memo = update.memo
  }

  // Tracking goes on the package sublist — NetSuite REST API has no top-level tracking field
  if (update.trackingNumber || (update.packages && update.packages.length > 0)) {
    const pkgItems = (update.packages && update.packages.length > 0)
      ? update.packages.map(pkg => ({
          packageTrackingNumber: pkg.packageTrackingNumber || update.trackingNumber,
          packageWeight: pkg.packageWeight || 0,
          ...(pkg.packageDescr ? { packageDescr: pkg.packageDescr } : {}),
        }))
      : [{
          packageTrackingNumber: update.trackingNumber,
          packageWeight: 0,
        }]

    body.package = {
      items: pkgItems,
    }
  }

  // replace=package tells NetSuite to REPLACE existing package lines instead of appending
  return netsuiteRequest('PATCH', `/itemFulfillment/${update.internalId}?replace=package`, body)
}
