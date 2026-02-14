import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'

// GET - List all shipping method mappings (include related rateShopper for display)
export async function GET() {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const mappings = await prisma.shippingMethodMapping.findMany({
      orderBy: { incomingName: 'asc' },
      include: { rateShopper: true },
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

// Valid target types for mappings
const VALID_TARGET_TYPES = ['service', 'weight_rules', 'rate_shopper'] as const

// POST - Create a new shipping method mapping
export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session || !session.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      incomingName,
      targetType = 'service',
      carrierId,
      carrierCode,
      serviceCode,
      serviceName,
      rateShopperId,
      isExpedited,
      isActive,
    } = body

    if (!incomingName?.trim()) {
      return NextResponse.json({ error: 'Incoming service name is required' }, { status: 400 })
    }

    if (!VALID_TARGET_TYPES.includes(targetType)) {
      return NextResponse.json(
        { error: `Invalid target type. Must be one of: ${VALID_TARGET_TYPES.join(', ')}` },
        { status: 400 }
      )
    }

    // Validate based on target type
    if (targetType === 'service') {
      if (!carrierId || !serviceCode || !serviceName) {
        return NextResponse.json({ error: 'Carrier and service details are required for service target type' }, { status: 400 })
      }
    } else if (targetType === 'rate_shopper') {
      if (!rateShopperId) {
        return NextResponse.json({ error: 'Rate Shopper selection is required for rate_shopper target type' }, { status: 400 })
      }
    }
    // weight_rules target type needs no extra fields

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
        targetType,
        carrierId: targetType === 'service' ? carrierId : null,
        carrierCode: targetType === 'service' ? (carrierCode || '') : null,
        serviceCode: targetType === 'service' ? serviceCode : null,
        serviceName: targetType === 'service' ? serviceName : null,
        rateShopperId: targetType === 'rate_shopper' ? rateShopperId : null,
        isExpedited: isExpedited ?? false,
        isActive: isActive ?? true,
      },
      include: { rateShopper: true },
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
