import { NextRequest, NextResponse } from 'next/server'
import { voidLabel } from '@/lib/label-service'

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json()
    const { reason, userName } = body

    const result = await voidLabel(params.id, userName || 'Unknown', reason)

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('[void-label] Error:', error)
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 })
  }
}
