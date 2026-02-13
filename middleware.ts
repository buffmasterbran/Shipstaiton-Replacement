import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

// ============================================================================
// Route Protection Middleware
//
// 1. Authentication: Redirects unauthenticated users to /login
// 2. Authorization: Checks page-level permissions from JWT session
//    - isAdmin users can access everything
//    - Settings pages are admin-only
//    - Other pages are checked against allowedPages in the JWT
// ============================================================================

const PUBLIC_PATHS = ['/login', '/api/auth']

// Static assets, Next.js internals, and the ingest API are always allowed
const ALWAYS_ALLOWED = ['/_next', '/favicon.ico', '/api/ingest-batch']

// Page key mapping (duplicated from lib/permissions.ts because middleware
// runs in the Edge runtime and can't import Node.js modules)
const PATH_TO_PAGE_KEY: Record<string, string> = {
  '/': 'all-orders',
  '/dashboard': 'dashboard',
  '/expedited': 'expedited',
  '/errors': 'errors',
  '/hold': 'hold',
  '/singles': 'singles',
  '/bulk': 'bulk',
  '/box-size': 'box-size',
  '/personalized-orders': 'personalized-orders',
  '/international': 'international',
  '/batch-queue': 'batch-queue',
  '/pick': 'pick',
  '/personalization': 'personalization',
  '/cart-scan': 'cart-scan',
  '/scan-to-verify': 'scan-to-verify',
  '/local-pickup': 'local-pickup',
  '/returns': 'returns',
  '/inventory-count': 'inventory-count',
  '/analytics': 'analytics',
}

function isPublic(pathname: string): boolean {
  return (
    ALWAYS_ALLOWED.some((p) => pathname.startsWith(p)) ||
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))
  )
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow public paths through
  if (isPublic(pathname)) {
    return NextResponse.next()
  }

  // Check for session cookie
  const sessionCookie = request.cookies.get('session')

  if (!sessionCookie?.value) {
    return redirectOrReject(request, pathname)
  }

  // Verify the JWT is valid (not expired, correct signature)
  try {
    const secret = new TextEncoder().encode(process.env.SESSION_SECRET || '')
    const { payload } = await jwtVerify(sessionCookie.value, secret, { algorithms: ['HS256'] })

    const isAdmin = (payload.isAdmin as boolean) || false
    const allowedPages = (payload.allowedPages as string[]) || []

    // Admins can access everything
    if (isAdmin) {
      return NextResponse.next()
    }

    // API routes: only check authentication (not page-level permissions)
    if (pathname.startsWith('/api/')) {
      // Admin-only API routes
      const adminOnlyApiPrefixes = ['/api/permission-groups', '/api/users']
      if (adminOnlyApiPrefixes.some((p) => pathname.startsWith(p))) {
        return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
      }
      return NextResponse.next()
    }

    // Settings pages are admin-only
    if (pathname.startsWith('/settings')) {
      return redirectToFirstAllowed(request, allowedPages)
    }

    // Check page-level permissions
    const pageKey = PATH_TO_PAGE_KEY[pathname]
    if (pageKey) {
      if (allowedPages.includes(pageKey)) {
        return NextResponse.next()
      }
      // Not authorized for this page — redirect to first allowed page
      return redirectToFirstAllowed(request, allowedPages)
    }

    // Unknown page (not in registry) — allow through (could be a subpage)
    return NextResponse.next()
  } catch {
    // Invalid or expired token — treat as unauthenticated
    return redirectOrReject(request, pathname)
  }
}

/**
 * For page routes → redirect to /login
 * For API routes → return 401 JSON
 */
function redirectOrReject(request: NextRequest, pathname: string) {
  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  const loginUrl = new URL('/login', request.url)
  return NextResponse.redirect(loginUrl)
}

/**
 * Redirect non-admin user to their first allowed page.
 * Falls back to /pick if they have no allowed pages.
 */
function redirectToFirstAllowed(request: NextRequest, allowedPages: string[]) {
  // Find the first allowed page path
  const firstAllowed = Object.entries(PATH_TO_PAGE_KEY).find(
    ([, key]) => allowedPages.includes(key)
  )
  const targetPath = firstAllowed ? firstAllowed[0] : '/pick'
  const targetUrl = new URL(targetPath, request.url)
  return NextResponse.redirect(targetUrl)
}

// Match all routes except static files
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
