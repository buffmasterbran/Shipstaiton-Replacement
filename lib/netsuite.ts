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

  // Only use async preference for write operations (not GET)
  if (method !== 'GET') {
    headers['prefer'] = 'respond-async, transient'
  }

  const options: RequestInit = {
    method,
    headers,
  }

  if (body && (method === 'POST' || method === 'PATCH' || method === 'PUT')) {
    options.body = JSON.stringify(body)
  }

  console.log(`[NetSuite] ---- REQUEST ----`)
  console.log(`[NetSuite] ${method} ${url}`)
  console.log(`[NetSuite] Headers:`, JSON.stringify(
    { ...headers, Authorization: headers.Authorization?.substring(0, 40) + '...' },
    null, 2
  ))
  if (options.body) {
    console.log(`[NetSuite] Body:`, options.body)
  }

  const res = await fetch(url, options)
  const raw = await res.text()

  let data: unknown = raw
  try {
    data = JSON.parse(raw)
  } catch {
    // Response wasn't JSON, keep raw text
  }

  console.log(`[NetSuite] ---- RESPONSE ----`)
  console.log(`[NetSuite] Status: ${res.status} ${res.statusText}`)
  console.log(`[NetSuite] Response Headers:`, JSON.stringify(Object.fromEntries(res.headers.entries()), null, 2))
  console.log(`[NetSuite] Response Body (first 2000 chars):`, raw.substring(0, 2000))
  if (raw.length > 2000) {
    console.log(`[NetSuite] (Response truncated, total length: ${raw.length})`)
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
  return netsuiteRequest('GET', `/itemFulfillment/${internalId}`)
}

/**
 * Update an Item Fulfillment record (set tracking, carrier, packages, cost, status)
 * 
 * NetSuite Item Fulfillment record fields:
 * - shipStatus: "A" = Picked, "B" = Packed, "C" = Shipped
 * - shipMethod: Internal ID of the shipping method record
 * - shippingCost: Cost of shipping
 * - memo: Memo field
 * - packageList.package[]: Array of packages with tracking, weight, dims
 */
export async function updateItemFulfillment(update: FulfillmentUpdate) {
  const body: Record<string, unknown> = {
    shipStatus: 'C', // Mark as Shipped
  }

  if (update.shippingCost !== undefined && update.shippingCost !== null) {
    body.shippingCost = update.shippingCost
  }

  if (update.memo) {
    body.memo = update.memo
  }

  // Build package list
  if (update.packages && update.packages.length > 0) {
    body.packageList = {
      package: {
        items: update.packages.map(pkg => ({
          packageWeight: pkg.packageWeight,
          packageTrackingNumber: pkg.packageTrackingNumber,
          packageDescr: pkg.packageDescr || '',
          ...(pkg.packageLength && { packageLength: pkg.packageLength }),
          ...(pkg.packageWidth && { packageWidth: pkg.packageWidth }),
          ...(pkg.packageHeight && { packageHeight: pkg.packageHeight }),
        })),
      },
    }
  } else if (update.trackingNumber) {
    // Single package with just tracking
    body.packageList = {
      package: {
        items: [
          {
            packageTrackingNumber: update.trackingNumber,
            packageWeight: 0,
          },
        ],
      },
    }
  }

  // If a shipping method internal ID is provided, set it
  if (update.shippingMethod) {
    body.shipMethod = { id: update.shippingMethod }
  }

  console.log(`[NetSuite] Updating Item Fulfillment ${update.internalId}:`, JSON.stringify(body, null, 2))

  return netsuiteRequest('PATCH', `/itemFulfillment/${update.internalId}`, body)
}
