import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET - Get a single rate shopper
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const rateShopper = await prisma.rateShopper.findUnique({
      where: { id: params.id },
    })

    if (!rateShopper) {
      return NextResponse.json(
        { error: 'Rate shopper not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      rateShopper,
      success: true,
    })
  } catch (error: any) {
    console.error('Error fetching rate shopper:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch rate shopper' },
      { status: 500 }
    )
  }
}

// PUT - Update a rate shopper
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()

    const {
      name,
      services,
      transitTimeRestriction,
      preferenceEnabled,
      preferredServiceCode,
      preferenceType,
      preferenceValue,
      isDefault,
      active,
    } = body

    // Check if rate shopper exists
    const existing = await prisma.rateShopper.findUnique({
      where: { id: params.id },
    })

    if (!existing) {
      return NextResponse.json(
        { error: 'Rate shopper not found' },
        { status: 404 }
      )
    }

    if (name !== undefined && (!name || !name.trim())) {
      return NextResponse.json(
        { error: 'Name cannot be empty' },
        { status: 400 }
      )
    }

    if (services !== undefined && (!Array.isArray(services) || services.length === 0)) {
      return NextResponse.json(
        { error: 'At least one service must be selected' },
        { status: 400 }
      )
    }

    // If this is being set as default, unset any existing default
    if (isDefault && !existing.isDefault) {
      await prisma.rateShopper.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      })
    }

    const rateShopper = await prisma.rateShopper.update({
      where: { id: params.id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(services !== undefined && { services }),
        ...(transitTimeRestriction !== undefined && { transitTimeRestriction }),
        ...(preferenceEnabled !== undefined && { preferenceEnabled }),
        ...(preferredServiceCode !== undefined && { preferredServiceCode }),
        ...(preferenceType !== undefined && { preferenceType }),
        ...(preferenceValue !== undefined && { preferenceValue }),
        ...(isDefault !== undefined && { isDefault }),
        ...(active !== undefined && { active }),
      },
    })

    return NextResponse.json({
      rateShopper,
      success: true,
    })
  } catch (error: any) {
    console.error('Error updating rate shopper:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update rate shopper' },
      { status: 500 }
    )
  }
}

// DELETE - Delete a rate shopper
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Check if rate shopper exists
    const existing = await prisma.rateShopper.findUnique({
      where: { id: params.id },
    })

    if (!existing) {
      return NextResponse.json(
        { error: 'Rate shopper not found' },
        { status: 404 }
      )
    }

    await prisma.rateShopper.delete({
      where: { id: params.id },
    })

    return NextResponse.json({
      success: true,
      message: 'Rate shopper deleted successfully',
    })
  } catch (error: any) {
    console.error('Error deleting rate shopper:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete rate shopper' },
      { status: 500 }
    )
  }
}
