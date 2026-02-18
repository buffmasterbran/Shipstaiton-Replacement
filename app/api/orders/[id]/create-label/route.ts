import { NextRequest, NextResponse } from 'next/server'
import { createLabel } from '@/lib/label-service'

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json()
    const { locationId, printerId, userName } = body

    if (!locationId) {
      return NextResponse.json({ error: 'locationId is required' }, { status: 400 })
    }

    const result = await createLabel({
      orderId: params.id,
      locationId,
      printerId: printerId || undefined,
      userName: userName || 'Unknown',
    })

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('[create-label] Error:', error)
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 })
  }
}
