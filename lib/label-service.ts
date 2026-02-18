import { prisma } from '@/lib/prisma'
import { submitPrintJob } from '@/lib/printnode'
import { updateItemFulfillment, revertItemFulfillment, isNetSuiteConfigured } from '@/lib/netsuite'

const SHIPENGINE_API_KEY = process.env.SHIPENGINE_API_KEY
const SHIPENGINE_LABELS_URL = 'https://api.shipengine.com/v1/labels'

function normalizeCountryCode(country?: string): string {
  const c = (country || 'US').trim().toUpperCase()
  const map: Record<string, string> = {
    'UNITED STATES': 'US', 'USA': 'US', 'U.S.A.': 'US', 'U.S.': 'US',
    'CANADA': 'CA', 'MEXICO': 'MX', 'UNITED KINGDOM': 'GB', 'UK': 'GB',
    'AUSTRALIA': 'AU', 'GERMANY': 'DE', 'FRANCE': 'FR', 'JAPAN': 'JP',
  }
  return map[c] || (c.length === 2 ? c : 'US')
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateLabelParams {
  orderId: string
  locationId: string
  printerId?: number
  userName: string
}

export interface LabelResult {
  success: boolean
  trackingNumber?: string
  labelUrl?: string
  labelCost?: number
  carrier?: string
  serviceName?: string
  printStatus: 'sent' | 'opened_pdf' | 'failed' | 'not_printed'
  printJobId?: number
  netsuiteUpdated: boolean
  netsuiteError?: string
  netsuiteResponse?: any
  netsuiteSkipReason?: string
  error?: string
}

export interface VoidResult {
  success: boolean
  error?: string
  netsuiteReverted?: boolean
  netsuiteError?: string
  order?: any
}

export interface ReprintResult {
  success: boolean
  printJobId?: number
  error?: string
}

// ---------------------------------------------------------------------------
// createLabel
// ---------------------------------------------------------------------------

export async function createLabel(params: CreateLabelParams): Promise<LabelResult> {
  const { orderId, locationId, printerId, userName } = params

  // 1. Load order + location
  const order = await prisma.orderLog.findUnique({ where: { id: orderId } })
  if (!order) return { success: false, error: 'Order not found', printStatus: 'not_printed', netsuiteUpdated: false }

  if (order.status !== 'AWAITING_SHIPMENT') {
    return { success: false, error: `Cannot create label for order with status ${order.status}`, printStatus: 'not_printed', netsuiteUpdated: false }
  }

  const location = await prisma.location.findUnique({ where: { id: locationId } })
  if (!location) return { success: false, error: 'Ship-from location not found', printStatus: 'not_printed', netsuiteUpdated: false }

  // 2. Validate pre-conditions
  const rate = order.preShoppedRate as any
  if (!rate?.serviceCode) return { success: false, error: 'No carrier/service assigned', printStatus: 'not_printed', netsuiteUpdated: false }

  if (!order.shippedWeight || order.shippedWeight <= 0) {
    return { success: false, error: 'Weight must be set', printStatus: 'not_printed', netsuiteUpdated: false }
  }

  const box = order.suggestedBox as any
  if (!box?.lengthInches || !box?.widthInches || !box?.heightInches) {
    return { success: false, error: 'Box dimensions must be set', printStatus: 'not_printed', netsuiteUpdated: false }
  }

  const rawPayload = order.rawPayload as any
  const orderData = Array.isArray(rawPayload) ? rawPayload[0] : rawPayload
  const shipTo = orderData?.shipTo
  if (!shipTo?.street1 || !shipTo?.city || !shipTo?.postalCode) {
    return { success: false, error: 'Ship-to address is incomplete', printStatus: 'not_printed', netsuiteUpdated: false }
  }

  if (!SHIPENGINE_API_KEY) {
    return { success: false, error: 'ShipEngine API key not configured', printStatus: 'not_printed', netsuiteUpdated: false }
  }

  // 3. Build ShipEngine label request
  const shipToCountry = normalizeCountryCode(shipTo.country)
  const shipFromCountry = normalizeCountryCode(location.country || undefined)

  const seRequest = {
    shipment: {
      service_code: rate.serviceCode,
      carrier_id: rate.carrierId || undefined,
      validate_address: 'no_validation',
      ship_to: {
        name: shipTo.name || 'Customer',
        company_name: shipTo.company || undefined,
        address_line1: shipTo.street1,
        address_line2: shipTo.street2 || undefined,
        city_locality: shipTo.city,
        state_province: shipTo.state,
        postal_code: shipTo.postalCode,
        country_code: shipToCountry,
        phone: shipTo.phone || undefined,
        address_residential_indicator: 'yes',
      },
      ship_from: {
        name: location.name,
        company_name: location.company || undefined,
        address_line1: location.addressLine1,
        address_line2: location.addressLine2 || undefined,
        city_locality: location.city,
        state_province: location.state,
        postal_code: location.postalCode,
        country_code: shipFromCountry,
        phone: location.phone || undefined,
        address_residential_indicator: 'no',
      },
      packages: [{
        weight: { value: order.shippedWeight, unit: 'pound' },
        dimensions: {
          length: box.lengthInches,
          width: box.widthInches,
          height: box.heightInches,
          unit: 'inch',
        },
        label_messages: {
          reference1: order.orderNumber,
        },
      }],
      label_format: 'pdf',
    },
  }

  // 4. Call ShipEngine
  let seData: any
  try {
    const res = await fetch(SHIPENGINE_LABELS_URL, {
      method: 'POST',
      headers: { 'API-Key': SHIPENGINE_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(seRequest),
    })
    seData = await res.json()
    if (!res.ok) {
      const errMsg = seData.errors?.map((e: any) => e.message).join('; ') || seData.message || 'ShipEngine label creation failed'
      console.error('[Label Service] ShipEngine error:', errMsg)
      return { success: false, error: errMsg, printStatus: 'not_printed', netsuiteUpdated: false }
    }
  } catch (e: any) {
    return { success: false, error: e.message || 'Network error calling ShipEngine', printStatus: 'not_printed', netsuiteUpdated: false }
  }

  const trackingNumber = seData.tracking_number || ''
  const labelUrl = seData.label_download?.pdf || seData.label_download?.href || ''
  const labelCost = seData.shipment_cost?.amount || 0
  const labelId = seData.label_id || ''
  const shipmentId = seData.shipment_id || ''
  const carrierCode = seData.carrier_code || rate.carrierCode || ''
  const carrierName = rate.carrier || carrierCode
  const serviceName = rate.serviceName || rate.serviceCode || ''

  // 5. Try printing
  let printStatus: LabelResult['printStatus'] = 'not_printed'
  let printJobId: number | undefined

  if (printerId && labelUrl) {
    try {
      printJobId = await submitPrintJob(printerId, `Label: ${order.orderNumber}`, labelUrl)
      printStatus = 'sent'
    } catch (e: any) {
      console.error('[Label Service] Print failed:', e.message)
      printStatus = 'failed'
    }
  } else if (!printerId) {
    printStatus = 'opened_pdf'
  }

  // 6. Push to NetSuite
  let netsuiteUpdated = false
  let netsuiteError: string | undefined
  let netsuiteResponse: any = undefined
  let netsuiteSkipReason: string | undefined

  const netsuiteIfId = orderData?.netsuiteIfId
  if (!netsuiteIfId) {
    netsuiteSkipReason = 'No netsuiteIfId found in order payload'
    console.log('[Label Service] NetSuite skipped:', netsuiteSkipReason)
  } else if (!isNetSuiteConfigured()) {
    netsuiteSkipReason = 'NetSuite credentials not configured'
    console.log('[Label Service] NetSuite skipped:', netsuiteSkipReason)
  } else {
    console.log(`[Label Service] Pushing to NetSuite IF ${netsuiteIfId}...`)
    try {
      const nsResult = await updateItemFulfillment({
        internalId: netsuiteIfId,
        trackingNumber,
        carrier: carrierName,
        shippingCost: labelCost,
        packages: [{
          packageTrackingNumber: trackingNumber,
          packageWeight: order.shippedWeight || 0,
          packageDescr: box.boxName || undefined,
        }],
      })
      netsuiteResponse = { status: nsResult.status, data: nsResult.data }
      console.log(`[Label Service] NetSuite response: ${nsResult.status}`, JSON.stringify(nsResult.data).substring(0, 500))
      if (nsResult.status >= 200 && nsResult.status < 300) {
        netsuiteUpdated = true
      } else {
        netsuiteError = `NetSuite returned ${nsResult.status}: ${typeof nsResult.data === 'string' ? nsResult.data : JSON.stringify(nsResult.data)}`
        console.error('[Label Service] NetSuite error:', netsuiteError)
      }
    } catch (e: any) {
      netsuiteError = e.message || 'NetSuite update failed'
      netsuiteResponse = { error: netsuiteError }
      console.error('[Label Service] NetSuite exception:', netsuiteError)
    }
  }

  // 7. Update OrderLog with all statuses
  await prisma.orderLog.update({
    where: { id: orderId },
    data: {
      trackingNumber,
      carrier: carrierName,
      labelUrl,
      labelCost,
      labelId,
      shipmentId,
      shippedAt: new Date(),
      status: 'SHIPPED',
      printStatus,
      netsuiteUpdated,
    },
  })

  // 8. Create ShipmentLog entry
  const nsLogDetail = netsuiteError
    ? netsuiteError
    : netsuiteSkipReason
      ? `Skipped: ${netsuiteSkipReason}`
      : netsuiteResponse
        ? JSON.stringify(netsuiteResponse)
        : null

  await prisma.shipmentLog.create({
    data: {
      orderLogId: orderId,
      action: 'LABEL_CREATED',
      labelId,
      shipmentId,
      trackingNumber,
      carrier: carrierName,
      serviceCode: rate.serviceCode,
      serviceName,
      labelCost,
      labelUrl,
      labelFormat: 'pdf',
      printJobId: printJobId ? BigInt(printJobId) : null,
      printStatus,
      netsuiteUpdated,
      netsuiteError: nsLogDetail,
      createdByName: userName || 'System',
    },
  })

  return {
    success: true,
    trackingNumber,
    labelUrl,
    labelCost,
    carrier: carrierName,
    serviceName,
    printStatus,
    printJobId,
    netsuiteUpdated,
    netsuiteError,
    netsuiteResponse,
    netsuiteSkipReason,
  }
}

// ---------------------------------------------------------------------------
// voidLabel
// ---------------------------------------------------------------------------

export async function voidLabel(orderId: string, userName: string, reason?: string): Promise<VoidResult> {
  console.log(`[Void Label] Starting void for order ${orderId} by ${userName}, reason: ${reason || 'none'}`)

  const order = await prisma.orderLog.findUnique({ where: { id: orderId } })
  if (!order) { console.log('[Void Label] Order not found'); return { success: false, error: 'Order not found' } }

  console.log(`[Void Label] Order status: ${order.status}, labelId: ${order.labelId}, trackingNumber: ${order.trackingNumber}, shippedAt: ${order.shippedAt}`)

  if (order.status !== 'SHIPPED') { console.log('[Void Label] Order is not SHIPPED, aborting'); return { success: false, error: 'Order is not shipped' } }
  if (!order.labelId) { console.log('[Void Label] No labelId on order'); return { success: false, error: 'No label ID found — cannot void' } }

  // Check void window (24 hours)
  if (order.shippedAt) {
    const hoursSince = (Date.now() - new Date(order.shippedAt).getTime()) / (1000 * 60 * 60)
    console.log(`[Void Label] Hours since shipped: ${hoursSince.toFixed(2)}`)
    if (hoursSince > 24) {
      return { success: false, error: 'Void window expired — labels can only be voided within 24 hours of creation' }
    }
  }

  if (!SHIPENGINE_API_KEY) return { success: false, error: 'ShipEngine API key not configured' }

  // Call ShipEngine void
  console.log(`[Void Label] Calling ShipEngine PUT /v1/labels/${order.labelId}/void`)
  try {
    const res = await fetch(`https://api.shipengine.com/v1/labels/${order.labelId}/void`, {
      method: 'PUT',
      headers: { 'API-Key': SHIPENGINE_API_KEY, 'Content-Type': 'application/json' },
    })
    const data = await res.json()
    console.log(`[Void Label] ShipEngine response: ${res.status}`, JSON.stringify(data))
    if (!res.ok || data.approved === false) {
      console.log('[Void Label] ShipEngine rejected void')
      return { success: false, error: data.message || 'ShipEngine rejected the void request' }
    }
  } catch (e: any) {
    console.error('[Void Label] ShipEngine fetch error:', e.message)
    return { success: false, error: e.message || 'Failed to void label with ShipEngine' }
  }

  // Try to revert NetSuite IF
  let netsuiteReverted = false
  let netsuiteError: string | undefined

  const rawPayload = order.rawPayload as any
  const orderData = Array.isArray(rawPayload) ? rawPayload[0] : rawPayload
  const netsuiteIfId = orderData?.netsuiteIfId
  console.log(`[Void Label] NetSuite IF ID: ${netsuiteIfId || 'none'}`)

  // Check if the last LABEL_CREATED log had netsuiteUpdated = true
  const lastLog = await prisma.shipmentLog.findFirst({
    where: { orderLogId: orderId, action: 'LABEL_CREATED', netsuiteUpdated: true },
    orderBy: { createdAt: 'desc' },
  })
  console.log(`[Void Label] Last LABEL_CREATED log with NS updated: ${lastLog ? 'found' : 'none'}`)

  if (netsuiteIfId && lastLog && isNetSuiteConfigured()) {
    console.log(`[Void Label] Attempting NetSuite revert for IF ${netsuiteIfId}`)
    try {
      const nsResult = await revertItemFulfillment(netsuiteIfId)
      console.log(`[Void Label] NetSuite revert response: ${nsResult.status}`, JSON.stringify(nsResult.data))
      if (nsResult.status >= 200 && nsResult.status < 300) {
        netsuiteReverted = true
      } else {
        netsuiteError = `NetSuite revert returned ${nsResult.status}: ${typeof nsResult.data === 'string' ? nsResult.data : JSON.stringify(nsResult.data)}`
      }
    } catch (e: any) {
      netsuiteError = e.message || 'NetSuite revert failed'
      console.error('[Void Label] NetSuite revert exception:', netsuiteError)
    }
  }

  // Save the void tracking info before clearing
  const voidedTrackingNumber = order.trackingNumber
  const voidedCarrier = order.carrier

  console.log(`[Void Label] Resetting order to AWAITING_SHIPMENT`)
  // Reset OrderLog
  const updatedOrder = await prisma.orderLog.update({
    where: { id: orderId },
    data: {
      trackingNumber: null,
      carrier: null,
      labelUrl: null,
      labelCost: null,
      labelId: null,
      shipmentId: null,
      shippedAt: null,
      printStatus: null,
      netsuiteUpdated: false,
      status: 'AWAITING_SHIPMENT',
    },
  })
  console.log(`[Void Label] Order reset complete. NS reverted: ${netsuiteReverted}, NS error: ${netsuiteError || 'none'}`)

  // Create void log
  await prisma.shipmentLog.create({
    data: {
      orderLogId: orderId,
      action: 'LABEL_VOIDED',
      trackingNumber: voidedTrackingNumber,
      carrier: voidedCarrier,
      voidReason: reason || 'Voided by user',
      createdByName: userName || 'System',
      netsuiteUpdated: netsuiteReverted,
      netsuiteError: netsuiteError || null,
    },
  })

  return { success: true, order: updatedOrder, netsuiteReverted, netsuiteError }
}

// ---------------------------------------------------------------------------
// reprintLabel
// ---------------------------------------------------------------------------

export async function reprintLabel(orderId: string, printerId: number, userName: string): Promise<ReprintResult> {
  const order = await prisma.orderLog.findUnique({ where: { id: orderId } })
  if (!order) return { success: false, error: 'Order not found' }
  if (!order.labelUrl) return { success: false, error: 'No label URL — cannot reprint' }

  try {
    const printJobId = await submitPrintJob(printerId, `Reprint: ${order.orderNumber}`, order.labelUrl)

    await prisma.shipmentLog.create({
      data: {
        orderLogId: orderId,
        action: 'LABEL_REPRINTED',
        trackingNumber: order.trackingNumber,
        carrier: order.carrier,
        labelUrl: order.labelUrl,
        printJobId: BigInt(printJobId),
        printStatus: 'sent',
        createdByName: userName || 'System',
        netsuiteUpdated: false,
      },
    })

    return { success: true, printJobId }
  } catch (e: any) {
    return { success: false, error: e.message || 'Print job failed' }
  }
}
