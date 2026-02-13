import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import { getSession } from '@/lib/session'
import { getAllPageKeys } from '@/lib/permissions'

const prisma = new PrismaClient()

/**
 * GET /api/permission-groups
 * List all groups with permissions and user counts.
 */
export async function GET() {
  try {
    const session = await getSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const groups = await prisma.permissionGroup.findMany({
      include: {
        permissions: true,
        _count: { select: { users: true } },
      },
      orderBy: { name: 'asc' },
    })

    const result = groups.map((g) => ({
      id: g.id,
      name: g.name,
      description: g.description,
      isDefault: g.isDefault,
      createdAt: g.createdAt,
      updatedAt: g.updatedAt,
      pageKeys: g.permissions.map((p) => p.pageKey),
      userCount: g._count.users,
    }))

    return NextResponse.json({ groups: result })
  } catch (error: any) {
    console.error('[Permission Groups] GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch groups' }, { status: 500 })
  }
}

/**
 * POST /api/permission-groups
 * Create a new group.
 * Body: { name, description?, pageKeys: string[], isDefault?: boolean }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const body = await request.json()
    const { name, description, pageKeys, isDefault } = body

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Group name is required' }, { status: 400 })
    }

    // Validate page keys
    const validKeys = getAllPageKeys()
    const filteredKeys: string[] = (pageKeys || []).filter((k: string) => validKeys.includes(k))

    // If setting as default, unset other defaults first
    if (isDefault) {
      await prisma.permissionGroup.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      })
    }

    const group = await prisma.permissionGroup.create({
      data: {
        name: name.trim(),
        description: description || null,
        isDefault: isDefault || false,
        permissions: {
          create: filteredKeys.map((key) => ({ pageKey: key })),
        },
      },
      include: {
        permissions: true,
        _count: { select: { users: true } },
      },
    })

    return NextResponse.json({
      success: true,
      group: {
        id: group.id,
        name: group.name,
        description: group.description,
        isDefault: group.isDefault,
        pageKeys: group.permissions.map((p) => p.pageKey),
        userCount: group._count.users,
      },
    })
  } catch (error: any) {
    console.error('[Permission Groups] POST error:', error)
    if (error.code === 'P2002') {
      return NextResponse.json({ error: 'A group with that name already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Failed to create group' }, { status: 500 })
  }
}
