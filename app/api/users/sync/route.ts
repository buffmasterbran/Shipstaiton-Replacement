import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import { getSession } from '@/lib/session'
import { fetchEmployees } from '@/lib/netsuite-auth'

const prisma = new PrismaClient()

/**
 * POST /api/users/sync
 * Pull the full employee list from NetSuite RESTlet and upsert local User records.
 * Admin only.
 */
export async function POST() {
  try {
    const session = await getSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    console.log('[Users Sync] Starting NetSuite employee sync...')

    const employees = await fetchEmployees()

    // Get the default group for new users
    const defaultGroup = await prisma.permissionGroup.findFirst({
      where: { isDefault: true },
    })

    let created = 0
    let updated = 0

    for (const emp of employees) {
      if (!emp.empid || !emp.pawsUsername) continue

      const isAdmin = emp.custentity_pir_emp_admin_rights || emp.isAdmin || false

      const existing = await prisma.user.findUnique({
        where: { netsuiteEmpId: emp.empid },
      })

      if (existing) {
        // Update name and admin status
        await prisma.user.update({
          where: { id: existing.id },
          data: {
            name: emp.name,
            isAdmin,
          },
        })
        updated++
      } else {
        // Create new user with default group
        await prisma.user.create({
          data: {
            name: emp.name,
            netsuiteEmpId: emp.empid,
            isAdmin,
            groupId: defaultGroup?.id || null,
          },
        })
        created++
      }
    }

    console.log(`[Users Sync] Done: ${created} created, ${updated} updated`)

    return NextResponse.json({
      success: true,
      synced: employees.length,
      created,
      updated,
    })
  } catch (error: any) {
    console.error('[Users Sync] Error:', error)
    return NextResponse.json({ error: 'Failed to sync employees: ' + error.message }, { status: 500 })
  }
}
