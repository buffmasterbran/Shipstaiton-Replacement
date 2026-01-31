import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  getOrderHighlightSettings,
  setOrderHighlightSettings,
  type OrderHighlightSettings,
} from '@/lib/settings'

/** GET /api/settings - Return app settings (e.g. order_highlight for All Orders). */
export async function GET() {
  try {
    const orderHighlight = await getOrderHighlightSettings(prisma)
    return NextResponse.json({ order_highlight: orderHighlight })
  } catch (error: unknown) {
    console.error('Error fetching settings:', error)
    return NextResponse.json(
      { error: 'Failed to fetch settings', details: (error as Error)?.message },
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
