import { NextResponse } from 'next/server'

export async function GET() {
  const guid = process.env.GLOBAL_E_GUID
  return NextResponse.json({
    configured: !!guid,
    guidPrefix: guid ? `${guid.slice(0, 8)}...` : null,
  })
}
