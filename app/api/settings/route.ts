import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  getOrderHighlightSettings,
  setOrderHighlightSettings,
  type OrderHighlightSettings,
} from '@/lib/settings'

/** GET /api/settings - Return all app settings. */
export async function GET() {
  try {
    // Get all settings from database
    const allSettings = await prisma.appSetting.findMany()

    // Also get order_highlight with defaults for backward compatibility
    const orderHighlight = await getOrderHighlightSettings(prisma)

    // Get singles_carrier setting
    const singlesCarrierSetting = allSettings.find(s => s.key === 'singles_carrier')
    const singlesCarrier = singlesCarrierSetting?.value || null

    return NextResponse.json({
      order_highlight: orderHighlight,
      singles_carrier: singlesCarrier,
      settings: allSettings,
    })
  } catch (error: unknown) {
    console.error('Error fetching settings:', error)
    return NextResponse.json(
      { error: 'Failed to fetch settings', details: (error as Error)?.message },
      { status: 500 }
    )
  }
}

/** POST /api/settings - Create or update a generic setting. Body: { key: string, value: any }. */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { key, value } = body

    if (!key || typeof key !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid key' }, { status: 400 })
    }

    if (value === undefined) {
      return NextResponse.json({ error: 'Missing value' }, { status: 400 })
    }

    // Upsert the setting
    const setting = await prisma.appSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    })

    return NextResponse.json({ setting, success: true })
  } catch (error: unknown) {
    console.error('Error saving setting:', error)
    return NextResponse.json(
      { error: 'Failed to save setting', details: (error as Error)?.message },
      { status: 500 }
    )
  }
}

/** PATCH /api/settings - Update settings. Body: { order_highlight?: Partial<OrderHighlightSettings> }. */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const orderHighlightPatch = body.order_highlight as Partial<OrderHighlightSettings> | undefined
    if (!orderHighlightPatch || typeof orderHighlightPatch !== 'object') {
      return NextResponse.json({ error: 'Missing or invalid order_highlight' }, { status: 400 })
    }
    const next = await setOrderHighlightSettings(prisma, orderHighlightPatch)
    return NextResponse.json({ order_highlight: next })
  } catch (error: unknown) {
    console.error('Error updating settings:', error)
    return NextResponse.json(
      { error: 'Failed to update settings', details: (error as Error)?.message },
      { status: 500 }
    )
  }
}
