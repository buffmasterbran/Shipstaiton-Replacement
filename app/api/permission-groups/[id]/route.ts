import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import { getSession } from '@/lib/session'
import { getAllPageKeys } from '@/lib/permissions'

const prisma = new PrismaClient()

/**
 * PATCH /api/permission-groups/[id]
 * Update a group's name, description, isDefault, and/or page permissions.
 * Body: { name?, description?, pageKeys?: string[], isDefault?: boolean }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json()
    const { name, description, pageKeys, isDefault } = body

    // Check group exists
    const existing = await prisma.permissionGroup.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 })
    }

    // Build update data
    const updateData: any = {}
    if (name !== undefined) updateData.name = name.trim()
    if (description !== undefined) updateData.description = description || null

    // Handle isDefault toggle
    if (isDefault !== undefined) {
      if (isDefault) {
        // Unset other defaults first
        await prisma.permissionGroup.updateMany({
          where: { isDefault: true, id: { not: id } },
          data: { isDefault: false },
        })
      }
      updateData.isDefault = isDefault
    }

    // Update the group itself
    const group = await prisma.permissionGroup.update({
      where: { id },
      data: updateData,
    })

    // If pageKeys provided, replace all permissions
    if (pageKeys !== undefined) {
      const validKeys = getAllPageKeys()
      const filteredKeys: string[] = pageKeys.filter((k: string) => validKeys.includes(k))

      // Delete existing permissions and recreate
      await prisma.groupPageAccess.deleteMany({ where: { groupId: id } })
      if (filteredKeys.length > 0) {
        await prisma.groupPageAccess.createMany({
          data: filteredKeys.map((key) => ({ groupId: id, pageKey: key })),
        })
      }
    }

    // Fetch updated group with permissions
    const updated = await prisma.permissionGroup.findUnique({
      where: { id },
      include: {
        permissions: true,
        _count: { select: { users: true } },
      },
    })

    return NextResponse.json({
      success: true,
      group: {
        id: updated!.id,
        name: updated!.name,
        description: updated!.description,
        isDefault: updated!.isDefault,
        pageKeys: updated!.permissions.map((p) => p.pageKey),
        userCount: updated!._count.users,
      },
    })
  } catch (error: any) {
    console.error('[Permission Groups] PATCH error:', error)
    if (error.code === 'P2002') {
      return NextResponse.json({ error: 'A group with that name already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Failed to update group' }, { status: 500 })
  }
}

/**
 * DELETE /api/permission-groups/[id]
 * Delete a group. Fails if users are still assigned.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { id } = await params

    // Check if users are assigned
    const userCount = await prisma.user.count({ where: { groupId: id } })
    if (userCount > 0) {
      return NextResponse.json(
        { error: `Cannot delete group: ${userCount} user(s) are still assigned. Reassign them first.` },
        { status: 409 }
      )
    }

    await prisma.permissionGroup.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[Permission Groups] DELETE error:', error)
    return NextResponse.json({ error: 'Failed to delete group' }, { status: 500 })
  }
}
