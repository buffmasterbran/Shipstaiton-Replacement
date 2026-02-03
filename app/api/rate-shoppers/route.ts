import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET - List all rate shoppers
export async function GET() {
  try {
    const rateShoppers = await prisma.rateShopper.findMany({
      orderBy: [
        { isDefault: 'desc' },
        { name: 'asc' },
      ],
    })

    return NextResponse.json({
      rateShoppers,
      success: true,
    })
  } catch (error: any) {
    console.error('Error fetching rate shoppers:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch rate shoppers' },
      { status: 500 }
    )
  }
}

// POST - Create a new rate shopper
export async function POST(request: NextRequest) {
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
    } = body

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      )
    }

    if (!services || !Array.isArray(services) || services.length === 0) {
      return NextResponse.json(
        { error: 'At least one service must be selected' },
        { status: 400 }
      )
    }

    // If this is being set as default, unset any existing default
    if (isDefault) {
      await prisma.rateShopper.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      })
    }

    const rateShopper = await prisma.rateShopper.create({
      data: {
        name: name.trim(),
        services,
        transitTimeRestriction: transitTimeRestriction || null,
        preferenceEnabled: preferenceEnabled || false,
        preferredServiceCode: preferredServiceCode || null,
        preferenceType: preferenceType || null,
        preferenceValue: preferenceValue || null,
        isDefault: isDefault || false,
        active: true,
      },
    })

    return NextResponse.json({
      rateShopper,
      success: true,
    })
  } catch (error: any) {
    console.error('Error creating rate shopper:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create rate shopper' },
      { status: 500 }
    )
  }
}
