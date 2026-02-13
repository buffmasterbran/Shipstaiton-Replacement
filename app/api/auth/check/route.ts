import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'

export async function GET() {
  try {
    const session = await getSession()

    if (!session) {
      return NextResponse.json(
        { authenticated: false },
        { status: 401 }
      )
    }

    return NextResponse.json({
      authenticated: true,
      user: {
        userId: session.userId,
        username: session.username,
        fullName: session.fullName,
        isAdmin: session.isAdmin || false,
        groupId: session.groupId || null,
        groupName: session.groupName || null,
        allowedPages: session.allowedPages || [],
      },
    })
  } catch (error: any) {
    console.error('[Auth Check] Error:', error)
    return NextResponse.json(
      { authenticated: false },
      { status: 401 }
    )
  }
}
