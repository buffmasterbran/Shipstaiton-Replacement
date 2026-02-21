import { prisma } from '@/lib/prisma'
import { submitPrintJob, submitPrintJobBase64 } from '@/lib/printnode'
import { updateItemFulfillment, revertItemFulfillment, isNetSuiteConfigured } from '@/lib/netsuite'
import { shopRates, getDefaultRateShopper, type ShipToAddress } from '@/lib/rate-shop'
import {
  isDirectCarrier,
  parseDirectServiceCode,
  createDirectLabel,
  voidDirectLabel,
  type DirectShipmentRequest,
} from '@/lib/shipping/provider-router'

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
  let rate = order.preShoppedRate as any

  // Safety net: if service is still __RATE_SHOP__, run rate shopping now
  if (rate?.serviceCode === '__RATE_SHOP__') {
    const box = order.suggestedBox as any
    if (!box?.lengthInches || !order.shippedWeight) {
      return { success: false, error: 'Cannot rate shop without weight and box dimensions', printStatus: 'not_printed', netsuiteUpdated: false }
    }
    const rawPayload = order.rawPayload as any
    const orderData = Array.isArray(rawPayload) ? rawPayload[0] : rawPayload
    const st = orderData?.shipTo || {}
    const shipTo: ShipToAddress = {
      name: st.name || '', street1: st.street1 || st.address1 || '',
      street2: st.street2 || st.address2, city: st.city || '',
      state: st.state || '', postalCode: st.postalCode || st.zip || '',
      country: st.country || 'US', residential: st.residential !== false,
    }
    const rateShopper = await getDefaultRateShopper(prisma)
    if (!rateShopper) {
      return { success: false, error: 'No rate shopper configured for rate shopping', printStatus: 'not_printed', netsuiteUpdated: false }
    }
    const rsResult = await shopRates(prisma, shipTo, order.shippedWeight, {
      length: box.lengthInches, width: box.widthInches, height: box.heightInches,
    }, rateShopper)
    if (!rsResult.success || !rsResult.rate) {
      return { success: false, error: rsResult.error || 'Rate shopping failed', printStatus: 'not_printed', netsuiteUpdated: false }
    }
    rate = {
      carrierId: rsResult.rate.carrierId, carrierCode: rsResult.rate.carrierCode,
      carrier: rsResult.rate.carrier, serviceCode: rsResult.rate.serviceCode,
      serviceName: rsResult.rate.serviceName, price: rsResult.rate.price,
      currency: rsResult.rate.currency, deliveryDays: rsResult.rate.deliveryDays,
      rateId: rsResult.rate.rateId,
    }
    await prisma.orderLog.update({ where: { id: orderId }, data: { preShoppedRate: rate as any, rateShopStatus: 'SUCCESS', rateFetchedAt: new Date() } })
  }

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

  // 3. Route to direct carrier or ShipEngine
  const directParsed = parseDirectServiceCode(rate.serviceCode)
  const useDirectCarrier = directParsed && isDirectCarrier(rate.carrierCode)

  let trackingNumber = ''
  let labelUrl = ''
  let labelBase64 = ''
  let labelFormat = 'pdf'
  let labelCost = 0
  let labelId = ''
  let shipmentId = ''
  let carrierCode = rate.carrierCode || ''
  let carrierName = rate.carrier || carrierCode
  let serviceName = rate.serviceName || rate.serviceCode || ''

  let useShipEngineFallback = false

  if (useDirectCarrier && directParsed) {
    // ── Direct Carrier Path (UPS Direct / FedEx Direct) ──
    console.log(`[Label Service] Using direct carrier: ${rate.carrierCode} service ${directParsed.rawServiceCode}`)

    const directShipment: DirectShipmentRequest = {
      shipTo: {
        name: shipTo.name || 'Customer',
        company: shipTo.company,
        street1: shipTo.street1,
        street2: shipTo.street2,
        city: shipTo.city,
        state: shipTo.state,
        postalCode: shipTo.postalCode,
        country: normalizeCountryCode(shipTo.country),
        phone: shipTo.phone,
        residential: shipTo.residential !== false,
      },
      shipFrom: {
        name: location.name,
        company: location.company || undefined,
        street1: location.addressLine1,
        street2: location.addressLine2 || undefined,
        city: location.city,
        state: location.state,
        postalCode: location.postalCode,
        country: normalizeCountryCode(location.country || undefined),
        phone: location.phone || undefined,
      },
      weight: order.shippedWeight!,
      dimensions: { length: box.lengthInches, width: box.widthInches, height: box.heightInches },
      serviceCode: directParsed.rawServiceCode,
      orderNumber: order.orderNumber,
    }

    const directResult = await createDirectLabel(
      rate.carrierId,
      directParsed.carrierCode,
      directParsed.rawServiceCode,
      directShipment,
    )

    if (!directResult.success) {
      // Silent fallback: if ShipEngine fallback info exists, retry via ShipEngine
      if (rate.fallbackServiceCode && rate.fallbackCarrierId && SHIPENGINE_API_KEY) {
        console.log(`[Label Service] Direct carrier failed (${directResult.error}), falling back to ShipEngine`)
        rate = {
          ...rate,
          carrierId: rate.fallbackCarrierId,
          carrierCode: rate.fallbackCarrierCode || '',
          serviceCode: rate.fallbackServiceCode,
        }
        useShipEngineFallback = true
      } else {
        console.error('[Label Service] Direct carrier error:', directResult.error)
        return { success: false, error: directResult.error || 'Direct carrier label creation failed', printStatus: 'not_printed', netsuiteUpdated: false }
      }
    } else {
      trackingNumber = directResult.trackingNumber || ''
      labelBase64 = directResult.labelBase64 || ''
      labelFormat = (directResult.labelFormat || 'GIF').toLowerCase()
      labelCost = directResult.labelCost || 0
      shipmentId = directResult.shipmentId || ''
      carrierName = directResult.carrier || carrierName
      serviceName = directResult.serviceName || serviceName
    }
  }

  if (!useDirectCarrier || useShipEngineFallback) {
    // ── ShipEngine Path (primary or fallback) ──
    if (!SHIPENGINE_API_KEY) {
      return { success: false, error: 'ShipEngine API key not configured', printStatus: 'not_printed', netsuiteUpdated: false }
    }

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

    if (useShipEngineFallback) {
      console.log('[Label Service] ShipEngine fallback succeeded')
    }

    trackingNumber = seData.tracking_number || ''
    labelUrl = seData.label_download?.pdf || seData.label_download?.href || ''
    labelCost = seData.shipment_cost?.amount || 0
    labelId = seData.label_id || ''
    shipmentId = seData.shipment_id || ''
    carrierCode = seData.carrier_code || rate.carrierCode || ''
    carrierName = rate.carrier || carrierCode
    serviceName = rate.serviceName || rate.serviceCode || ''
  }

  // 4. Try printing
  let printStatus: LabelResult['printStatus'] = 'not_printed'
  let printJobId: number | undefined

  if (printerId && (labelUrl || labelBase64)) {
    try {
      if (labelBase64) {
        const contentType = labelFormat === 'png' ? 'image/png' : labelFormat === 'gif' ? 'image/gif' : 'application/pdf'
        printJobId = await submitPrintJobBase64(printerId, `Label: ${order.orderNumber}`, labelBase64, contentType)
      } else {
        printJobId = await submitPrintJob(printerId, `Label: ${order.orderNumber}`, labelUrl)
      }
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
  // For direct carriers, store a data URI so the label can be reprinted
  const storedLabelUrl = labelUrl || (labelBase64 ? `data:image/${labelFormat};base64,${labelBase64}` : '')

  await prisma.orderLog.update({
    where: { id: orderId },
    data: {
      trackingNumber,
      carrier: carrierName,
      labelUrl: storedLabelUrl,
      labelCost,
      labelId: labelId || shipmentId,
      shipmentId: shipmentId || labelId,
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
      labelId: labelId || shipmentId,
      shipmentId: shipmentId || labelId,
      trackingNumber,
      carrier: carrierName,
      serviceCode: rate.serviceCode,
      serviceName,
      labelCost,
      labelUrl: storedLabelUrl,
      labelFormat: labelFormat || 'pdf',
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
    labelUrl: storedLabelUrl,
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

  // Determine if this was a direct carrier label
  const rate = order.preShoppedRate as any
  const directParsed = rate?.serviceCode ? parseDirectServiceCode(rate.serviceCode) : null
  const isDirect = directParsed && isDirectCarrier(rate?.carrierCode)

  if (isDirect && directParsed) {
    console.log(`[Void Label] Voiding via direct carrier: ${rate.carrierCode}`)
    const voidResult = await voidDirectLabel(
      rate.carrierId,
      directParsed.carrierCode,
      order.shipmentId || order.labelId || '',
      order.trackingNumber || '',
    )
    if (!voidResult.success) {
      console.log('[Void Label] Direct carrier rejected void:', voidResult.error)
      return { success: false, error: voidResult.error || 'Direct carrier rejected the void request' }
    }
  } else {
    if (!SHIPENGINE_API_KEY) return { success: false, error: 'ShipEngine API key not configured' }

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
      labelPrepurchased: false,
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

// ---------------------------------------------------------------------------
// prepurchaseLabel — Buy label at pick-complete, mark SHIPPED, skip print + NS
// ---------------------------------------------------------------------------

export interface PrepurchaseResult {
  success: boolean
  trackingNumber?: string
  labelUrl?: string
  labelCost?: number
  carrier?: string
  serviceName?: string
  error?: string
}

export async function prepurchaseLabel(orderId: string, locationId: string): Promise<PrepurchaseResult> {
  const tag = `[prepurchaseLabel]`
  const order = await prisma.orderLog.findUnique({ where: { id: orderId } })
  if (!order) { console.warn(`${tag} Order ${orderId} not found in DB`); return { success: false, error: 'Order not found' } }

  if (order.status !== 'AWAITING_SHIPMENT') {
    console.warn(`${tag} #${order.orderNumber} status=${order.status}, expected AWAITING_SHIPMENT`)
    return { success: false, error: `Cannot prepurchase label for order with status ${order.status}` }
  }

  if (order.labelPrepurchased) {
    console.warn(`${tag} #${order.orderNumber} already prepurchased, skipping`)
    return { success: false, error: 'Label already prepurchased' }
  }

  const location = await prisma.location.findUnique({ where: { id: locationId } })
  if (!location) { console.warn(`${tag} #${order.orderNumber} location ${locationId} not found`); return { success: false, error: 'Ship-from location not found' } }

  let rate = order.preShoppedRate as any

  if (rate?.serviceCode === '__RATE_SHOP__') {
    console.log(`${tag} #${order.orderNumber} needs live rate shopping (serviceCode=__RATE_SHOP__)`)
    const box = order.suggestedBox as any
    if (!box?.lengthInches || !order.shippedWeight) {
      return { success: false, error: 'Cannot rate shop without weight and box dimensions' }
    }
    const rawPayload = order.rawPayload as any
    const orderData = Array.isArray(rawPayload) ? rawPayload[0] : rawPayload
    const st = orderData?.shipTo || {}
    const shipTo: ShipToAddress = {
      name: st.name || '', street1: st.street1 || st.address1 || '',
      street2: st.street2 || st.address2, city: st.city || '',
      state: st.state || '', postalCode: st.postalCode || st.zip || '',
      country: st.country || 'US', residential: st.residential !== false,
    }
    const rateShopper = await getDefaultRateShopper(prisma)
    if (!rateShopper) return { success: false, error: 'No rate shopper configured' }
    console.log(`${tag} #${order.orderNumber} rate shopping: ${order.shippedWeight}lbs ${box.lengthInches}x${box.widthInches}x${box.heightInches} → ${shipTo.city}, ${shipTo.state} ${shipTo.postalCode}`)
    const rsResult = await shopRates(prisma, shipTo, order.shippedWeight, {
      length: box.lengthInches, width: box.widthInches, height: box.heightInches,
    }, rateShopper)
    if (!rsResult.success || !rsResult.rate) {
      console.warn(`${tag} #${order.orderNumber} rate shopping failed: ${rsResult.error}`)
      return { success: false, error: rsResult.error || 'Rate shopping failed' }
    }
    rate = {
      carrierId: rsResult.rate.carrierId, carrierCode: rsResult.rate.carrierCode,
      carrier: rsResult.rate.carrier, serviceCode: rsResult.rate.serviceCode,
      serviceName: rsResult.rate.serviceName, price: rsResult.rate.price,
      currency: rsResult.rate.currency, deliveryDays: rsResult.rate.deliveryDays,
      rateId: rsResult.rate.rateId,
    }
    console.log(`${tag} #${order.orderNumber} rate shopped → ${rate.carrier} ${rate.serviceName} $${rate.price}`)
    await prisma.orderLog.update({ where: { id: orderId }, data: { preShoppedRate: rate as any, rateShopStatus: 'SUCCESS', rateFetchedAt: new Date() } })
  }

  if (!rate?.serviceCode) return { success: false, error: 'No carrier/service assigned' }
  if (!order.shippedWeight || order.shippedWeight <= 0) return { success: false, error: 'Weight must be set' }

  const box = order.suggestedBox as any
  if (!box?.lengthInches || !box?.widthInches || !box?.heightInches) {
    return { success: false, error: 'Box dimensions must be set' }
  }

  const rawPayload = order.rawPayload as any
  const orderData = Array.isArray(rawPayload) ? rawPayload[0] : rawPayload
  const shipTo = orderData?.shipTo
  if (!shipTo?.street1 || !shipTo?.city || !shipTo?.postalCode) {
    return { success: false, error: 'Ship-to address is incomplete' }
  }

  const directParsed = parseDirectServiceCode(rate.serviceCode)
  const useDirectCarrier = directParsed && isDirectCarrier(rate.carrierCode)

  let trackingNumber = ''
  let labelUrl = ''
  let labelCost = 0
  let labelId = ''
  let shipmentId = ''
  let carrierName = rate.carrier || rate.carrierCode || ''
  let serviceName = rate.serviceName || rate.serviceCode || ''
  let labelFormat = 'pdf'

  let useShipEngineFallback = false

  if (useDirectCarrier && directParsed) {
    console.log(`${tag} #${order.orderNumber} using direct carrier: ${rate.carrierCode} service ${directParsed.rawServiceCode}`)

    const directShipment: DirectShipmentRequest = {
      shipTo: {
        name: shipTo.name || 'Customer',
        company: shipTo.company,
        street1: shipTo.street1,
        street2: shipTo.street2,
        city: shipTo.city,
        state: shipTo.state,
        postalCode: shipTo.postalCode,
        country: normalizeCountryCode(shipTo.country),
        phone: shipTo.phone,
        residential: shipTo.residential !== false,
      },
      shipFrom: {
        name: location.name,
        company: location.company || undefined,
        street1: location.addressLine1,
        street2: location.addressLine2 || undefined,
        city: location.city,
        state: location.state,
        postalCode: location.postalCode,
        country: normalizeCountryCode(location.country || undefined),
        phone: location.phone || undefined,
      },
      weight: order.shippedWeight!,
      dimensions: { length: box.lengthInches, width: box.widthInches, height: box.heightInches },
      serviceCode: directParsed.rawServiceCode,
      orderNumber: order.orderNumber,
    }

    const directResult = await createDirectLabel(
      rate.carrierId,
      directParsed.carrierCode,
      directParsed.rawServiceCode,
      directShipment,
    )

    if (!directResult.success) {
      if (rate.fallbackServiceCode && rate.fallbackCarrierId && SHIPENGINE_API_KEY) {
        console.log(`${tag} #${order.orderNumber} Direct failed (${directResult.error}), falling back to ShipEngine`)
        rate = {
          ...rate,
          carrierId: rate.fallbackCarrierId,
          carrierCode: rate.fallbackCarrierCode || '',
          serviceCode: rate.fallbackServiceCode,
        }
        useShipEngineFallback = true
      } else {
        console.error(`${tag} #${order.orderNumber} Direct carrier error: ${directResult.error}`)
        return { success: false, error: directResult.error || 'Direct carrier label creation failed' }
      }
    } else {
      trackingNumber = directResult.trackingNumber || ''
      labelFormat = (directResult.labelFormat || 'GIF').toLowerCase()
      labelUrl = directResult.labelBase64
        ? `data:image/${labelFormat};base64,${directResult.labelBase64}`
        : ''
      labelCost = directResult.labelCost || 0
      shipmentId = directResult.shipmentId || ''
      carrierName = directResult.carrier || carrierName
      serviceName = directResult.serviceName || serviceName
    }
  }

  if (!useDirectCarrier || useShipEngineFallback) {
    if (!SHIPENGINE_API_KEY) return { success: false, error: 'ShipEngine API key not configured' }

    console.log(`${tag} #${order.orderNumber} calling ShipEngine: ${rate.carrierCode}/${rate.serviceCode} ${order.shippedWeight}lbs ${box.lengthInches}x${box.widthInches}x${box.heightInches} → ${shipTo.city}, ${shipTo.state} ${shipTo.postalCode}`)

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
            length: box.lengthInches, width: box.widthInches, height: box.heightInches,
            unit: 'inch',
          },
          label_messages: { reference1: order.orderNumber },
        }],
        label_format: 'pdf',
      },
    }

    const seStart = Date.now()
    let seData: any
    try {
      const res = await fetch(SHIPENGINE_LABELS_URL, {
        method: 'POST',
        headers: { 'API-Key': SHIPENGINE_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(seRequest),
      })
      seData = await res.json()
      console.log(`${tag} #${order.orderNumber} ShipEngine responded ${res.status} in ${Date.now() - seStart}ms`)
      if (!res.ok) {
        const errMsg = seData.errors?.map((e: any) => e.message).join('; ') || seData.message || 'ShipEngine label creation failed'
        console.error(`${tag} #${order.orderNumber} ShipEngine error: ${errMsg}`)
        return { success: false, error: errMsg }
      }
    } catch (e: any) {
      console.error(`${tag} #${order.orderNumber} ShipEngine network error after ${Date.now() - seStart}ms: ${e.message}`)
      return { success: false, error: e.message || 'Network error calling ShipEngine' }
    }

    trackingNumber = seData.tracking_number || ''
    labelUrl = seData.label_download?.pdf || seData.label_download?.href || ''
    labelCost = seData.shipment_cost?.amount || 0
    labelId = seData.label_id || ''
    shipmentId = seData.shipment_id || ''
    carrierName = rate.carrier || seData.carrier_code || rate.carrierCode || ''
    serviceName = rate.serviceName || rate.serviceCode || ''
  }

  console.log(`${tag} #${order.orderNumber} saving to DB: status=SHIPPED labelPrepurchased=true tracking=${trackingNumber}`)
  await prisma.orderLog.update({
    where: { id: orderId },
    data: {
      trackingNumber,
      carrier: carrierName,
      labelUrl,
      labelCost,
      labelId: labelId || shipmentId,
      shipmentId: shipmentId || labelId,
      shippedAt: new Date(),
      status: 'SHIPPED',
      printStatus: 'not_printed',
      netsuiteUpdated: false,
      labelPrepurchased: true,
    },
  })

  await prisma.shipmentLog.create({
    data: {
      orderLogId: orderId,
      action: 'LABEL_CREATED',
      labelId: labelId || shipmentId,
      shipmentId: shipmentId || labelId,
      trackingNumber,
      carrier: carrierName,
      serviceCode: rate.serviceCode,
      serviceName,
      labelCost,
      labelUrl,
      labelFormat,
      printStatus: 'not_printed',
      netsuiteUpdated: false,
      netsuiteError: 'Skipped: prepurchased at pick-complete (pending scan station)',
      createdByName: 'System (Prepurchase)',
    },
  })

  console.log(`${tag} #${order.orderNumber} DONE — ${carrierName} ${serviceName} $${labelCost.toFixed(2)} tracking=${trackingNumber}`)

  return { success: true, trackingNumber, labelUrl, labelCost, carrier: carrierName, serviceName }
}

// ---------------------------------------------------------------------------
// fulfillPrepurchasedLabel — Print + NetSuite for an already-purchased label
// ---------------------------------------------------------------------------

export interface FulfillResult {
  success: boolean
  printStatus: 'sent' | 'opened_pdf' | 'failed' | 'not_printed'
  printJobId?: number
  netsuiteUpdated: boolean
  netsuiteError?: string
  error?: string
}

export async function fulfillPrepurchasedLabel(params: {
  orderId: string
  printerId?: number
  userName: string
}): Promise<FulfillResult> {
  const { orderId, printerId, userName } = params

  const order = await prisma.orderLog.findUnique({ where: { id: orderId } })
  if (!order) return { success: false, error: 'Order not found', printStatus: 'not_printed', netsuiteUpdated: false }

  if (!order.labelPrepurchased || !order.labelUrl) {
    return { success: false, error: 'Order does not have a prepurchased label', printStatus: 'not_printed', netsuiteUpdated: false }
  }

  // Print the existing label (handle both URLs and data URIs)
  let printStatus: FulfillResult['printStatus'] = 'not_printed'
  let printJobId: number | undefined

  if (printerId && order.labelUrl) {
    try {
      if (order.labelUrl.startsWith('data:')) {
        const base64Match = order.labelUrl.match(/^data:[^;]+;base64,(.+)$/)
        const contentType = order.labelUrl.match(/^data:([^;]+)/)?.[1] || 'image/gif'
        if (base64Match) {
          printJobId = await submitPrintJobBase64(printerId, `Label: ${order.orderNumber}`, base64Match[1], contentType)
        }
      } else {
        printJobId = await submitPrintJob(printerId, `Label: ${order.orderNumber}`, order.labelUrl)
      }
      printStatus = 'sent'
    } catch (e: any) {
      console.error('[Fulfill] Print failed:', e.message)
      printStatus = 'failed'
    }
  } else if (!printerId) {
    printStatus = 'opened_pdf'
  }

  // Push to NetSuite
  let netsuiteUpdated = false
  let netsuiteError: string | undefined

  const rawPayload = order.rawPayload as any
  const orderData = Array.isArray(rawPayload) ? rawPayload[0] : rawPayload
  const netsuiteIfId = orderData?.netsuiteIfId
  const box = order.suggestedBox as any

  if (!netsuiteIfId) {
    console.log('[Fulfill] NetSuite skipped: No netsuiteIfId')
  } else if (!isNetSuiteConfigured()) {
    console.log('[Fulfill] NetSuite skipped: Credentials not configured')
  } else {
    console.log(`[Fulfill] Pushing to NetSuite IF ${netsuiteIfId}...`)
    try {
      const nsResult = await updateItemFulfillment({
        internalId: netsuiteIfId,
        trackingNumber: order.trackingNumber || '',
        carrier: order.carrier || '',
        shippingCost: order.labelCost || 0,
        packages: [{
          packageTrackingNumber: order.trackingNumber || '',
          packageWeight: order.shippedWeight || 0,
          packageDescr: box?.boxName || undefined,
        }],
      })
      console.log(`[Fulfill] NetSuite response: ${nsResult.status}`)
      if (nsResult.status >= 200 && nsResult.status < 300) {
        netsuiteUpdated = true
      } else {
        netsuiteError = `NetSuite returned ${nsResult.status}: ${typeof nsResult.data === 'string' ? nsResult.data : JSON.stringify(nsResult.data)}`
      }
    } catch (e: any) {
      netsuiteError = e.message || 'NetSuite update failed'
      console.error('[Fulfill] NetSuite exception:', netsuiteError)
    }
  }

  await prisma.orderLog.update({
    where: { id: orderId },
    data: {
      printStatus,
      netsuiteUpdated,
    },
  })

  await prisma.shipmentLog.create({
    data: {
      orderLogId: orderId,
      action: 'LABEL_PRINTED',
      trackingNumber: order.trackingNumber,
      carrier: order.carrier,
      labelUrl: order.labelUrl,
      labelCost: order.labelCost,
      printJobId: printJobId ? BigInt(printJobId) : null,
      printStatus,
      netsuiteUpdated,
      netsuiteError: netsuiteError || null,
      createdByName: userName || 'System',
    },
  })

  console.log(`[Fulfill] Completed for ${order.orderNumber}: print=${printStatus}, NS=${netsuiteUpdated}`)

  return { success: true, printStatus, printJobId, netsuiteUpdated, netsuiteError }
}

// ---------------------------------------------------------------------------
// reprintLabel
// ---------------------------------------------------------------------------

export async function reprintLabel(orderId: string, printerId: number, userName: string): Promise<ReprintResult> {
  const order = await prisma.orderLog.findUnique({ where: { id: orderId } })
  if (!order) return { success: false, error: 'Order not found' }
  if (!order.labelUrl) return { success: false, error: 'No label URL — cannot reprint' }

  try {
    let printJobId: number

    if (order.labelUrl.startsWith('data:')) {
      const base64Match = order.labelUrl.match(/^data:[^;]+;base64,(.+)$/)
      const contentType = order.labelUrl.match(/^data:([^;]+)/)?.[1] || 'image/gif'
      if (!base64Match) return { success: false, error: 'Invalid label data URI' }
      printJobId = await submitPrintJobBase64(printerId, `Reprint: ${order.orderNumber}`, base64Match[1], contentType)
    } else {
      printJobId = await submitPrintJob(printerId, `Reprint: ${order.orderNumber}`, order.labelUrl)
    }

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
