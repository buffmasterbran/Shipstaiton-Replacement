import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isShippingInsurance } from '@/lib/order-utils'

/**
 * GET /api/orders/lookup?orderNumber=12345
 * Look up a single order by its order number for Scan to Verify.
 * Returns the order with its items from rawPayload,
 * plus a skuBarcodeMap so the scanner can match barcodes to SKUs,
 * and calculated weight (box + products).
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

    // Fetch SKU records with product size (for weight) and barcode
    let skuBarcodeMap: Record<string, string> = {}
    let skuWeightMap: Record<string, number> = {}
    
    if (skusInOrder.length > 0) {
      const skuRecords = await prisma.productSku.findMany({
        where: {
          sku: { in: skusInOrder },
        },
        include: {
          productSize: true,
        },
      })

      for (const rec of skuRecords) {
        if (rec.barcode) {
          skuBarcodeMap[rec.sku] = rec.barcode
        }
        if (rec.productSize?.weightLbs) {
          skuWeightMap[rec.sku] = rec.productSize.weightLbs
        }
      }
    }

    // Calculate total weight: box weight + product weights
    let calculatedWeight = 0
    
    // Add box weight if available
    const suggestedBox = order.suggestedBox as any
    if (suggestedBox?.boxId) {
      const box = await prisma.box.findUnique({
        where: { id: suggestedBox.boxId },
      })
      if (box) {
        calculatedWeight += box.weightLbs
      }
    }

    // Add product weights
    for (const item of rawItems) {
      const sku = item.sku || ''
      const qty = item.quantity || 1
      
      // Skip insurance items
      if (isShippingInsurance(sku, item.name || '')) continue
      
      const weight = skuWeightMap[sku] || 0
      calculatedWeight += weight * qty
    }

    return NextResponse.json({ 
      order, 
      skuBarcodeMap,
      calculatedWeight: Math.max(calculatedWeight, 0.1), // Minimum 0.1 lb
    })
  } catch (err) {
    console.error('Order lookup error:', err)
    return NextResponse.json({ error: 'Failed to look up order' }, { status: 500 })
  }
}
