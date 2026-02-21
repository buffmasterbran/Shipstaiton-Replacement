/**
 * Shipping Provider Router
 *
 * Central routing layer that detects whether an order uses a direct carrier
 * connection (UPS Direct, FedEx Direct) or ShipEngine, and dispatches
 * address validation, rating, label creation, and void calls accordingly.
 *
 * Direct carrier service codes follow the pattern:
 *   "ups-direct:03"          → UPS service code "03" via direct UPS API
 *   "fedex-direct:FEDEX_GROUND" → FedEx service code via direct FedEx API
 *
 * The carrierId field stores the connection UUID for direct carriers,
 * or the ShipEngine carrier account ID for ShipEngine carriers.
 */

import { prisma } from '@/lib/prisma'
import {
  getUPSToken,
  validateAddress as validateUPSAddress,
  getUPSRate,
  rateShopUPS,
  UPS_SERVICES,
  type UPSConnectionConfig,
} from '@/lib/shipping/ups/auth'
import {
  getFedExToken,
  validateFedExAddress,
  getFedExRate,
  rateShopFedEx,
  FEDEX_SERVICES,
  type FedExConnectionConfig,
} from '@/lib/shipping/fedex/auth'

const SETTING_KEY = 'direct_connections'

// ─── Types ───────────────────────────────────────────────────────────────────

export type DirectCarrier = 'ups-direct' | 'fedex-direct'

export interface DirectShipmentRequest {
  shipTo: {
    name: string
    company?: string
    street1: string
    street2?: string
    city: string
    state: string
    postalCode: string
    country: string
    phone?: string
    residential?: boolean
  }
  shipFrom: {
    name: string
    company?: string
    street1: string
    street2?: string
    city: string
    state: string
    postalCode: string
    country: string
    phone?: string
  }
  weight: number
  dimensions: { length: number; width: number; height: number }
  serviceCode: string
  orderNumber: string
}

export interface DirectLabelResult {
  success: boolean
  trackingNumber?: string
  labelBase64?: string
  labelFormat?: 'GIF' | 'PNG' | 'PDF'
  labelCost?: number
  carrier?: string
  serviceName?: string
  shipmentId?: string
  error?: string
}

export interface DirectVoidResult {
  success: boolean
  error?: string
}

export interface DirectRateResult {
  success: boolean
  serviceCode: string
  serviceName: string
  price: number
  currency: string
  deliveryDays: number | null
  carrier: string
  carrierCode: string
  carrierId: string
  error?: string
}

export interface DirectAddressResult {
  status: 'verified' | 'unverified' | 'warning' | 'error'
  originalAddress: Record<string, any>
  matchedAddress: Record<string, any> | null
  messages: Array<{ type: string; code: string; message: string }>
  classification?: string
}

// ─── Detection helpers ───────────────────────────────────────────────────────

export function isDirectCarrier(carrierCode: string | undefined): carrierCode is DirectCarrier {
  return carrierCode === 'ups-direct' || carrierCode === 'fedex-direct'
}

/**
 * Parse a direct carrier service code like "ups-direct:03" into its parts.
 * Returns null if not a direct carrier service code.
 */
export function parseDirectServiceCode(serviceCode: string): {
  carrierCode: DirectCarrier
  rawServiceCode: string
} | null {
  if (serviceCode.startsWith('ups-direct:')) {
    return { carrierCode: 'ups-direct', rawServiceCode: serviceCode.replace('ups-direct:', '') }
  }
  if (serviceCode.startsWith('fedex-direct:')) {
    return { carrierCode: 'fedex-direct', rawServiceCode: serviceCode.replace('fedex-direct:', '') }
  }
  return null
}

// ─── Connection loading ──────────────────────────────────────────────────────

interface StoredConnection {
  id: string
  nickname: string
  clientId: string
  clientSecret: string
  accountNumber: string
  sandbox: boolean
  enabledServices?: string[]
  status?: string
}

async function loadConnection(connectionId: string): Promise<{
  connection: StoredConnection
  carrier: 'ups' | 'fedex'
} | null> {
  const setting = await prisma.appSetting.findUnique({ where: { key: SETTING_KEY } })
  if (!setting?.value) return null

  const connections = setting.value as any

  const upsConns: StoredConnection[] = Array.isArray(connections.ups) ? connections.ups : []
  const found = upsConns.find(c => c.id === connectionId)
  if (found) return { connection: found, carrier: 'ups' }

  const fedexConns: StoredConnection[] = Array.isArray(connections.fedex) ? connections.fedex : []
  const foundFedex = fedexConns.find(c => c.id === connectionId)
  if (foundFedex) return { connection: foundFedex, carrier: 'fedex' }

  return null
}

function toUPSConfig(conn: StoredConnection): UPSConnectionConfig {
  return {
    clientId: conn.clientId,
    clientSecret: conn.clientSecret,
    accountNumber: conn.accountNumber,
    sandbox: conn.sandbox,
  }
}

function toFedExConfig(conn: StoredConnection): FedExConnectionConfig {
  return {
    clientId: conn.clientId,
    clientSecret: conn.clientSecret,
    accountNumber: conn.accountNumber,
    sandbox: conn.sandbox,
  }
}

// ─── Label Creation ──────────────────────────────────────────────────────────

export async function createDirectLabel(
  carrierId: string,
  carrierCode: DirectCarrier,
  rawServiceCode: string,
  shipment: DirectShipmentRequest,
): Promise<DirectLabelResult> {
  const loaded = await loadConnection(carrierId)
  if (!loaded) {
    return { success: false, error: `Direct connection ${carrierId} not found` }
  }

  const { connection, carrier } = loaded

  if (carrier === 'ups') {
    return createUPSLabel(toUPSConfig(connection), rawServiceCode, shipment)
  } else {
    return createFedExLabel(toFedExConfig(connection), rawServiceCode, shipment)
  }
}

async function createUPSLabel(
  config: UPSConnectionConfig,
  serviceCode: string,
  shipment: DirectShipmentRequest,
): Promise<DirectLabelResult> {
  let token: string
  try {
    token = await getUPSToken(config)
  } catch (err: any) {
    return { success: false, error: `UPS OAuth failed: ${err.message || String(err)}` }
  }

  const svcEntry = UPS_SERVICES.find(s => s.code === serviceCode)
  const serviceName = svcEntry?.name || `UPS Service ${serviceCode}`
  const base = config.sandbox ? 'https://wwwcie.ups.com' : 'https://onlinetools.ups.com'

  const shipRequest = {
    ShipmentRequest: {
      Request: {
        SubVersion: '1801',
        RequestOption: 'nonvalidate',
        TransactionReference: { CustomerContext: `order-${shipment.orderNumber}` },
      },
      Shipment: {
        Description: `Order ${shipment.orderNumber}`,
        Shipper: {
          Name: shipment.shipFrom.company || shipment.shipFrom.name,
          AttentionName: shipment.shipFrom.name,
          Phone: { Number: shipment.shipFrom.phone || '0000000000' },
          ShipperNumber: config.accountNumber,
          Address: {
            AddressLine: [shipment.shipFrom.street1, shipment.shipFrom.street2].filter(Boolean),
            City: shipment.shipFrom.city,
            StateProvinceCode: shipment.shipFrom.state,
            PostalCode: shipment.shipFrom.postalCode,
            CountryCode: shipment.shipFrom.country || 'US',
          },
        },
        ShipTo: {
          Name: shipment.shipTo.name || 'Customer',
          AttentionName: shipment.shipTo.name || 'Customer',
          Phone: { Number: shipment.shipTo.phone || '0000000000' },
          Address: {
            AddressLine: [shipment.shipTo.street1, shipment.shipTo.street2].filter(Boolean),
            City: shipment.shipTo.city,
            StateProvinceCode: shipment.shipTo.state,
            PostalCode: shipment.shipTo.postalCode,
            CountryCode: shipment.shipTo.country || 'US',
            ...(shipment.shipTo.residential ? { ResidentialAddressIndicator: '' } : {}),
          },
        },
        ShipFrom: {
          Name: shipment.shipFrom.company || shipment.shipFrom.name,
          AttentionName: shipment.shipFrom.name,
          Phone: { Number: shipment.shipFrom.phone || '0000000000' },
          Address: {
            AddressLine: [shipment.shipFrom.street1, shipment.shipFrom.street2].filter(Boolean),
            City: shipment.shipFrom.city,
            StateProvinceCode: shipment.shipFrom.state,
            PostalCode: shipment.shipFrom.postalCode,
            CountryCode: shipment.shipFrom.country || 'US',
          },
        },
        PaymentInformation: {
          ShipmentCharge: {
            Type: '01',
            BillShipper: { AccountNumber: config.accountNumber },
          },
        },
        Service: { Code: serviceCode, Description: serviceName },
        Package: {
          Description: `Package for ${shipment.orderNumber}`,
          Packaging: { Code: '02', Description: 'Customer Supplied Package' },
          Dimensions: {
            UnitOfMeasurement: { Code: 'IN', Description: 'Inches' },
            Length: String(Math.ceil(shipment.dimensions.length)),
            Width: String(Math.ceil(shipment.dimensions.width)),
            Height: String(Math.ceil(shipment.dimensions.height)),
          },
          PackageWeight: {
            UnitOfMeasurement: { Code: 'LBS', Description: 'Pounds' },
            Weight: String(shipment.weight),
          },
          PackageServiceOptions: {
            DeclaredValue: undefined,
          },
        },
        ReferenceNumber: {
          Code: 'PO',
          Value: shipment.orderNumber,
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
        'transId': `ship-${shipment.orderNumber}-${Date.now()}`,
        'transactionSrc': 'pirani-batch-tool',
      },
      body: JSON.stringify(shipRequest),
    })

    if (!res.ok) {
      const errText = await res.text()
      return { success: false, error: `UPS Shipping API returned ${res.status}: ${errText}` }
    }

    const data = await res.json()
    const shipResult = data?.ShipmentResponse?.ShipmentResults

    const trackingNumber = shipResult?.PackageResults?.TrackingNumber
      || shipResult?.PackageResults?.[0]?.TrackingNumber || ''

    const labelBase64 = shipResult?.PackageResults?.ShippingLabel?.GraphicImage
      || shipResult?.PackageResults?.[0]?.ShippingLabel?.GraphicImage

    const charges = shipResult?.ShipmentCharges?.TotalCharges
    const labelCost = charges?.MonetaryValue ? parseFloat(charges.MonetaryValue) : 0

    const shipmentId = shipResult?.ShipmentIdentificationNumber || ''

    return {
      success: true,
      trackingNumber,
      labelBase64,
      labelFormat: 'GIF',
      labelCost,
      carrier: 'UPS Direct',
      serviceName,
      shipmentId,
    }
  } catch (err: any) {
    return { success: false, error: err.message || String(err) }
  }
}

async function createFedExLabel(
  config: FedExConnectionConfig,
  serviceCode: string,
  shipment: DirectShipmentRequest,
): Promise<DirectLabelResult> {
  let token: string
  try {
    token = await getFedExToken(config)
  } catch (err: any) {
    return { success: false, error: `FedEx OAuth failed: ${err.message || String(err)}` }
  }

  const svcEntry = FEDEX_SERVICES.find(s => s.code === serviceCode)
  const serviceName = svcEntry?.name || `FedEx ${serviceCode}`
  const base = config.sandbox ? 'https://apis-sandbox.fedex.com' : 'https://apis.fedex.com'

  const shipBody = {
    labelResponseOptions: 'LABEL',
    accountNumber: { value: config.accountNumber },
    requestedShipment: {
      shipper: {
        contact: {
          personName: shipment.shipFrom.name,
          phoneNumber: shipment.shipFrom.phone || '0000000000',
          companyName: shipment.shipFrom.company || shipment.shipFrom.name,
        },
        address: {
          streetLines: [shipment.shipFrom.street1, shipment.shipFrom.street2].filter(Boolean),
          city: shipment.shipFrom.city,
          stateOrProvinceCode: shipment.shipFrom.state,
          postalCode: shipment.shipFrom.postalCode,
          countryCode: shipment.shipFrom.country || 'US',
        },
      },
      recipients: [{
        contact: {
          personName: shipment.shipTo.name || 'Customer',
          phoneNumber: shipment.shipTo.phone || '0000000000',
          companyName: shipment.shipTo.company || undefined,
        },
        address: {
          streetLines: [shipment.shipTo.street1, shipment.shipTo.street2].filter(Boolean),
          city: shipment.shipTo.city,
          stateOrProvinceCode: shipment.shipTo.state,
          postalCode: shipment.shipTo.postalCode,
          countryCode: shipment.shipTo.country || 'US',
          residential: shipment.shipTo.residential ?? true,
        },
      }],
      pickupType: 'DROPOFF_AT_FEDEX_LOCATION',
      serviceType: serviceCode,
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
        weight: { units: 'LB', value: shipment.weight },
        dimensions: {
          length: Math.ceil(shipment.dimensions.length),
          width: Math.ceil(shipment.dimensions.width),
          height: Math.ceil(shipment.dimensions.height),
          units: 'IN',
        },
        customerReferences: [{
          customerReferenceType: 'P_O_NUMBER',
          value: shipment.orderNumber,
        }],
      }],
    },
  }

  try {
    const res = await fetch(`${base}/ship/v1/shipments`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'x-locale': 'en_US',
      },
      body: JSON.stringify(shipBody),
    })

    if (!res.ok) {
      const errText = await res.text()
      return { success: false, error: `FedEx Ship API returned ${res.status}: ${errText}` }
    }

    const data = await res.json()
    const txn = data?.output?.transactionShipments?.[0]
    const pkg = txn?.pieceResponses?.[0]

    const trackingNumber = pkg?.trackingNumber || txn?.masterTrackingNumber || ''
    const labelBase64 = pkg?.packageDocuments?.[0]?.encodedLabel
      || txn?.shipmentDocuments?.[0]?.encodedLabel

    const charges = txn?.completedShipmentDetail?.shipmentRating?.shipmentRateDetails?.[0]
    const labelCost = charges?.totalNetCharge
      ? parseFloat(String(charges.totalNetCharge))
      : charges?.totalNetFedExCharge
        ? parseFloat(String(charges.totalNetFedExCharge))
        : 0

    const shipmentId = txn?.masterTrackingNumber || trackingNumber

    return {
      success: true,
      trackingNumber,
      labelBase64,
      labelFormat: 'PNG',
      labelCost,
      carrier: 'FedEx Direct',
      serviceName,
      shipmentId,
    }
  } catch (err: any) {
    return { success: false, error: err.message || String(err) }
  }
}

// ─── Void Label ──────────────────────────────────────────────────────────────

export async function voidDirectLabel(
  carrierId: string,
  carrierCode: DirectCarrier,
  shipmentId: string,
  trackingNumber: string,
): Promise<DirectVoidResult> {
  const loaded = await loadConnection(carrierId)
  if (!loaded) {
    return { success: false, error: `Direct connection ${carrierId} not found` }
  }

  const { connection, carrier } = loaded

  if (carrier === 'ups') {
    return voidUPSLabel(toUPSConfig(connection), shipmentId)
  } else {
    return voidFedExLabel(toFedExConfig(connection), trackingNumber)
  }
}

async function voidUPSLabel(
  config: UPSConnectionConfig,
  shipmentId: string,
): Promise<DirectVoidResult> {
  let token: string
  try {
    token = await getUPSToken(config)
  } catch (err: any) {
    return { success: false, error: `UPS OAuth failed: ${err.message || String(err)}` }
  }

  const base = config.sandbox ? 'https://wwwcie.ups.com' : 'https://onlinetools.ups.com'

  try {
    const res = await fetch(`${base}/api/shipments/v2409/void/cancel/${shipmentId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'transId': `void-${Date.now()}`,
        'transactionSrc': 'pirani-batch-tool',
      },
    })

    if (!res.ok) {
      const errText = await res.text()
      return { success: false, error: `UPS Void API returned ${res.status}: ${errText}` }
    }

    const data = await res.json()
    const status = data?.VoidShipmentResponse?.SummaryResult?.Status?.Description
    if (status === 'Voided' || status === 'Success') {
      return { success: true }
    }
    return { success: false, error: `UPS void status: ${status || 'Unknown'}` }
  } catch (err: any) {
    return { success: false, error: err.message || String(err) }
  }
}

async function voidFedExLabel(
  config: FedExConnectionConfig,
  trackingNumber: string,
): Promise<DirectVoidResult> {
  let token: string
  try {
    token = await getFedExToken(config)
  } catch (err: any) {
    return { success: false, error: `FedEx OAuth failed: ${err.message || String(err)}` }
  }

  const base = config.sandbox ? 'https://apis-sandbox.fedex.com' : 'https://apis.fedex.com'

  try {
    const res = await fetch(`${base}/ship/v1/shipments/cancel`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'x-locale': 'en_US',
      },
      body: JSON.stringify({
        accountNumber: { value: config.accountNumber },
        senderCountryCode: 'US',
        deletionControl: 'DELETE_ALL_PACKAGES',
        trackingNumber,
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      return { success: false, error: `FedEx Cancel API returned ${res.status}: ${errText}` }
    }

    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || String(err) }
  }
}

// ─── Address Validation ──────────────────────────────────────────────────────

export async function validateDirectAddress(
  carrierId: string,
  carrierCode: DirectCarrier,
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
): Promise<DirectAddressResult> {
  const loaded = await loadConnection(carrierId)
  if (!loaded) {
    return {
      status: 'error',
      originalAddress: address,
      matchedAddress: null,
      messages: [{ type: 'error', code: 'config_error', message: `Direct connection ${carrierId} not found` }],
    }
  }

  const { connection, carrier } = loaded

  // Helper: compare original vs corrected to decide verified vs warning
  function resolveStatus(
    original: { street1: string; city: string; state: string; postalCode: string },
    corrected: { street: string; city: string; state: string; postalCode: string },
  ): 'verified' | 'warning' {
    const norm = (s: string) => s.trim().toUpperCase().replace(/[.,#]/g, '')
    const origZip = norm(original.postalCode).split('-')[0]
    const corrZip = norm(corrected.postalCode).split('-')[0]

    if (
      norm(original.street1) !== norm(corrected.street) ||
      norm(original.city) !== norm(corrected.city) ||
      norm(original.state) !== norm(corrected.state) ||
      origZip !== corrZip
    ) {
      return 'warning'
    }
    return 'verified'
  }

  if (carrier === 'ups') {
    const result = await validateUPSAddress(toUPSConfig(connection), {
      street: address.street1,
      city: address.city,
      state: address.state,
      postalCode: address.postalCode,
      country: address.country || 'US',
    })

    if (!result.success || result.candidates.length === 0) {
      return {
        status: 'error',
        originalAddress: address,
        matchedAddress: null,
        messages: [{ type: 'error', code: 'validation_failed', message: result.error || 'Address validation failed' }],
      }
    }

    const best = result.candidates[0]
    const matchedAddress = {
      name: address.name,
      company: address.company || '',
      street1: best.street,
      street2: '',
      city: best.city,
      state: best.state,
      postalCode: best.postalCode,
      country: best.country,
      phone: address.phone || '',
      residential: best.classification === 'Residential',
    }
    const status = resolveStatus(address, best)
    const messages: DirectAddressResult['messages'] = status === 'warning'
      ? [{ type: 'warning', code: 'corrected_address', message: 'The carrier suggested a corrected address.' }]
      : []

    return {
      status,
      originalAddress: address,
      matchedAddress,
      messages,
      classification: best.classification,
    }
  } else {
    const result = await validateFedExAddress(toFedExConfig(connection), {
      street: address.street1,
      city: address.city,
      state: address.state,
      postalCode: address.postalCode,
      country: address.country || 'US',
    })

    if (!result.success || result.candidates.length === 0) {
      return {
        status: 'error',
        originalAddress: address,
        matchedAddress: null,
        messages: [{ type: 'error', code: 'validation_failed', message: result.error || 'Address validation failed' }],
      }
    }

    const best = result.candidates[0]
    const matchedAddress = {
      name: address.name,
      company: address.company || '',
      street1: best.street,
      street2: '',
      city: best.city,
      state: best.state,
      postalCode: best.postalCode,
      country: best.country,
      phone: address.phone || '',
      residential: best.classification === 'Residential',
    }
    const status = resolveStatus(address, best)
    const messages: DirectAddressResult['messages'] = status === 'warning'
      ? [{ type: 'warning', code: 'corrected_address', message: 'The carrier suggested a corrected address.' }]
      : []

    return {
      status,
      originalAddress: address,
      matchedAddress,
      messages,
      classification: best.classification,
    }
  }
}

// ─── Rate Shopping ───────────────────────────────────────────────────────────

/**
 * Get a rate for a specific direct carrier service.
 * Returns a normalized rate result compatible with the ShipEngine rate format.
 */
export async function getDirectRate(
  carrierId: string,
  carrierCode: DirectCarrier,
  rawServiceCode: string,
  shipTo: { city: string; state: string; postalCode: string; country: string; residential?: boolean },
  shipFrom: { city: string; state: string; postalCode: string; country: string },
  weight: number,
  dimensions: { length: number; width: number; height: number },
): Promise<DirectRateResult> {
  const loaded = await loadConnection(carrierId)
  if (!loaded) {
    return {
      success: false,
      serviceCode: `${carrierCode}:${rawServiceCode}`,
      serviceName: rawServiceCode,
      price: 0,
      currency: 'USD',
      deliveryDays: null,
      carrier: carrierCode,
      carrierCode,
      carrierId,
      error: `Direct connection ${carrierId} not found`,
    }
  }

  const { connection, carrier } = loaded

  if (carrier === 'ups') {
    const svcEntry = UPS_SERVICES.find(s => s.code === rawServiceCode)
    const result = await getUPSRate(
      toUPSConfig(connection),
      rawServiceCode,
      String(weight),
      {
        length: String(Math.ceil(dimensions.length)),
        width: String(Math.ceil(dimensions.width)),
        height: String(Math.ceil(dimensions.height)),
      },
    )
    return {
      success: result.success,
      serviceCode: `ups-direct:${rawServiceCode}`,
      serviceName: svcEntry?.name || result.serviceName,
      price: result.totalCharges ? parseFloat(result.totalCharges) : 0,
      currency: result.currencyCode || 'USD',
      deliveryDays: result.transitDays ? parseInt(result.transitDays) : null,
      carrier: `UPS Direct - ${connection.nickname}`,
      carrierCode: 'ups-direct',
      carrierId: connection.id,
      error: result.error,
    }
  } else {
    const svcEntry = FEDEX_SERVICES.find(s => s.code === rawServiceCode)
    const result = await getFedExRate(
      toFedExConfig(connection),
      rawServiceCode,
      String(weight),
      {
        length: String(Math.ceil(dimensions.length)),
        width: String(Math.ceil(dimensions.width)),
        height: String(Math.ceil(dimensions.height)),
      },
    )
    return {
      success: result.success,
      serviceCode: `fedex-direct:${rawServiceCode}`,
      serviceName: svcEntry?.name || result.serviceName,
      price: result.totalCharges ? parseFloat(result.totalCharges) : 0,
      currency: result.currencyCode || 'USD',
      deliveryDays: result.transitDays ? parseInt(result.transitDays) : null,
      carrier: `FedEx Direct - ${connection.nickname}`,
      carrierCode: 'fedex-direct',
      carrierId: connection.id,
      error: result.error,
    }
  }
}

/**
 * Get all enabled direct carrier connections with their enabled services.
 * Used by rate shopping to include direct carriers alongside ShipEngine.
 */
export async function getDirectCarrierServices(): Promise<Array<{
  carrierId: string
  carrierCode: DirectCarrier
  carrierName: string
  services: Array<{ code: string; name: string }>
  connection: StoredConnection
}>> {
  const setting = await prisma.appSetting.findUnique({ where: { key: SETTING_KEY } })
  if (!setting?.value) return []

  const connections = setting.value as any
  const result: Array<{
    carrierId: string
    carrierCode: DirectCarrier
    carrierName: string
    services: Array<{ code: string; name: string }>
    connection: StoredConnection
  }> = []

  const upsConns: StoredConnection[] = Array.isArray(connections.ups) ? connections.ups : []
  for (const conn of upsConns) {
    if (conn.status !== 'connected') continue
    result.push({
      carrierId: conn.id,
      carrierCode: 'ups-direct',
      carrierName: `UPS Direct - ${conn.nickname}`,
      services: UPS_SERVICES.map(svc => ({ code: svc.code, name: svc.name })),
      connection: conn,
    })
  }

  const fedexConns: StoredConnection[] = Array.isArray(connections.fedex) ? connections.fedex : []
  for (const conn of fedexConns) {
    if (conn.status !== 'connected') continue
    result.push({
      carrierId: conn.id,
      carrierCode: 'fedex-direct',
      carrierName: `FedEx Direct - ${conn.nickname}`,
      services: FEDEX_SERVICES.map(svc => ({ code: svc.code, name: svc.name })),
      connection: conn,
    })
  }

  return result
}
