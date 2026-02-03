import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    const body = await request.json()

    const { name, company, addressLine1, addressLine2, city, state, postalCode, country, phone, email, isDefault } = body

    // If this is being set as default, unset all other defaults
    if (isDefault) {
      await prisma.location.updateMany({
        where: { isDefault: true, id: { not: id } },
        data: { isDefault: false },
      })
    }

    const location = await prisma.location.update({
      where: { id },
      data: {
        name,
        company,
        addressLine1,
        addressLine2,
        city,
        state,
        postalCode,
        country,
        phone,
        email,
        isDefault,
      },
    })

    return NextResponse.json({ location })
  } catch (error: any) {
    console.error('Error updating location:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update location' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params

    // Soft delete by setting active to false
    await prisma.location.update({
      where: { id },
      data: { active: false },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting location:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete location' },
      { status: 500 }
    )
  }
}
