import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  getBoxConfig,
  setBoxConfig,
  addBox,
  updateBox,
  deleteBox,
  addFeedbackRule,
  deleteFeedbackRule,
  findBestBox,
  buildComboSignature,
  calculateBoxVolume,
  type Box,
} from '@/lib/box-config'
import { getProducts } from '@/lib/products'

/** GET /api/box-config - Return box config */
export async function GET() {
  try {
    const config = await getBoxConfig(prisma)
    return NextResponse.json(config)
  } catch (error: unknown) {
    console.error('Error fetching box config:', error)
    return NextResponse.json(
      { error: 'Failed to fetch box config' },
      { status: 500 }
    )
  }
}

/** POST /api/box-config - Handle various actions */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const action = body.action as string

    switch (action) {
      case 'add-box': {
        if (!body.name || typeof body.name !== 'string') {
          return NextResponse.json({ error: 'Box name is required' }, { status: 400 })
        }
        if (!body.internalDimensions || typeof body.internalDimensions !== 'object') {
          return NextResponse.json({ error: 'Internal dimensions are required' }, { status: 400 })
        }

        const box = await addBox(prisma, {
          name: body.name,
          internalDimensions: {
            length: Number(body.internalDimensions.length) || 0,
            width: Number(body.internalDimensions.width) || 0,
            height: Number(body.internalDimensions.height) || 0,
          },
          priority: Number(body.priority) || 99,
          active: body.active !== false,
          inStock: body.inStock !== false,
        })
        return NextResponse.json(box, { status: 201 })
      }

      case 'update-box': {
        if (!body.id || typeof body.id !== 'string') {
          return NextResponse.json({ error: 'Box ID is required' }, { status: 400 })
        }

        const updates: Partial<Omit<Box, 'id'>> = {}
        if (body.name !== undefined) updates.name = body.name
        if (body.internalDimensions !== undefined) {
          updates.internalDimensions = {
            length: Number(body.internalDimensions.length) || 0,
            width: Number(body.internalDimensions.width) || 0,
            height: Number(body.internalDimensions.height) || 0,
          }
          updates.volume = calculateBoxVolume(updates.internalDimensions)
        }
        if (body.priority !== undefined) updates.priority = Number(body.priority)
        if (body.active !== undefined) updates.active = body.active
        if (body.inStock !== undefined) updates.inStock = body.inStock

        const box = await updateBox(prisma, body.id, updates)
        return NextResponse.json(box)
      }

      case 'delete-box': {
        if (!body.id || typeof body.id !== 'string') {
          return NextResponse.json({ error: 'Box ID is required' }, { status: 400 })
        }
        const deleted = await deleteBox(prisma, body.id)
        if (!deleted) {
          return NextResponse.json({ error: 'Box not found' }, { status: 404 })
        }
        return NextResponse.json({ success: true })
      }

      case 'add-feedback': {
        if (!body.comboSignature || typeof body.comboSignature !== 'string') {
          return NextResponse.json({ error: 'Combo signature is required' }, { status: 400 })
        }
        if (!body.boxId || typeof body.boxId !== 'string') {
          return NextResponse.json({ error: 'Box ID is required' }, { status: 400 })
        }
        if (typeof body.fits !== 'boolean') {
          return NextResponse.json({ error: 'Fits (boolean) is required' }, { status: 400 })
        }

        const rule = await addFeedbackRule(prisma, {
          comboSignature: body.comboSignature,
          boxId: body.boxId,
          fits: body.fits,
          correctBoxId: body.correctBoxId || undefined,
        })
        return NextResponse.json(rule, { status: 201 })
      }

      case 'delete-feedback': {
        if (!body.id || typeof body.id !== 'string') {
          return NextResponse.json({ error: 'Feedback rule ID is required' }, { status: 400 })
        }
        const deleted = await deleteFeedbackRule(prisma, body.id)
        if (!deleted) {
          return NextResponse.json({ error: 'Feedback rule not found' }, { status: 404 })
        }
        return NextResponse.json({ success: true })
      }

      case 'test-fit': {
        // Test which box an order would fit in
        if (!body.items || !Array.isArray(body.items)) {
          return NextResponse.json({ error: 'Items array is required' }, { status: 400 })
        }

        const products = await getProducts(prisma)
        const boxConfig = await getBoxConfig(prisma)

        const result = findBestBox(body.items, products, boxConfig)
        const signature = buildComboSignature(body.items)

        return NextResponse.json({
          ...result,
          comboSignature: signature,
          usableVolume: result.box ? result.box.volume * boxConfig.packingEfficiency : null,
        })
      }

      case 'update-efficiency': {
        if (typeof body.packingEfficiency !== 'number') {
          return NextResponse.json({ error: 'Packing efficiency is required' }, { status: 400 })
        }
        const config = await getBoxConfig(prisma)
        config.packingEfficiency = Math.max(0.1, Math.min(1, body.packingEfficiency))
        await setBoxConfig(prisma, config)
        return NextResponse.json({ packingEfficiency: config.packingEfficiency })
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (error: unknown) {
    console.error('Error in box-config API:', error)
    const message = error instanceof Error ? error.message : 'Failed to process request'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
