const SE_KEY = process.env.SHIPENGINE_API_KEY || ''
const SE_BASE = 'https://api.shipengine.com/v1'

export interface AddressValidationResult {
  status: 'verified' | 'unverified' | 'warning' | 'error'
  originalAddress: Record<string, any>
  matchedAddress: Record<string, any> | null
  messages: Array<{ type: string; code: string; message: string }>
}

export async function validateAddress(address: {
  name?: string
  company?: string
  street1: string
  street2?: string
  city: string
  state: string
  postalCode: string
  country?: string
  phone?: string
}): Promise<AddressValidationResult> {
  const body = [
    {
      address_line1: address.street1 || '',
      address_line2: address.street2 || '',
      city_locality: address.city || '',
      state_province: address.state || '',
      postal_code: address.postalCode || '',
      country_code: address.country || 'US',
      name: address.name || '',
      company_name: address.company || '',
      phone: address.phone || '',
    },
  ]

  const res = await fetch(`${SE_BASE}/addresses/validate`, {
    method: 'POST',
    headers: {
      'API-Key': SE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error('[Address Validation] ShipEngine error:', err)
    return {
      status: 'error',
      originalAddress: address,
      matchedAddress: null,
      messages: [{ type: 'error', code: 'api_error', message: `ShipEngine returned ${res.status}` }],
    }
  }

  const data = await res.json()
  const result = data[0]

  const matched = result.matched_address
    ? {
        name: result.matched_address.name || address.name,
        company: result.matched_address.company_name || '',
        street1: result.matched_address.address_line1 || '',
        street2: result.matched_address.address_line2 || '',
        city: result.matched_address.city_locality || '',
        state: result.matched_address.state_province || '',
        postalCode: result.matched_address.postal_code || '',
        country: result.matched_address.country_code || 'US',
        phone: address.phone || '',
        residential: result.matched_address.address_residential_indicator === 'yes',
      }
    : null

  return {
    status: result.status as AddressValidationResult['status'],
    originalAddress: address,
    matchedAddress: matched,
    messages: (result.messages || []).map((m: any) => ({
      type: m.type || 'info',
      code: m.code || '',
      message: m.message || '',
    })),
  }
}
