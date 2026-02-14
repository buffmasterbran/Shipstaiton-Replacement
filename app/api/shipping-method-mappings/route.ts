import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'

// GET - List all shipping method mappings
export async function GET() {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const mappings = await prisma.shippingMethodMapping.findMany({
      orderBy: { incomingName: 'asc' },
    })

    return NextResponse.json({ mappings })
  } catch (error: any) {
    console.error('Error fetching shipping method mappings:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch mappings' },
      { status: 500 }
    )
  }
}

// POST - Create a new shipping method mapping
export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session || !session.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { incomingName, carrierId, carrierCode, serviceCode, serviceName, isExpedited, isActive } = body

    if (!incomingName?.trim()) {
      return NextResponse.json({ error: 'Incoming service name is required' }, { status: 400 })
    }

    if (!carrierId || !serviceCode || !serviceName) {
      return NextResponse.json({ error: 'Carrier and service details are required' }, { status: 400 })
    }

    // Check for duplicate incoming name (case-insensitive)
    const existing = await prisma.shippingMethodMapping.findFirst({
      where: {
        incomingName: {
          equals: incomingName.trim(),
          mode: 'insensitive',
        },
      },
    })

    if (existing) {
      return NextResponse.json(
        { error: `A mapping for "${incomingName.trim()}" already exists` },
        { status: 409 }
      )
    }

    const mapping = await prisma.shippingMethodMapping.create({
      data: {
        incomingName: incomingName.trim(),
        carrierId,
        carrierCode: carrierCode || '',
        serviceCode,
        serviceName,
        isExpedited: isExpedited ?? false,
        isActive: isActive ?? true,
      },
    })

    return NextResponse.json({ mapping }, { status: 201 })
  } catch (error: any) {
    console.error('Error creating shipping method mapping:', error)

    // Handle unique constraint violation
    if (error.code === 'P2002') {
      return NextResponse.json(
        { error: 'A mapping with that incoming service name already exists' },
        { status: 409 }
      )
    }

    return NextResponse.json(
      { error: error.message || 'Failed to create mapping' },
      { status: 500 }
    )
  }
}
