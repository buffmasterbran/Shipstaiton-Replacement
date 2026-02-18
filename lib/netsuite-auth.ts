import OAuth from 'oauth-1.0a'
import crypto from 'crypto'
import { createSession } from './session'
import { PrismaClient } from '@prisma/client'

// ============================================================================
// NetSuite RESTlet Authentication
// ============================================================================

const prisma = new PrismaClient()

const RESTLET_URL = 'https://7913744.restlets.api.netsuite.com/app/site/hosting/restlet.nl?script=2276&deploy=1'
const REALM = process.env.NETSUITE_REALM || '7913744'
const CONSUMER_KEY = process.env.NETSUITE_CONSUMER_KEY || ''
const CONSUMER_SECRET = process.env.NETSUITE_CONSUMER_SECRET || ''
const TOKEN_ID = process.env.NETSUITE_TOKEN_ID || ''
const TOKEN_SECRET = process.env.NETSUITE_TOKEN_SECRET || ''

interface NetSuiteEmployee {
  empid: string
  name: string
  pawsUsername: string
  pawsPassword: string
  custentity_pir_emp_admin_rights?: boolean
  // Legacy field name — kept for backward compat
  isAdmin?: boolean
}

interface AuthResult {
  success: boolean
  error?: string
  userId?: string
  fullName?: string
}

/**
 * Build OAuth 1.0a authorization header for NetSuite RESTlet
 */
function getOAuthHeader(method: string, url: string): string {
  const oauth = new OAuth({
    consumer: {
      key: CONSUMER_KEY,
      secret: CONSUMER_SECRET,
    },
    signature_method: 'HMAC-SHA256',
    hash_function(baseString: string, key: string) {
      return crypto.createHmac('sha256', key).update(baseString).digest('base64')
    },
    realm: REALM,
  })

  const token = {
    key: TOKEN_ID,
    secret: TOKEN_SECRET,
  }

  const authData = oauth.authorize({ url, method }, token)
  return oauth.toHeader(authData).Authorization
}

/**
 * Fetch employee list from NetSuite RESTlet.
 * Exported so /api/users/sync can also call it.
 */
export async function fetchEmployees(): Promise<NetSuiteEmployee[]> {
  const authHeader = getOAuthHeader('GET', RESTLET_URL)

  console.log('[NetSuite Auth] Fetching employees from RESTlet...')

  const res = await fetch(RESTLET_URL, {
    method: 'GET',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
  })

  if (!res.ok) {
    const text = await res.text()
    console.error('[NetSuite Auth] RESTlet error:', res.status, text)
    throw new Error(`NetSuite RESTlet returned ${res.status}`)
  }

  const data = await res.json()
  console.log(`[NetSuite Auth] Received ${data.employees?.length || 0} employees`)
  return data.employees || []
}

/**
 * Upsert a User record in the database keyed on netsuiteEmpId.
 * If the user has no group, assign the default group.
 * Returns the user's allowed page keys.
 */
async function upsertUserAndLoadPermissions(employee: NetSuiteEmployee): Promise<{
  groupId: string | null
  groupName: string | null
  allowedPages: string[]
}> {
  const isAdmin = employee.custentity_pir_emp_admin_rights || employee.isAdmin || false

  // Try to find existing user by netsuiteEmpId
  let user = await prisma.user.findUnique({
    where: { netsuiteEmpId: employee.empid },
    include: {
      group: {
        include: { permissions: true },
      },
    },
  })

  if (user) {
    // Update existing user on login
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        name: employee.name,
        isAdmin,
        lastLoginAt: new Date(),
      },
      include: {
        group: {
          include: { permissions: true },
        },
      },
    })
  } else {
    // First-time login — create user and assign default group
    const defaultGroup = await prisma.permissionGroup.findFirst({
      where: { isDefault: true },
    })

    user = await prisma.user.create({
      data: {
        name: employee.name,
        netsuiteEmpId: employee.empid,
        isAdmin,
        lastLoginAt: new Date(),
        groupId: defaultGroup?.id || null,
      },
      include: {
        group: {
          include: { permissions: true },
        },
      },
    })

    console.log(`[NetSuite Auth] Created new user record for ${employee.name} (empid: ${employee.empid}), group: ${defaultGroup?.name || 'none'}`)
  }

  const groupId = user.group?.id || null
  const groupName = user.group?.name || null
  const allowedPages = user.group?.permissions.map((p) => p.pageKey) || []

  return { groupId, groupName, allowedPages }
}

/**
 * Authenticate a user against the NetSuite employee list
 *
 * Flow:
 * 1. Fetch employee list from RESTlet
 * 2. Find matching username (case-insensitive)
 * 3. Compare password (plaintext)
 * 4. Upsert User record in DB, load group permissions
 * 5. Create session with permissions
 */
export async function authenticateUser(username: string, password: string): Promise<AuthResult> {
  if (!username || !password) {
    return { success: false, error: 'Username and password are required' }
  }

  if (!CONSUMER_KEY || !TOKEN_ID) {
    return { success: false, error: 'NetSuite authentication is not configured' }
  }

  try {
    const employees = await fetchEmployees()

    // Find matching employee (case-insensitive username)
    const employee = employees.find(
      (emp) => emp.pawsUsername?.toLowerCase() === username.toLowerCase()
    )

    if (!employee) {
      console.log(`[NetSuite Auth] No employee found with username: ${username}`)
      return { success: false, error: 'Invalid username or password' }
    }

    // Direct password comparison (plaintext as per NetSuite RESTlet design)
    if (employee.pawsPassword !== password) {
      console.log(`[NetSuite Auth] Password mismatch for: ${username}`)
      return { success: false, error: 'Invalid username or password' }
    }

    // Authentication successful — upsert user and load permissions
    console.log(`[NetSuite Auth] Login successful: ${employee.name} (${employee.empid})`)

    const isAdmin = employee.custentity_pir_emp_admin_rights || employee.isAdmin || false
    const { groupId, groupName, allowedPages } = await upsertUserAndLoadPermissions(employee)

    await createSession({
      userId: employee.empid,
      username: employee.pawsUsername,
      fullName: employee.name,
      isAdmin,
      groupId: groupId || undefined,
      groupName: groupName || undefined,
      allowedPages,
    })

    return { success: true, userId: employee.empid, fullName: employee.name }
  } catch (err: any) {
    console.error('[NetSuite Auth] Authentication error:', err.message)
    return { success: false, error: 'Authentication service unavailable. Please try again.' }
  }
}
