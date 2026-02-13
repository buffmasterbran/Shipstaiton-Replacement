import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import { getSession } from '@/lib/session'

const prisma = new PrismaClient()

/**
 * GET /api/users/manage
 * List all users with their group info. Admin only.
 */
export async function GET() {
  try {
    const session = await getSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const users = await prisma.user.findMany({
      where: { netsuiteEmpId: { not: null } },
      include: {
        group: { select: { id: true, name: true, isDefault: true } },
      },
      orderBy: { name: 'asc' },
    })

    const result = users.map((u) => ({
      id: u.id,
      netsuiteEmpId: u.netsuiteEmpId,
      name: u.name,
      isAdmin: u.isAdmin,
      groupId: u.groupId,
      groupName: u.group?.name || null,
      isDefaultGroup: u.group?.isDefault || false,
      lastLoginAt: u.lastLoginAt,
      active: u.active,
    }))

    return NextResponse.json({ users: result })
  } catch (error: any) {
    console.error('[Users Manage] GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
  }
}

/**
 * PATCH /api/users/manage
 * Assign a group to a user.
 * Body: { userId: string, groupId: string | null }
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const body = await request.json()
    const { userId, groupId } = body

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }

    // Verify user exists
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Verify group exists if provided
    if (groupId) {
      const group = await prisma.permissionGroup.findUnique({ where: { id: groupId } })
      if (!group) {
        return NextResponse.json({ error: 'Group not found' }, { status: 404 })
      }
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { groupId: groupId || null },
      include: {
        group: { select: { id: true, name: true } },
      },
    })

    return NextResponse.json({
      success: true,
      user: {
        id: updated.id,
        name: updated.name,
        groupId: updated.groupId,
        groupName: updated.group?.name || null,
      },
    })
  } catch (error: any) {
    console.error('[Users Manage] PATCH error:', error)
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 })
  }
}
