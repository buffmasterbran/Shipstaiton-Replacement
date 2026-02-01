import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/debug/products
 * Diagnostic endpoint to verify product sizes and their singleBoxId values.
 * Shows what's actually in the database vs what the UI displays.
 */
export async function GET() {
  try {
    // Get all product sizes with their singleBoxId
    const sizes = await prisma.productSize.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        singleBoxId: true,
        active: true,
        category: true,
      },
    })

    // Get all boxes for reference
    const boxes = await prisma.box.findMany({
      orderBy: { priority: 'asc' },
      select: {
        id: true,
        name: true,
        active: true,
        singleCupOnly: true,
        priority: true,
      },
    })

    // Build a diagnostic report
    const report = {
      timestamp: new Date().toISOString(),
      productSizes: sizes.map(s => ({
        id: s.id,
        name: s.name,
        category: s.category,
        active: s.active,
        singleBoxId: s.singleBoxId || '❌ NOT SET',
        singleBoxName: s.singleBoxId
          ? boxes.find(b => b.id === s.singleBoxId)?.name || `⚠️ BOX NOT FOUND (id=${s.singleBoxId})`
          : null,
      })),
      boxes: boxes.map(b => ({
        id: b.id,
        name: b.name,
        active: b.active,
        singleCupOnly: b.singleCupOnly,
        priority: b.priority,
      })),
      summary: {
        totalSizes: sizes.length,
        sizesWithSingleBox: sizes.filter(s => s.singleBoxId).length,
        sizesWithoutSingleBox: sizes.filter(s => !s.singleBoxId).length,
        totalBoxes: boxes.length,
        singleCupBoxes: boxes.filter(b => b.singleCupOnly).length,
      },
    }

    return NextResponse.json(report, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  } catch (error: unknown) {
    console.error('Debug endpoint error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch debug data', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
