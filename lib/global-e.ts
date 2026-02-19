/**
 * Global-E Shipping Documents API client
 *
 * NOT TESTED -- Built from API documentation only (Feb 2026).
 * No live international orders were available for testing.
 * Will need debugging when the first real order comes through.
 *
 * Docs: https://docs.global-e.com/enterprise/en/shipping-documents-api.html
 * Production base: https://api.global-e.com
 */

const GLOBAL_E_BASE_URL = 'https://api.global-e.com'

function getMerchantGUID(): string {
  const guid = process.env.GLOBAL_E_GUID
  if (!guid) throw new Error('GLOBAL_E_GUID environment variable not set')
  return guid
}

// ============================================================================
// Types
// ============================================================================

export interface GlobalEParcelProduct {
  ProductCode: string
  DeliveryQuantity: number
  OriginCountryCode?: string
}

export interface GlobalEParcel {
  ParcelCode: string
  Products: GlobalEParcelProduct[]
  Weight?: number       // grams (optional)
  Length?: number        // cm (optional)
  Width?: number         // cm (optional)
  Height?: number        // cm (optional)
}

export interface GetShippingDocumentsRequest {
  OrderId: string
  Parcels: GlobalEParcel[]
  HubCode?: string
  DeliveryReferenceNumber?: string
}

export interface GlobalEDocument {
  DocumentTypeCode: string
  DocumentTypeName: string
  DocumentExtension: string
  URL: string
  DocumentData: string  // base64
  ErrorMessage: string | null
  ParcelCode?: string
}

export interface GlobalEParcelTracking {
  ParcelTrackingNumber: string
  ParcelTrackingUrl: string
  ParcelCode: string
}

export interface GlobalETrackingDetails {
  TrackingNumber: string
  ShipperName: string
  TrackingURL: string
}

export interface GetShippingDocumentsResponse {
  IsSuccess: boolean
  ErrorText: string | null
  Documents: GlobalEDocument[] | null
  ParcelsTracking: GlobalEParcelTracking[] | null
  TrackingDetails: GlobalETrackingDetails | null
  Errors?: Array<{
    OrderID: string
    ErrorCode: string
    ErrorText: string
    MerchantOrderID: string | null
  }>
}

export interface DispatchOrdersRequest {
  OrderIds: string[]
  HubCode?: string
}

export interface DispatchOrdersResponse {
  IsSuccess: boolean
  ErrorText: string | null
  ShipperManifests: GlobalEDocument[] | null
}

export interface VoidParcelRequest {
  OrderId: string
  ParcelCode: string
  MerchantOrderId?: string
}

export interface VoidParcelResponse {
  IsSuccess: boolean
  Errors: Array<{ ErrorCode: string; ErrorText: string }> | null
}

// ============================================================================
// API calls
// ============================================================================

async function globalEFetch<T>(endpoint: string, body: unknown): Promise<T> {
  const url = `${GLOBAL_E_BASE_URL}${endpoint}`
  const guid = getMerchantGUID()

  console.log(`[Global-E] POST ${endpoint}`, JSON.stringify(body).slice(0, 200))

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'MerchantGUID': guid,
    },
    body: JSON.stringify(body),
  })

  const text = await res.text()

  if (!res.ok) {
    console.error(`[Global-E] HTTP ${res.status}:`, text)
    let parsed: any = null
    try { parsed = JSON.parse(text) } catch {}
    const errMsg = parsed?.Error || parsed?.Description || text
    throw new Error(`Global-E API error (${res.status}): ${errMsg}`)
  }

  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(`Global-E returned non-JSON response: ${text.slice(0, 200)}`)
  }
}

/**
 * Declare order fulfillment and retrieve shipping documents (labels, invoices).
 * This is API call #1 in the Global-E shipping flow.
 */
export async function getShippingDocuments(
  request: GetShippingDocumentsRequest
): Promise<GetShippingDocumentsResponse> {
  return globalEFetch<GetShippingDocumentsResponse>(
    '/Order/GetShippingDocuments',
    request
  )
}

/**
 * Notify Global-E that orders have been dispatched and retrieve carrier manifest.
 * This is API call #2 in the Global-E shipping flow.
 */
export async function dispatchOrders(
  request: DispatchOrdersRequest
): Promise<DispatchOrdersResponse> {
  return globalEFetch<DispatchOrdersResponse>(
    '/Order/DispatchOrders',
    request
  )
}

/**
 * Void a previously declared parcel (e.g. if label was generated but order not shipped).
 */
export async function voidParcel(
  request: VoidParcelRequest
): Promise<VoidParcelResponse> {
  return globalEFetch<VoidParcelResponse>(
    '/Parcel/VoidParcel',
    request
  )
}

// ============================================================================
// Helpers
// ============================================================================

/** Document type codes from Global-E API */
export const DOCUMENT_TYPES = {
  COMMERCIAL_INVOICE: '1',
  PACKING_LIST: '2',
  SHIPPER_MANIFEST: '3',
  LABEL: '4',
  VAT_INVOICE: '5',
  DANGEROUS_GOODS: '6',
  GE_LABEL: '7',
  CUSTOMER_RECEIPT: '8',
  ARCHIVE_LABEL: '9',
  DELIVERY_ADVICE: '10',
} as const

/**
 * Extract the shipping label document(s) from a GetShippingDocuments response.
 * Returns label documents (type 4 = carrier label, type 7 = GE hub label).
 */
export function extractLabels(response: GetShippingDocumentsResponse): GlobalEDocument[] {
  if (!response.Documents) return []
  return response.Documents.filter(
    d => d.DocumentTypeCode === DOCUMENT_TYPES.LABEL ||
         d.DocumentTypeCode === DOCUMENT_TYPES.GE_LABEL
  )
}

/**
 * Extract commercial invoice document(s) from a GetShippingDocuments response.
 * Only returned for non-Paperless-Trading countries.
 */
export function extractCommercialInvoices(response: GetShippingDocumentsResponse): GlobalEDocument[] {
  if (!response.Documents) return []
  return response.Documents.filter(
    d => d.DocumentTypeCode === DOCUMENT_TYPES.COMMERCIAL_INVOICE
  )
}

/**
 * Build the parcels array from order items (single-parcel case).
 * Filters out insurance/shipping line items, groups by SKU.
 */
export function buildParcelsFromItems(
  orderNumber: string,
  items: Array<{ sku?: string; quantity?: number; name?: string }>
): GlobalEParcel[] {
  const filtered = items.filter(item => {
    const sku = (item.sku || '').toUpperCase()
    const name = (item.name || '').toUpperCase()
    return !sku.includes('INSURANCE') && !sku.includes('SHIPPING') &&
           !name.includes('INSURANCE') && !name.includes('SHIPPING')
  })

  const products: GlobalEParcelProduct[] = filtered.map(item => ({
    ProductCode: item.sku || 'UNKNOWN',
    DeliveryQuantity: item.quantity || 1,
  }))

  const cleanOrderNum = orderNumber.replace('#', '')

  return [{
    ParcelCode: `${cleanOrderNum}-1`,
    Products: products,
  }]
}
