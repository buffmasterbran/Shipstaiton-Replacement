import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET - List all cells
export async function GET() {
  try {
    const cells = await prisma.pickCell.findMany({
      orderBy: { name: 'asc' },
    })
    return NextResponse.json({ cells })
  } catch (error) {
    console.error('Failed to fetch cells:', error)
    return NextResponse.json({ error: 'Failed to fetch cells' }, { status: 500 })
  }
}

// POST - Create a new cell
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name } = body

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Cell name is required' }, { status: 400 })
    }

    // Check for duplicate name
    const existing = await prisma.pickCell.findFirst({
      where: { name: name.trim() },
    })
    if (existing) {
      return NextResponse.json({ error: 'A cell with this name already exists' }, { status: 400 })
    }

    const cell = await prisma.pickCell.create({
      data: {
        name: name.trim(),
        active: true,
      },
    })

    return NextResponse.json({ cell })
  } catch (error) {
    console.error('Failed to create cell:', error)
    return NextResponse.json({ error: 'Failed to create cell' }, { status: 500 })
  }
}

// PATCH - Update a cell
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, name, active } = body

    if (!id) {
      return NextResponse.json({ error: 'Cell ID is required' }, { status: 400 })
    }

    const updateData: { name?: string; active?: boolean } = {}
    if (name !== undefined) updateData.name = name.trim()
    if (active !== undefined) updateData.active = active

    const cell = await prisma.pickCell.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({ cell })
  } catch (error) {
    console.error('Failed to update cell:', error)
    return NextResponse.json({ error: 'Failed to update cell' }, { status: 500 })
  }
}

// DELETE - Delete a cell
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Cell ID is required' }, { status: 400 })
    }

    // Check if cell has any batches
    const batchCount = await prisma.pickBatch.count({
      where: { cellId: id },
    })

    if (batchCount > 0) {
      return NextResponse.json(
        { error: `Cannot delete cell with ${batchCount} batch(es). Remove batches first.` },
        { status: 400 }
      )
    }

    await prisma.pickCell.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete cell:', error)
    return NextResponse.json({ error: 'Failed to delete cell' }, { status: 500 })
  }
}
