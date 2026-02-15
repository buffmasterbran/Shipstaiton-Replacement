import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

// ============================================================================
// Session Management (JWT + httpOnly cookie)
// ============================================================================

const SESSION_SECRET = process.env.SESSION_SECRET || ''
const COOKIE_NAME = 'session'
const EXPIRATION = '7d'

function getKey() {
  const secret = new TextEncoder().encode(SESSION_SECRET)
  if (secret.length < 32) {
    throw new Error('SESSION_SECRET must be at least 32 characters')
  }
  return secret
}

export interface SessionData {
  userId: string        // NetSuite empid
  username: string      // NetSuite pawsUsername
  fullName: string      // NetSuite employee name
  isAdmin: boolean      // From NetSuite — overrides all permissions
  groupId?: string      // PermissionGroup id
  groupName?: string    // PermissionGroup name (for display)
  allowedPages: string[] // Array of page keys this user can access
}

/**
 * Encrypt session data into a JWT
 */
async function encrypt(payload: SessionData): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(EXPIRATION)
    .sign(getKey())
}

/**
 * Decrypt and verify a JWT session token
 */
async function decrypt(session: string): Promise<SessionData | null> {
  try {
    const { payload } = await jwtVerify(session, getKey(), {
      algorithms: ['HS256'],
    })
    return {
      userId: payload.userId as string,
      username: payload.username as string,
      fullName: payload.fullName as string,
      isAdmin: (payload.isAdmin as boolean) || false,
      groupId: (payload.groupId as string) || undefined,
      groupName: (payload.groupName as string) || undefined,
      allowedPages: (payload.allowedPages as string[]) || [],
    }
  } catch {
    return null
  }
}

/**
 * Create a session: encrypt data and set httpOnly cookie
 */
export async function createSession(data: SessionData): Promise<void> {
  const token = await encrypt(data)
  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
    path: '/',
  })
}

/**
 * Get the current session from the cookie
 */
export async function getSession(): Promise<SessionData | null> {
  const cookieStore = await cookies()
  const cookie = cookieStore.get(COOKIE_NAME)
  if (!cookie?.value) return null
  return decrypt(cookie.value)
}

/**
 * Delete the session cookie (logout)
 */
export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(COOKIE_NAME)
}
