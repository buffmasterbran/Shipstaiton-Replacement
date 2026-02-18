import { NextRequest, NextResponse } from 'next/server'
import { reprintLabel } from '@/lib/label-service'

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json()
    const { printerId, userName } = body

    if (!printerId) {
      return NextResponse.json({ error: 'printerId is required' }, { status: 400 })
    }

    const result = await reprintLabel(params.id, printerId, userName || 'Unknown')

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('[reprint-label] Error:', error)
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 })
  }
}
