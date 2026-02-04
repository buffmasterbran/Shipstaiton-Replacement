import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/orders/lookup?orderNumber=12345
 * Look up a single order by its order number for Scan to Verify.
 * Returns the order with its items from rawPayload,
 * plus a skuBarcodeMap so the scanner can match barcodes to SKUs.
 */
export async function GET(request: NextRequest) {
  const orderNumber = request.nextUrl.searchParams.get('orderNumber')

  if (!orderNumber) {
    return NextResponse.json({ error: 'orderNumber is required' }, { status: 400 })
  }

  try {
    const order = await prisma.orderLog.findFirst({
      where: { orderNumber: orderNumber.trim() },
    })

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Extract SKUs from the order items so we can look up their barcodes
    const payload = order.rawPayload as any
    const orderObj = Array.isArray(payload) ? payload[0] : payload
    const rawItems = orderObj?.items || []
    const skusInOrder: string[] = rawItems
      .map((item: any) => item.sku)
      .filter(Boolean)

    // Fetch barcode mappings for all SKUs in this order
    let skuBarcodeMap: Record<string, string> = {}
    if (skusInOrder.length > 0) {
      const skuRecords = await prisma.productSku.findMany({
        where: {
          sku: { in: skusInOrder },
        },
        select: {
          sku: true,
          barcode: true,
        },
      })

      for (const rec of skuRecords) {
        if (rec.barcode) {
          skuBarcodeMap[rec.sku] = rec.barcode
        }
      }
    }

    return NextResponse.json({ order, skuBarcodeMap })
  } catch (err) {
    console.error('Order lookup error:', err)
    return NextResponse.json({ error: 'Failed to look up order' }, { status: 500 })
  }
}
