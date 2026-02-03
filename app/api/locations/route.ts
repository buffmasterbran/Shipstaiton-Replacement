import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const locations = await prisma.location.findMany({
      where: { active: true },
      orderBy: [
        { isDefault: 'desc' },
        { name: 'asc' },
      ],
    })

    return NextResponse.json({ locations })
  } catch (error: any) {
    console.error('Error fetching locations:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch locations' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const { name, company, addressLine1, addressLine2, city, state, postalCode, country, phone, email, isDefault } = body

    // Validation
    if (!name || !addressLine1 || !city || !state || !postalCode || !phone) {
      return NextResponse.json(
        { error: 'Missing required fields: name, addressLine1, city, state, postalCode, phone' },
        { status: 400 }
      )
    }

    // If this is being set as default, unset all other defaults
    if (isDefault) {
      await prisma.location.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      })
    }

    const location = await prisma.location.create({
      data: {
        name,
        company,
        addressLine1,
        addressLine2,
        city,
        state,
        postalCode,
        country: country || 'US',
        phone,
        email,
        isDefault: isDefault || false,
      },
    })

    return NextResponse.json({ location }, { status: 201 })
  } catch (error: any) {
    console.error('Error creating location:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create location' },
      { status: 500 }
    )
  }
}
