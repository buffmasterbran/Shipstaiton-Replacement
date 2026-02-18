import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser } from '@/lib/netsuite-auth'

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json()

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 }
      )
    }

    const result = await authenticateUser(username, password)

    if (result.success) {
      return NextResponse.json({ success: true, userId: result.userId, fullName: result.fullName })
    }

    return NextResponse.json(
      { error: result.error || 'Authentication failed' },
      { status: 401 }
    )
  } catch (error: any) {
    console.error('[Auth Login] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
