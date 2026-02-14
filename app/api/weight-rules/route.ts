import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'

// GET - List all weight rules (ordered by sortOrder / minOz)
export async function GET() {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rules = await prisma.weightRule.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        rateShopper: {
          select: { id: true, name: true, active: true },
        },
      },
    })

    return NextResponse.json({ rules })
  } catch (error: any) {
    console.error('Error fetching weight rules:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch weight rules' },
      { status: 500 }
    )
  }
}

// PUT - Replace ALL weight rules at once (the segmented bar saves as a whole)
// This is simpler than individual CRUD since the segments are interdependent.
export async function PUT(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session || !session.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { rules } = body

    if (!Array.isArray(rules)) {
      return NextResponse.json({ error: 'Rules must be an array' }, { status: 400 })
    }

    // Validate each rule
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i]

      if (typeof rule.minOz !== 'number' || typeof rule.maxOz !== 'number') {
        return NextResponse.json({ error: `Rule ${i + 1}: minOz and maxOz must be numbers` }, { status: 400 })
      }

      if (rule.minOz < 0 || rule.maxOz <= rule.minOz) {
        return NextResponse.json({ error: `Rule ${i + 1}: invalid weight range (${rule.minOz} - ${rule.maxOz})` }, { status: 400 })
      }

      if (rule.maxOz > 2400) {
        return NextResponse.json({ error: `Rule ${i + 1}: max weight cannot exceed 150 lbs (2400 oz)` }, { status: 400 })
      }

      if (!rule.targetType || !['service', 'rate_shopper'].includes(rule.targetType)) {
        return NextResponse.json({ error: `Rule ${i + 1}: targetType must be "service" or "rate_shopper"` }, { status: 400 })
      }

      if (rule.targetType === 'service' && !rule.serviceCode) {
        return NextResponse.json({ error: `Rule ${i + 1}: service rules must have a serviceCode` }, { status: 400 })
      }

      if (rule.targetType === 'rate_shopper' && !rule.rateShopperId) {
        return NextResponse.json({ error: `Rule ${i + 1}: rate shopper rules must have a rateShopperId` }, { status: 400 })
      }

      // Validate contiguous ranges (each rule's max should equal next rule's min)
      if (i > 0 && rules[i - 1].maxOz !== rule.minOz) {
        return NextResponse.json({
          error: `Rule ${i + 1}: gap detected between ranges. Previous ends at ${rules[i - 1].maxOz} oz, this starts at ${rule.minOz} oz`,
        }, { status: 400 })
      }
    }

    // Delete all existing rules and insert new ones in a transaction
    await prisma.$transaction(async (tx) => {
      await tx.weightRule.deleteMany({})

      for (let i = 0; i < rules.length; i++) {
        const rule = rules[i]
        await tx.weightRule.create({
          data: {
            minOz: rule.minOz,
            maxOz: rule.maxOz,
            targetType: rule.targetType,
            carrierId: rule.targetType === 'service' ? rule.carrierId : null,
            carrierCode: rule.targetType === 'service' ? rule.carrierCode : null,
            serviceCode: rule.targetType === 'service' ? rule.serviceCode : null,
            serviceName: rule.targetType === 'service' ? rule.serviceName : null,
            rateShopperId: rule.targetType === 'rate_shopper' ? rule.rateShopperId : null,
            isActive: rule.isActive ?? true,
            sortOrder: i,
          },
        })
      }
    })

    // Re-fetch to return the saved state
    const savedRules = await prisma.weightRule.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        rateShopper: {
          select: { id: true, name: true, active: true },
        },
      },
    })

    return NextResponse.json({ rules: savedRules })
  } catch (error: any) {
    console.error('Error saving weight rules:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to save weight rules' },
      { status: 500 }
    )
  }
}
