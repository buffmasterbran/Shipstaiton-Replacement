import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getBoxes, getFeedbackRules, getPackingEfficiency, findBestBox } from '@/lib/box-config'
import { getProductSizes, matchSkuToSize, recordUnmatchedSkus, ProductSize } from '@/lib/products'

// Type for the cached box suggestion
interface SuggestedBox {
  boxId: string | null
  boxName: string | null
  confidence: 'confirmed' | 'calculated' | 'unknown'
  reason?: string
}

// Result from calculateBoxSuggestion including unmatched SKUs
interface BoxSuggestionResult {
  suggestedBox: SuggestedBox
  unmatchedSkus: Array<{ sku: string; itemName: string | null }>
}

// Calculate box suggestion for an order's items
async function calculateBoxSuggestion(
  items: Array<{ sku?: string; quantity?: number; name?: string }>,
  sizes: ProductSize[],
  boxes: Awaited<ReturnType<typeof getBoxes>>,
  feedbackRules: Awaited<ReturnType<typeof getFeedbackRules>>,
  packingEfficiency: number
): Promise<BoxSuggestionResult> {
  const unmatchedSkus: Array<{ sku: string; itemName: string | null }> = []

  if (!items || items.length === 0) {
    return { suggestedBox: { boxId: null, boxName: null, confidence: 'unknown' }, unmatchedSkus }
  }

  // Filter out insurance items
  const nonInsuranceItems = items.filter(item => {
    const sku = (item.sku || '').toUpperCase()
    const name = (item.name || '').toUpperCase()
    return !sku.includes('INSURANCE') && !sku.includes('SHIPPING') && !name.includes('INSURANCE')
  })

  if (nonInsuranceItems.length === 0) {
    return { suggestedBox: { boxId: null, boxName: null, confidence: 'unknown' }, unmatchedSkus }
  }

  // Map SKUs to product sizes
  const mappedItems: { productId: string; quantity: number; size: ProductSize }[] = []

  for (const item of nonInsuranceItems) {
    const sku = item.sku || ''
    const qty = Number(item.quantity) || 1

    const size = await matchSkuToSize(prisma, sku)
    if (size) {
      mappedItems.push({ productId: size.id, quantity: qty, size })
    } else if (sku) {
      // Track unmatched SKU
      unmatchedSkus.push({ sku, itemName: item.name || null })
    }
  }

  if (mappedItems.length === 0) {
    return { suggestedBox: { boxId: null, boxName: null, confidence: 'unknown' }, unmatchedSkus }
  }

  // CHECK 1: Single item with dedicated box (singleBoxId)
  const totalQty = mappedItems.reduce((sum, i) => sum + i.quantity, 0)
  if (mappedItems.length === 1 && totalQty === 1) {
    const singleSize = mappedItems[0].size
    if (singleSize.singleBoxId) {
      const dedicatedBox = boxes.find(b => b.id === singleSize.singleBoxId && b.active)
      if (dedicatedBox) {
        return {
          suggestedBox: {
            boxId: dedicatedBox.id,
            boxName: dedicatedBox.name,
            confidence: 'confirmed',
            reason: 'dedicated-box',
          },
          unmatchedSkus,
        }
      }
    }
  }

  // CHECK 2: Use standard box fitting algorithm
  const productItems = mappedItems.map(i => ({ productId: i.productId, quantity: i.quantity }))
  const result = findBestBox(productItems, sizes, boxes, feedbackRules, packingEfficiency)

  return {
    suggestedBox: {
      boxId: result.box?.id || null,
      boxName: result.box?.name || null,
      confidence: result.confidence as 'confirmed' | 'calculated' | 'unknown',
    },
    unmatchedSkus,
  }
}

function validateAuth(request: NextRequest): { valid: boolean; error?: string } {
  // Support both Basic Auth (like ShipStation) and x-api-secret header
  const authHeader = request.headers.get('authorization')
  const apiSecretHeader = request.headers.get('x-api-secret')

  // Method 1: Basic Authentication (ShipStation style)
  if (authHeader && authHeader.startsWith('Basic ')) {
    const base64Credentials = authHeader.split(' ')[1]
    try {
      const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8')
      const [apiKey, apiSecret] = credentials.split(':')

      const expectedApiKey = process.env.API_KEY
      const expectedApiSecret = process.env.API_SECRET

      if (!expectedApiKey || !expectedApiSecret) {
        return {
          valid: false,
          error: 'Server configuration error: API_KEY and API_SECRET must be set',
        }
      }

      if (apiKey === expectedApiKey && apiSecret === expectedApiSecret) {
        return { valid: true }
      }

      return {
        valid: false,
        error: 'Unauthorized: Invalid API key or secret',
      }
    } catch (error) {
      return {
        valid: false,
        error: 'Unauthorized: Invalid Basic Auth format',
      }
    }
  }

  // Method 2: x-api-secret header (backward compatibility)
  if (apiSecretHeader) {
    const expectedSecret = process.env.API_SECRET

    if (!expectedSecret) {
      return {
        valid: false,
        error: 'Server configuration error: API_SECRET must be set',
      }
    }

    if (apiSecretHeader === expectedSecret) {
      return { valid: true }
    }

    return {
      valid: false,
      error: 'Unauthorized: Invalid API secret',
    }
  }

  return {
    valid: false,
    error: 'Unauthorized: Missing authentication. Use Basic Auth or x-api-secret header',
  }
}

export async function POST(request: NextRequest) {
  try {
    // Security: Validate authentication
    const authResult = validateAuth(request)
    if (!authResult.valid) {
      return NextResponse.json({ error: authResult.error }, { status: 401 })
    }

    // Parse request body
    const body = await request.json()

    // Normalize polymorphic input: single object or array
    let orders: any[] = []
    if (Array.isArray(body)) {
      orders = body
    } else if (typeof body === 'object' && body !== null) {
      orders = [body]
    } else {
      return NextResponse.json(
        { error: 'Invalid request body: expected object or array' },
        { status: 400 }
      )
    }

    // Load box config data once for all orders
    const [sizes, boxes, feedbackRules, packingEfficiency] = await Promise.all([
      getProductSizes(prisma),
      getBoxes(prisma),
      getFeedbackRules(prisma),
      getPackingEfficiency(prisma),
    ])

    // Collect all unmatched SKUs across orders
    const allUnmatchedSkus: Array<{ sku: string; orderNumber: string; itemName: string | null }> = []

    // Validate and transform orders with box suggestions
    const orderLogs = await Promise.all(orders.map(async (order) => {
      // Extract order_number from the JSON payload
      // Try common field names: order_number, orderNumber, order_id, id
      const orderNumber =
        order.order_number ||
        order.orderNumber ||
        order.order_id ||
        order.id ||
        order.number ||
        'UNKNOWN'

      // Calculate box suggestion based on items
      const items = order.items || []
      const { suggestedBox, unmatchedSkus } = await calculateBoxSuggestion(items, sizes, boxes, feedbackRules, packingEfficiency)

      // Collect unmatched SKUs with order context
      for (const unmatched of unmatchedSkus) {
        allUnmatchedSkus.push({
          sku: unmatched.sku,
          orderNumber: String(orderNumber),
          itemName: unmatched.itemName,
        })
      }

      return {
        orderNumber: String(orderNumber),
        status: 'RECEIVED',
        rawPayload: order,
        suggestedBox: suggestedBox as any, // Prisma Json type
      }
    }))

    // Record unmatched SKUs for tracking
    if (allUnmatchedSkus.length > 0) {
      await recordUnmatchedSkus(prisma, allUnmatchedSkus)
    }

    // Batch insert using Prisma
    const result = await prisma.orderLog.createMany({
      data: orderLogs,
      skipDuplicates: true, // Skip duplicates if order_number already exists
    })

    return NextResponse.json(
      {
        success: true,
        message: `Successfully ingested ${result.count} order(s)`,
        count: result.count,
      },
      { status: 200 }
    )
  } catch (error: any) {
    console.error('Error ingesting batch orders:', error)
    return NextResponse.json(
      {
        error: 'Failed to ingest orders',
        details: error.message || 'Unknown error',
      },
      { status: 500 }
    )
  }
}


