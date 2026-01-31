import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  getProductsConfig,
  addSize,
  updateSize,
  deleteSize,
  addSku,
  updateSku,
  deleteSku,
  calculateVolume,
  type ProductSize,
  type ProductSku,
} from '@/lib/products'

/** GET /api/products - Return full config (sizes + skus) */
export async function GET() {
  try {
    const config = await getProductsConfig(prisma)
    return NextResponse.json(config)
  } catch (error: unknown) {
    console.error('Error fetching products:', error)
    return NextResponse.json(
      { error: 'Failed to fetch products' },
      { status: 500 }
    )
  }
}

/** POST /api/products - Handle various actions */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const action = body.action as string

    switch (action) {
      // ==================== SIZE ACTIONS ====================
      case 'add-size': {
        if (!body.name) {
          return NextResponse.json({ error: 'Name is required' }, { status: 400 })
        }
        if (!body.dimensions) {
          return NextResponse.json({ error: 'Dimensions are required' }, { status: 400 })
        }
        const size = await addSize(prisma, {
          name: body.name,
          dimensions: {
            length: Number(body.dimensions?.length) || 0,
            width: Number(body.dimensions?.width) || 0,
            height: Number(body.dimensions?.height) || 0,
          },
          weight: Number(body.weight) || 0,
          category: body.category || 'other',
          active: body.active !== false,
          fallbackSkuPatterns: Array.isArray(body.fallbackSkuPatterns)
            ? body.fallbackSkuPatterns
            : [],
        })
        return NextResponse.json(size, { status: 201 })
      }

      case 'update-size': {
        if (!body.id) {
          return NextResponse.json({ error: 'Size ID is required' }, { status: 400 })
        }
        const updates: Partial<Omit<ProductSize, 'id'>> = {}
        if (body.name !== undefined) updates.name = body.name
        if (body.dimensions !== undefined) {
          updates.dimensions = {
            length: Number(body.dimensions.length) || 0,
            width: Number(body.dimensions.width) || 0,
            height: Number(body.dimensions.height) || 0,
          }
          updates.volume = calculateVolume(updates.dimensions)
        }
        if (body.weight !== undefined) updates.weight = Number(body.weight)
        if (body.category !== undefined) updates.category = body.category
        if (body.active !== undefined) updates.active = body.active
        if (body.fallbackSkuPatterns !== undefined) {
          updates.fallbackSkuPatterns = body.fallbackSkuPatterns
        }

        const size = await updateSize(prisma, body.id, updates)
        return NextResponse.json(size)
      }

      case 'delete-size': {
        if (!body.id) {
          return NextResponse.json({ error: 'Size ID is required' }, { status: 400 })
        }
        const result = await deleteSize(prisma, body.id)
        if (!result.deleted) {
          return NextResponse.json({ error: 'Size not found' }, { status: 404 })
        }
        return NextResponse.json({
          success: true,
          orphanedSkusRemoved: result.orphanedSkus,
        })
      }

      // ==================== SKU ACTIONS ====================
      case 'add-sku': {
        if (!body.sku) {
          return NextResponse.json({ error: 'SKU is required' }, { status: 400 })
        }
        if (!body.sizeId) {
          return NextResponse.json({ error: 'Size ID is required' }, { status: 400 })
        }
        const sku = await addSku(prisma, {
          sku: body.sku,
          sizeId: body.sizeId,
          name: body.name || undefined,
          barcode: body.barcode || undefined,
          active: body.active !== false,
        })
        return NextResponse.json(sku, { status: 201 })
      }

      case 'update-sku': {
        if (!body.sku) {
          return NextResponse.json({ error: 'SKU is required' }, { status: 400 })
        }
        const skuUpdates: Partial<ProductSku> = {}
        if (body.newSku !== undefined) skuUpdates.sku = body.newSku
        if (body.sizeId !== undefined) skuUpdates.sizeId = body.sizeId
        if (body.name !== undefined) skuUpdates.name = body.name || undefined
        if (body.barcode !== undefined) skuUpdates.barcode = body.barcode || undefined
        if (body.active !== undefined) skuUpdates.active = body.active

        const sku = await updateSku(prisma, body.sku, skuUpdates)
        return NextResponse.json(sku)
      }

      case 'delete-sku': {
        if (!body.sku) {
          return NextResponse.json({ error: 'SKU is required' }, { status: 400 })
        }
        const deleted = await deleteSku(prisma, body.sku)
        if (!deleted) {
          return NextResponse.json({ error: 'SKU not found' }, { status: 404 })
        }
        return NextResponse.json({ success: true })
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}. Valid actions: add-size, update-size, delete-size, add-sku, update-sku, delete-sku` },
          { status: 400 }
        )
    }
  } catch (error: unknown) {
    console.error('Error in products API:', error)
    const message = error instanceof Error ? error.message : 'Failed to process request'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
