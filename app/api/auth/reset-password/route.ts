import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import OAuth from 'oauth-1.0a'
import crypto from 'crypto'

const PASSWORD_RESTLET_URL =
  'https://7913744.restlets.api.netsuite.com/app/site/hosting/restlet.nl?script=2277&deploy=1'
const REALM = process.env.NETSUITE_REALM || '7913744'
const CONSUMER_KEY = process.env.NETSUITE_CONSUMER_KEY || ''
const CONSUMER_SECRET = process.env.NETSUITE_CONSUMER_SECRET || ''
const TOKEN_ID = process.env.NETSUITE_TOKEN_ID || ''
const TOKEN_SECRET = process.env.NETSUITE_TOKEN_SECRET || ''

function getOAuthHeader(method: string, url: string): string {
  const oauth = new OAuth({
    consumer: { key: CONSUMER_KEY, secret: CONSUMER_SECRET },
    signature_method: 'HMAC-SHA256',
    hash_function(baseString: string, key: string) {
      return crypto.createHmac('sha256', key).update(baseString).digest('base64')
    },
    realm: REALM,
  })

  const token = { key: TOKEN_ID, secret: TOKEN_SECRET }
  const authData = oauth.authorize({ url, method }, token)
  return oauth.toHeader(authData).Authorization
}

/**
 * POST /api/auth/reset-password
 * Body: { newPassword: string }
 * Uses the logged-in user's NetSuite employee ID from session.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const body = await request.json()
    const { newPassword } = body

    if (!newPassword || typeof newPassword !== 'string' || newPassword.trim().length < 4) {
      return NextResponse.json(
        { error: 'Password must be at least 4 characters' },
        { status: 400 }
      )
    }

    const employeeId = session.userId
    const authHeader = getOAuthHeader('PUT', PASSWORD_RESTLET_URL)

    const res = await fetch(PASSWORD_RESTLET_URL, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({
        employeeId: { employeeId },
        newPassword: { newPassword: newPassword.trim() },
      }),
    })

    const raw = await res.text()
    let data: any = raw
    try {
      data = JSON.parse(raw)
    } catch {
      // keep raw
    }

    if (res.ok && data?.status === 'success') {
      return NextResponse.json({ success: true })
    }

    console.error('[Password Reset] NetSuite error:', res.status, raw)
    return NextResponse.json(
      { error: data?.message || data?.error || 'Failed to reset password' },
      { status: 500 }
    )
  } catch (error: any) {
    console.error('[Password Reset] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
