import { NextRequest, NextResponse } from 'next/server'

const SHIPENGINE_API_KEY = process.env.SHIPENGINE_API_KEY
const SHIPENGINE_BASE = 'https://api.shipengine.com/v1'

export async function POST(request: NextRequest) {
  try {
    if (!SHIPENGINE_API_KEY) {
      return NextResponse.json({ error: 'ShipEngine API key not configured' }, { status: 500 })
    }

    const body = await request.json()
    const { carrier_name, ...connectionData } = body

    if (!carrier_name) {
      return NextResponse.json({ error: 'carrier_name is required' }, { status: 400 })
    }

    const response = await fetch(`${SHIPENGINE_BASE}/connections/carriers/${carrier_name}`, {
      method: 'POST',
      headers: {
        'API-Key': SHIPENGINE_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(connectionData),
    })

    const data = await response.json()

    if (!response.ok) {
      const errorMessage =
        data.errors?.[0]?.message ||
        data.message ||
        `Failed to connect carrier (${response.status})`

      console.error('ShipEngine Connect Error:', { status: response.status, data })
      return NextResponse.json({ error: errorMessage }, { status: response.status })
    }

    return NextResponse.json({ carrier_id: data.carrier_id, success: true })
  } catch (error: unknown) {
    console.error('Carrier connect error:', error)
    const message = error instanceof Error ? error.message : 'Failed to connect carrier'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!SHIPENGINE_API_KEY) {
      return NextResponse.json({ error: 'ShipEngine API key not configured' }, { status: 500 })
    }

    const { searchParams } = new URL(request.url)
    const carrierName = searchParams.get('carrier_name')
    const carrierId = searchParams.get('carrier_id')

    if (!carrierName || !carrierId) {
      return NextResponse.json(
        { error: 'carrier_name and carrier_id are required' },
        { status: 400 }
      )
    }

    const response = await fetch(
      `${SHIPENGINE_BASE}/connections/carriers/${carrierName}/${carrierId}`,
      {
        method: 'DELETE',
        headers: { 'API-Key': SHIPENGINE_API_KEY },
      }
    )

    if (!response.ok) {
      let errorMessage = `Failed to disconnect (${response.status})`
      try {
        const data = await response.json()
        errorMessage = data.errors?.[0]?.message || data.message || errorMessage
      } catch {
        // response may not be JSON on 204
      }
      if (response.status !== 204) {
        console.error('ShipEngine Disconnect Error:', { status: response.status })
        return NextResponse.json({ error: errorMessage }, { status: response.status })
      }
    }

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error('Carrier disconnect error:', error)
    const message = error instanceof Error ? error.message : 'Failed to disconnect carrier'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
