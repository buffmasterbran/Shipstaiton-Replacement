import { NextRequest, NextResponse } from 'next/server'
import { validateAddress } from '@/lib/address-validation'

/**
 * POST /api/shipengine/validate-address
 * Body: { address: { street1, street2?, city, state, postalCode, country? } }
 */
export async function POST(request: NextRequest) {
  try {
    const { address } = await request.json()

    if (!address || !address.street1) {
      return NextResponse.json({ error: 'address.street1 is required' }, { status: 400 })
    }

    const result = await validateAddress(address)
    return NextResponse.json(result)
  } catch (error: any) {
    console.error('[Address Validation] Error:', error)
    return NextResponse.json(
      { error: 'Address validation failed', details: error.message },
      { status: 500 }
    )
  }
}
