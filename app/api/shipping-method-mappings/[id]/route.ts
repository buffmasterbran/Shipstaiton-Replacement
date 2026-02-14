import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'

// PATCH - Update a shipping method mapping
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession()
    if (!session || !session.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = params
    const body = await request.json()

    // Verify the mapping exists
    const existing = await prisma.shippingMethodMapping.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Mapping not found' }, { status: 404 })
    }

    // Build update data
    const updateData: Record<string, unknown> = {}

    if (body.incomingName !== undefined) {
      const trimmed = body.incomingName.trim()
      if (!trimmed) {
        return NextResponse.json({ error: 'Incoming service name cannot be empty' }, { status: 400 })
      }

      // Check uniqueness (case-insensitive) if name is changing
      if (trimmed.toLowerCase() !== existing.incomingName.toLowerCase()) {
        const duplicate = await prisma.shippingMethodMapping.findFirst({
          where: {
            incomingName: { equals: trimmed, mode: 'insensitive' },
            id: { not: id },
          },
        })
        if (duplicate) {
          return NextResponse.json(
            { error: `A mapping for "${trimmed}" already exists` },
            { status: 409 }
          )
        }
      }
      updateData.incomingName = trimmed
    }

    if (body.carrierId !== undefined) updateData.carrierId = body.carrierId
    if (body.carrierCode !== undefined) updateData.carrierCode = body.carrierCode
    if (body.serviceCode !== undefined) updateData.serviceCode = body.serviceCode
    if (body.serviceName !== undefined) updateData.serviceName = body.serviceName
    if (body.isExpedited !== undefined) updateData.isExpedited = body.isExpedited
    if (body.isActive !== undefined) updateData.isActive = body.isActive

    const mapping = await prisma.shippingMethodMapping.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({ mapping })
  } catch (error: any) {
    console.error('Error updating shipping method mapping:', error)

    if (error.code === 'P2002') {
      return NextResponse.json(
        { error: 'A mapping with that incoming service name already exists' },
        { status: 409 }
      )
    }

    return NextResponse.json(
      { error: error.message || 'Failed to update mapping' },
      { status: 500 }
    )
  }
}

// DELETE - Delete a shipping method mapping
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession()
    if (!session || !session.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = params

    // Verify exists
    const existing = await prisma.shippingMethodMapping.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Mapping not found' }, { status: 404 })
    }

    await prisma.shippingMethodMapping.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting shipping method mapping:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete mapping' },
      { status: 500 }
    )
  }
}
