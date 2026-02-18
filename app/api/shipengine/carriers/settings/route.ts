import { NextRequest, NextResponse } from 'next/server'

const SHIPENGINE_API_KEY = process.env.SHIPENGINE_API_KEY
const SHIPENGINE_BASE = 'https://api.shipengine.com/v1'

export async function GET(request: NextRequest) {
  try {
    if (!SHIPENGINE_API_KEY) {
      return NextResponse.json({ error: 'ShipEngine API key not configured' }, { status: 500 })
    }

    const { searchParams } = new URL(request.url)
    const carrierName = searchParams.get('carrier_name')
    const carrierId = searchParams.get('carrier_id')

    if (!carrierName || !carrierId) {
      return NextResponse.json({ error: 'carrier_name and carrier_id are required' }, { status: 400 })
    }

    const response = await fetch(
      `${SHIPENGINE_BASE}/connections/carriers/${carrierName}/${carrierId}/settings`,
      { headers: { 'API-Key': SHIPENGINE_API_KEY } }
    )

    if (!response.ok) {
      // Some carriers don't support settings — return empty
      if (response.status === 404) {
        return NextResponse.json({ settings: {}, supported: false })
      }
      const data = await response.json().catch(() => ({}))
      const msg = data.errors?.[0]?.message || data.message || `Failed to fetch settings (${response.status})`
      return NextResponse.json({ error: msg }, { status: response.status })
    }

    const settings = await response.json()
    return NextResponse.json({ settings, supported: true })
  } catch (error: unknown) {
    console.error('Carrier settings GET error:', error)
    const message = error instanceof Error ? error.message : 'Failed to fetch carrier settings'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    if (!SHIPENGINE_API_KEY) {
      return NextResponse.json({ error: 'ShipEngine API key not configured' }, { status: 500 })
    }

    const body = await request.json()
    const { carrier_name, carrier_id, ...settingsData } = body

    if (!carrier_name || !carrier_id) {
      return NextResponse.json({ error: 'carrier_name and carrier_id are required' }, { status: 400 })
    }

    const response = await fetch(
      `${SHIPENGINE_BASE}/connections/carriers/${carrier_name}/${carrier_id}/settings`,
      {
        method: 'PUT',
        headers: {
          'API-Key': SHIPENGINE_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settingsData),
      }
    )

    // 204 = success with no body
    if (response.status === 204 || response.ok) {
      return NextResponse.json({ success: true })
    }

    const data = await response.json().catch(() => ({}))
    const msg = data.errors?.[0]?.message || data.message || `Failed to update settings (${response.status})`
    console.error('ShipEngine Settings Update Error:', { status: response.status, data })
    return NextResponse.json({ error: msg }, { status: response.status })
  } catch (error: unknown) {
    console.error('Carrier settings PUT error:', error)
    const message = error instanceof Error ? error.message : 'Failed to update carrier settings'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
