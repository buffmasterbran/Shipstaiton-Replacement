import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET - List all carts
export async function GET() {
  try {
    const carts = await prisma.pickCart.findMany({
      orderBy: { name: 'asc' },
    })
    return NextResponse.json({ carts })
  } catch (error) {
    console.error('Failed to fetch carts:', error)
    return NextResponse.json({ error: 'Failed to fetch carts' }, { status: 500 })
  }
}

// POST - Create a new cart
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, color } = body

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Cart name is required' }, { status: 400 })
    }

    // Check for duplicate name
    const existing = await prisma.pickCart.findFirst({
      where: { name: name.trim() },
    })
    if (existing) {
      return NextResponse.json({ error: 'A cart with this name already exists' }, { status: 400 })
    }

    const cart = await prisma.pickCart.create({
      data: {
        name: name.trim(),
        color: color?.trim() || null,
        active: true,
        status: 'AVAILABLE',
      },
    })

    return NextResponse.json({ cart })
  } catch (error) {
    console.error('Failed to create cart:', error)
    return NextResponse.json({ error: 'Failed to create cart' }, { status: 500 })
  }
}

// PATCH - Update a cart
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, name, color, active } = body

    if (!id) {
      return NextResponse.json({ error: 'Cart ID is required' }, { status: 400 })
    }

    const updateData: { name?: string; color?: string | null; active?: boolean } = {}
    if (name !== undefined) updateData.name = name.trim()
    if (color !== undefined) updateData.color = color?.trim() || null
    if (active !== undefined) updateData.active = active

    const cart = await prisma.pickCart.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({ cart })
  } catch (error) {
    console.error('Failed to update cart:', error)
    return NextResponse.json({ error: 'Failed to update cart' }, { status: 500 })
  }
}

// DELETE - Delete a cart
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Cart ID is required' }, { status: 400 })
    }

    // Check if cart is currently in use
    const cart = await prisma.pickCart.findUnique({
      where: { id },
    })

    if (cart && cart.status !== 'AVAILABLE') {
      return NextResponse.json(
        { error: 'Cannot delete cart that is currently in use' },
        { status: 400 }
      )
    }

    // Check if cart has any chunks
    const chunkCount = await prisma.pickChunk.count({
      where: { cartId: id },
    })

    if (chunkCount > 0) {
      return NextResponse.json(
        { error: `Cannot delete cart with picking history. Deactivate it instead.` },
        { status: 400 }
      )
    }

    await prisma.pickCart.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete cart:', error)
    return NextResponse.json({ error: 'Failed to delete cart' }, { status: 500 })
  }
}
