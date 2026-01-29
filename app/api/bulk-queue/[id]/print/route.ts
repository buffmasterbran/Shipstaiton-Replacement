import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSizeFromSku, getColorFromSku, isShippingInsurance } from '@/lib/order-utils'

/** GET: returns HTML for pick list + labels for this queue item (for packer to print after verification) */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const item = await prisma.bulkQueueItem.findUnique({ where: { id } })
    if (!item) {
      return new NextResponse('Queue item not found', { status: 404 })
    }
    if (item.status === 'COMPLETED') {
      return new NextResponse('Labels already printed for this batch', { status: 400 })
    }

    const orderNumbers = item.orderNumbers as string[]
    const orders = await prisma.orderLog.findMany({
      where: { orderNumber: { in: orderNumbers } },
      orderBy: { createdAt: 'asc' },
    })

    const packageInfo = item.packageInfo as {
      carrier: string
      service: string
      packaging: string
      weight: string
      dimensions: { length: string; width: string; height: string }
    }

    // Build group-like structure: orders array with { log, order, customerName, orderDate }, items from first order
    const ordersWithPayload = orders.map((log) => {
      const raw = log.rawPayload as any
      const order = Array.isArray(raw) ? raw[0] : raw
      const customerName = order?.shipTo?.name || order?.billTo?.name || 'Unknown'
      const orderDate = order?.orderDate || log.createdAt
      return {
        log: { id: log.id, orderNumber: log.orderNumber, status: log.status, rawPayload: log.rawPayload, createdAt: log.createdAt, updatedAt: log.updatedAt },
        order,
        customerName,
        orderDate: typeof orderDate === 'string' ? orderDate : (orderDate as Date).toISOString(),
      }
    })

    const firstOrder = ordersWithPayload[0]?.order
    const firstItems = (firstOrder?.items || []).filter(
      (it: any) => !isShippingInsurance(it.sku || '', it.name || '')
    )
    const items = firstItems.map((it: any) => ({
      sku: it.sku || 'N/A',
      name: it.name || 'Unknown',
      quantity: it.quantity || 1,
      size: getSizeFromSku(it.sku || ''),
      color: getColorFromSku(it.sku || '', it.name),
    }))

    const itemMap = new Map<string, { sku: string; name: string; totalQty: number; size: string; color: string }>()
    ordersWithPayload.forEach((orderData) => {
      const order = orderData.order
      const orderItems = order?.items || []
      orderItems.forEach((it: any) => {
        if (isShippingInsurance(it.sku || '', it.name || '')) return
        const sku = it.sku || 'N/A'
        const qty = it.quantity || 1
        const existing = itemMap.get(sku)
        if (existing) {
          existing.totalQty += qty
        } else {
          itemMap.set(sku, {
            sku,
            name: it.name || 'N/A',
            totalQty: qty,
            size: getSizeFromSku(sku),
            color: getColorFromSku(sku, it.name),
          })
        }
      })
    })
    const aggregatedItems = Array.from(itemMap.values())
    const totalItems = aggregatedItems.reduce((s, i) => s + i.totalQty, 0)
    const totalOrders = ordersWithPayload.length

    const generateTrackingNumber = (orderNumber: string) => {
      const d = orderNumber.padStart(22, '0').slice(-22)
      return `420 ${d.slice(0, 5)} ${d.slice(5, 9)} ${d.slice(9, 13)} ${d.slice(13, 17)} ${d.slice(17, 21)} ${d.slice(21, 22)}`
    }
    const getServiceIndicator = (service: string) => {
      if (service.includes('Express')) return 'E'
      if (service.includes('Priority')) return 'P'
      if (service.includes('First Class')) return 'FC'
      return 'P'
    }
    const getServiceName = (service: string) => {
      if (service.includes('Express')) return 'USPS PRIORITY MAIL EXPRESS®'
      if (service.includes('Priority')) return 'USPS PRIORITY MAIL®'
      if (service.includes('First Class')) return 'USPS FIRST-CLASS MAIL®'
      return 'USPS PRIORITY MAIL®'
    }
    const getCurrentDate = () => {
      const now = new Date()
      return `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}/${String(now.getFullYear()).slice(-2)}`
    }

    const labelInfo = packageInfo
    const html = `<!DOCTYPE html>
<html>
<head>
  <title>Pick List & Labels - ${item.batchId ?? `Chunk ${item.chunkIndex + 1}/${item.totalChunks}`}</title>
  <style>
    @page { size: 4in 6in; margin: 0; }
    * { color: #000 !important; }
    body { font-family: Arial, sans-serif; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page { width: 4in; height: 6in; padding: 8px; box-sizing: border-box; page-break-after: always; border: 1px solid #000; }
    .label { width: 100%; height: 100%; box-sizing: border-box; display: flex; flex-direction: column; overflow: hidden; }
    .pick-label { border: 2px solid #000; padding: 10px; }
    .pick-label-header { font-weight: bold; font-size: 18px; text-align: center; border-bottom: 2px solid #000; padding-bottom: 6px; margin-bottom: 8px; }
    .pick-list-item { margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid #000; }
    .usps-label { border: 2px solid #000; padding: 0; position: relative; height: 100%; width: 100%; }
    .usps-top-left { position: absolute; top: 6px; left: 6px; font-size: 9px; }
    .usps-service-indicator-large { font-size: 48px; font-weight: bold; }
    .usps-top-right { position: absolute; top: 6px; right: 6px; text-align: right; font-size: 8px; max-width: 1.2in; }
    .usps-service-banner { position: absolute; top: 0.5in; left: 0; right: 0; background: #000; color: #fff; text-align: center; font-size: 12px; font-weight: bold; padding: 3px 0; }
    .usps-sender-address { position: absolute; top: 0.75in; left: 0.5in; font-size: 9px; }
    .usps-ship-to-label { position: absolute; top: 1.3in; left: 0.5in; font-size: 8px; font-weight: bold; }
    .usps-delivery-address { position: absolute; top: 1.45in; left: 0.5in; font-size: 11px; font-weight: bold; max-width: 2.5in; }
    .usps-barcode-section { position: absolute; bottom: 0.6in; left: 0.2in; right: 0.2in; }
    .usps-linear-barcode { border: 2px solid #000; height: 0.5in; margin: 2px 0; background: repeating-linear-gradient(90deg, #000 0, #000 2px, transparent 2px, transparent 4px); }
    .usps-tracking-number { font-family: 'Courier New', monospace; font-size: 9px; text-align: center; margin-top: 2px; font-weight: bold; }
    .usps-footer { position: absolute; bottom: 0.1in; left: 0.2in; right: 0.2in; font-size: 7px; text-align: center; border-top: 1px solid #000; padding-top: 2px; }
    @media print { .page { page-break-after: always; } * { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
</head>
<body>
  <div class="page">
    <div class="label pick-label">
      <div class="pick-label-header">PICK LIST - ${item.batchId ?? `Chunk ${item.chunkIndex + 1} of ${item.totalChunks}`}</div>
      <div style="font-size: 18px; font-weight: bold; text-align: center; margin-bottom: 10px;">Total Orders: ${totalOrders}</div>
      <div style="font-size: 16px; font-weight: bold; text-align: center; margin-bottom: 12px;">Total Items: ${totalItems}</div>
      ${aggregatedItems.map((i) => `
        <div class="pick-list-item">
          <div style="font-weight: bold; font-size: 13px;"><span style="font-family: monospace;">${i.sku}</span></div>
          <div style="font-size: 11px;">${i.name}</div>
          <div style="font-size: 10px;">Size: ${i.size} | Color: ${i.color}</div>
          <div style="font-size: 16px; font-weight: bold; text-align: center;">Qty: ${i.totalQty}</div>
        </div>
      `).join('')}
      <div style="margin-top: auto; border-top: 2px solid #000; padding-top: 6px; font-size: 10px;">
        <strong>Shipping:</strong> ${labelInfo.carrier} ${labelInfo.service} | ${labelInfo.packaging} | ${labelInfo.weight} lbs | ${labelInfo.dimensions.length}"×${labelInfo.dimensions.width}"×${labelInfo.dimensions.height}"
      </div>
    </div>
  </div>
  ${ordersWithPayload.map((orderData) => {
    const order = orderData.order
    const shipTo = order?.shipTo || {}
    const billTo = order?.billTo || {}
    const trackingNumber = generateTrackingNumber(orderData.log.orderNumber)
    const serviceIndicator = getServiceIndicator(labelInfo.service)
    const senderZip = billTo.postalCode || '12345'
    const fromZip = senderZip.slice(0, 5)
    const currentDate = getCurrentDate()
    const serviceName = getServiceName(labelInfo.service)
    const approvalNumber = orderData.log.orderNumber.padStart(9, '0').slice(-9)
    return `
  <div class="page">
    <div class="label usps-label">
      <div class="usps-top-left">
        <div class="usps-service-indicator-large">${serviceIndicator}</div>
        <div class="usps-date-from">${currentDate}</div>
        <div class="usps-date-from">From ${fromZip}</div>
      </div>
      <div class="usps-top-right">US POSTAGE PAID<br>${labelInfo.carrier}<br>${labelInfo.packaging}</div>
      <div class="usps-service-banner">${serviceName}</div>
      <div class="usps-sender-address">${billTo.name || 'Sender'}<br>${billTo.street1 || ''}<br>${billTo.city || ''} ${billTo.state || ''} ${billTo.postalCode || ''}</div>
      <div class="usps-ship-to-label">SHIP TO:</div>
      <div class="usps-delivery-address">
        <div>${shipTo.name || 'N/A'}</div>
        ${shipTo.street1 ? `<div>${shipTo.street1}</div>` : ''}
        ${shipTo.street2 ? `<div>${shipTo.street2}</div>` : ''}
        <div>${shipTo.city || ''} ${shipTo.state || ''} ${shipTo.postalCode || ''}</div>
      </div>
      <div class="usps-barcode-section">
        <div class="usps-linear-barcode"></div>
        <div class="usps-tracking-number">${trackingNumber}</div>
      </div>
      <div class="usps-footer">Electronic Rate #${approvalNumber} | Order: ${orderData.log.orderNumber} | ${labelInfo.weight} lbs</div>
    </div>
  </div>
    `
  }).join('')}
</body>
</html>`

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  } catch (error: any) {
    console.error('Error generating bulk print HTML:', error)
    return NextResponse.json(
      { error: 'Failed to generate print', details: error?.message },
      { status: 500 }
    )
  }
}
