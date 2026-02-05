import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  getProductsConfig,
  addProductSize,
  updateProductSize,
  deleteProductSize,
  addProductSku,
  updateProductSku,
  deleteProductSku,
  replacePatternsForSize,
  getUnmatchedSkus,
  dismissUnmatchedSku,
  removeUnmatchedSku,
} from '@/lib/products'

/** GET /api/products - Return full config (sizes + skus + patterns + unmatched) */
export async function GET() {
  try {
    const [config, unmatchedSkus] = await Promise.all([
      getProductsConfig(prisma),
      getUnmatchedSkus(prisma),
    ])
    return NextResponse.json({ ...config, unmatchedSkus })
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

        const size = await addProductSize(prisma, {
          id: body.id,
          name: body.name,
          lengthInches: Number(body.lengthInches ?? body.dimensions?.length) || 0,
          widthInches: Number(body.widthInches ?? body.dimensions?.width) || 0,
          heightInches: Number(body.heightInches ?? body.dimensions?.height) || 0,
          weightLbs: Number(body.weightLbs ?? body.weight) || 0,
          category: body.category || 'other',
          active: body.active !== false,
          singleBoxId: body.singleBoxId || null,
        })

        // Add patterns if provided
        if (body.patterns && Array.isArray(body.patterns) && body.patterns.length > 0) {
          await replacePatternsForSize(prisma, size.id, body.patterns)
        } else if (body.fallbackSkuPatterns && Array.isArray(body.fallbackSkuPatterns) && body.fallbackSkuPatterns.length > 0) {
          await replacePatternsForSize(prisma, size.id, body.fallbackSkuPatterns)
        }

        return NextResponse.json(size, { status: 201 })
      }

      case 'update-size': {
        if (!body.id) {
          return NextResponse.json({ error: 'Size ID is required' }, { status: 400 })
        }

        const updateData: Parameters<typeof updateProductSize>[2] = {}
        if (body.name !== undefined) updateData.name = body.name
        if (body.lengthInches !== undefined) updateData.lengthInches = Number(body.lengthInches)
        if (body.widthInches !== undefined) updateData.widthInches = Number(body.widthInches)
        if (body.heightInches !== undefined) updateData.heightInches = Number(body.heightInches)
        if (body.dimensions !== undefined) {
          updateData.lengthInches = Number(body.dimensions.length)
          updateData.widthInches = Number(body.dimensions.width)
          updateData.heightInches = Number(body.dimensions.height)
        }
        if (body.weightLbs !== undefined) updateData.weightLbs = Number(body.weightLbs)
        if (body.weight !== undefined) updateData.weightLbs = Number(body.weight)
        if (body.category !== undefined) updateData.category = body.category
        if (body.active !== undefined) updateData.active = body.active
        if (body.singleBoxId !== undefined) updateData.singleBoxId = body.singleBoxId || null

        const size = await updateProductSize(prisma, body.id, updateData)

        // Update patterns if provided
        if (body.patterns !== undefined) {
          await replacePatternsForSize(prisma, body.id, body.patterns || [])
        } else if (body.fallbackSkuPatterns !== undefined) {
          await replacePatternsForSize(prisma, body.id, body.fallbackSkuPatterns || [])
        }

        return NextResponse.json(size)
      }

      case 'delete-size': {
        if (!body.id) {
          return NextResponse.json({ error: 'Size ID is required' }, { status: 400 })
        }
        const result = await deleteProductSize(prisma, body.id)
        if (!result.deleted) {
          return NextResponse.json({ error: 'Size not found' }, { status: 404 })
        }
        return NextResponse.json({
          success: true,
          orphanedSkusRemoved: result.orphanedSkus,
          orphanedPatternsRemoved: result.orphanedPatterns,
        })
      }

      // ==================== SKU ACTIONS ====================
      case 'add-sku': {
        if (!body.sku) {
          return NextResponse.json({ error: 'SKU is required' }, { status: 400 })
        }
        if (!body.sizeId && !body.productSizeId) {
          return NextResponse.json({ error: 'Size ID is required' }, { status: 400 })
        }
        const sku = await addProductSku(prisma, {
          sku: body.sku,
          productSizeId: body.sizeId || body.productSizeId,
          name: body.name || undefined,
          barcode: body.barcode || undefined,
          binLocation: body.binLocation || undefined,
          active: body.active !== false,
        })

        // Remove from unmatched SKUs if it was there
        await removeUnmatchedSku(prisma, body.sku.toUpperCase())

        return NextResponse.json(sku, { status: 201 })
      }

      case 'update-sku': {
        if (!body.sku) {
          return NextResponse.json({ error: 'SKU is required' }, { status: 400 })
        }

        const skuUpdateData: Parameters<typeof updateProductSku>[2] = {}
        if (body.newSku !== undefined) skuUpdateData.sku = body.newSku
        if (body.sizeId !== undefined) skuUpdateData.productSizeId = body.sizeId
        if (body.productSizeId !== undefined) skuUpdateData.productSizeId = body.productSizeId
        if (body.name !== undefined) skuUpdateData.name = body.name || null
        if (body.barcode !== undefined) skuUpdateData.barcode = body.barcode || null
        if (body.binLocation !== undefined) skuUpdateData.binLocation = body.binLocation || null
        if (body.active !== undefined) skuUpdateData.active = body.active

        const sku = await updateProductSku(prisma, body.sku, skuUpdateData)
        return NextResponse.json(sku)
      }

      case 'delete-sku': {
        if (!body.sku) {
          return NextResponse.json({ error: 'SKU is required' }, { status: 400 })
        }
        const deleted = await deleteProductSku(prisma, body.sku)
        if (!deleted) {
          return NextResponse.json({ error: 'SKU not found' }, { status: 404 })
        }
        return NextResponse.json({ success: true })
      }

      // ==================== UNMATCHED SKU ACTIONS ====================
      case 'dismiss-unmatched': {
        if (!body.sku) {
          return NextResponse.json({ error: 'SKU is required' }, { status: 400 })
        }
        await dismissUnmatchedSku(prisma, body.sku.toUpperCase())
        return NextResponse.json({ success: true })
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}. Valid actions: add-size, update-size, delete-size, add-sku, update-sku, delete-sku, dismiss-unmatched` },
          { status: 400 }
        )
    }
  } catch (error: unknown) {
    console.error('Error in products API:', error)
    const message = error instanceof Error ? error.message : 'Failed to process request'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
