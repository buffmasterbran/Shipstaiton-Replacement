import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getOrderHighlightSettings } from '@/lib/settings'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period') || '7d'

    // Calculate period start date
    const now = new Date()
    let periodStart: Date
    switch (period) {
      case 'today':
        periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        break
      case '30d':
        periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        break
      case '7d':
      default:
        periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        break
    }

    // Run all queries in parallel
    const [
      highlightSettings,
      pickingCarts,
      shippingCarts,
      engravingCarts,
      awaitingPickCount,
      pickedAwaitingShipCount,
      onHoldCount,
      errorCount,
      unshippedOrders,
      completedChunks,
      shippedTodayCount,
      shippedPeriodCount,
    ] = await Promise.all([
      // Order highlight settings (late thresholds)
      getOrderHighlightSettings(prisma),

      // Active picking carts
      prisma.pickCart.findMany({
        where: { status: 'PICKING', active: true },
        include: {
          chunks: {
            where: { status: 'PICKING' },
            select: { pickerName: true, claimedAt: true, ordersInChunk: true },
          },
        },
      }),

      // Active shipping carts
      prisma.pickCart.findMany({
        where: { status: 'SHIPPING', active: true },
        include: {
          chunks: {
            where: { status: 'SHIPPING' },
            select: { shipperName: true, shippingStartedAt: true, ordersInChunk: true, ordersShipped: true },
          },
        },
      }),

      // Active engraving carts
      prisma.pickCart.findMany({
        where: { status: 'ENGRAVING', active: true },
        include: {
          chunks: {
            where: { status: 'READY_FOR_ENGRAVING' },
            select: { engraverName: true, engravingStartedAt: true, ordersInChunk: true, itemsEngraved: true },
          },
        },
      }),

      // Queue depth: awaiting pick (no chunk assigned)
      prisma.orderLog.count({
        where: { status: 'AWAITING_SHIPMENT', chunkId: null, archived: false },
      }),

      // Queue depth: picked but awaiting ship (has chunk, chunk is PICKED/READY_FOR_SHIPPING)
      prisma.orderLog.count({
        where: {
          status: 'AWAITING_SHIPMENT',
          chunkId: { not: null },
          chunk: { status: { in: ['PICKED', 'READY_FOR_SHIPPING'] } },
          archived: false,
        },
      }),

      // On hold
      prisma.orderLog.count({
        where: { status: 'ON_HOLD', archived: false },
      }),

      // Errors (rate shop failures on unshipped orders)
      prisma.orderLog.count({
        where: { rateShopStatus: 'FAILED', status: 'AWAITING_SHIPMENT', archived: false },
      }),

      // Unshipped orders with creation dates (for age brackets)
      prisma.orderLog.findMany({
        where: { status: 'AWAITING_SHIPMENT', archived: false },
        select: { createdAt: true },
      }),

      // Completed chunks in period (for performance stats)
      prisma.pickChunk.findMany({
        where: {
          status: 'COMPLETED',
          pickingCompletedAt: { gte: periodStart },
        },
        select: {
          pickerName: true,
          shipperName: true,
          engraverName: true,
          pickDurationSeconds: true,
          shipDurationSeconds: true,
          engravingDurationSeconds: true,
          ordersInChunk: true,
          ordersShipped: true,
          itemsEngraved: true,
          pickingCompletedAt: true,
          shippingCompletedAt: true,
        },
      }),

      // Orders shipped today
      prisma.orderLog.count({
        where: {
          status: 'SHIPPED',
          shippedAt: { gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) },
        },
      }),

      // Orders shipped in period
      prisma.orderLog.count({
        where: {
          status: 'SHIPPED',
          shippedAt: { gte: periodStart },
        },
      }),
    ])

    // --- Build live operations ---
    const liveOps = {
      pickingCarts: pickingCarts.map(cart => {
        const chunk = cart.chunks[0]
        return {
          id: cart.id,
          name: cart.name,
          color: cart.color,
          pickerName: chunk?.pickerName || 'Unknown',
          startedAt: chunk?.claimedAt || null,
          orderCount: chunk?.ordersInChunk || 0,
        }
      }),
      shippingCarts: shippingCarts.map(cart => {
        const chunk = cart.chunks[0]
        return {
          id: cart.id,
          name: cart.name,
          color: cart.color,
          shipperName: chunk?.shipperName || 'Unknown',
          startedAt: chunk?.shippingStartedAt || null,
          ordersShipped: chunk?.ordersShipped || 0,
          ordersTotal: chunk?.ordersInChunk || 0,
        }
      }),
      engravingCarts: (engravingCarts as any[]).map(cart => {
        const chunk = cart.chunks[0]
        return {
          id: cart.id,
          name: cart.name,
          color: cart.color,
          engraverName: chunk?.engraverName || 'Unclaimed',
          startedAt: chunk?.engravingStartedAt || null,
          itemsEngraved: chunk?.itemsEngraved || 0,
          ordersTotal: chunk?.ordersInChunk || 0,
        }
      }),
      queueDepth: {
        awaitingPick: awaitingPickCount,
        pickedAwaitingShip: pickedAwaitingShipCount,
        onHold: onHoldCount,
        errors: errorCount,
      },
    }

    // --- Build order health (age brackets) ---
    const { orangeMinDays, redMinDays } = highlightSettings
    let normalCount = 0
    let lateCount = 0
    let reallyLateCount = 0

    for (const order of unshippedOrders) {
      const ageDays = Math.floor((now.getTime() - new Date(order.createdAt).getTime()) / (24 * 60 * 60 * 1000))
      if (ageDays >= redMinDays) {
        reallyLateCount++
      } else if (ageDays >= orangeMinDays) {
        lateCount++
      } else {
        normalCount++
      }
    }

    const orderHealth = {
      thresholds: { orangeMinDays, redMinDays },
      normal: normalCount,
      late: lateCount,
      reallyLate: reallyLateCount,
      total: unshippedOrders.length,
      onHold: onHoldCount,
      errors: errorCount,
    }

    // --- Build team performance ---
    const pickerMap = new Map<string, { carts: number; orders: number; totalSeconds: number; fastest: number; slowest: number }>()
    const shipperMap = new Map<string, { carts: number; orders: number; totalSeconds: number; fastest: number; slowest: number }>()
    const engraverMap = new Map<string, { carts: number; items: number; orders: number; totalSeconds: number; fastest: number; slowest: number }>()

    for (const chunk of completedChunks) {
      // Picker stats
      if (chunk.pickerName && chunk.pickDurationSeconds && chunk.pickDurationSeconds > 0) {
        const existing = pickerMap.get(chunk.pickerName) || { carts: 0, orders: 0, totalSeconds: 0, fastest: Infinity, slowest: 0 }
        existing.carts++
        existing.orders += chunk.ordersInChunk || 0
        existing.totalSeconds += chunk.pickDurationSeconds
        existing.fastest = Math.min(existing.fastest, chunk.pickDurationSeconds)
        existing.slowest = Math.max(existing.slowest, chunk.pickDurationSeconds)
        pickerMap.set(chunk.pickerName, existing)
      }

      // Shipper stats
      if (chunk.shipperName && chunk.shipDurationSeconds && chunk.shipDurationSeconds > 0) {
        const existing = shipperMap.get(chunk.shipperName) || { carts: 0, orders: 0, totalSeconds: 0, fastest: Infinity, slowest: 0 }
        existing.carts++
        existing.orders += chunk.ordersShipped || 0
        existing.totalSeconds += chunk.shipDurationSeconds
        existing.fastest = Math.min(existing.fastest, chunk.shipDurationSeconds)
        existing.slowest = Math.max(existing.slowest, chunk.shipDurationSeconds)
        shipperMap.set(chunk.shipperName, existing)
      }

      // Engraver stats
      if (chunk.engraverName && chunk.engravingDurationSeconds && chunk.engravingDurationSeconds > 0) {
        const existing = engraverMap.get(chunk.engraverName) || { carts: 0, items: 0, orders: 0, totalSeconds: 0, fastest: Infinity, slowest: 0 }
        existing.carts++
        existing.items += chunk.itemsEngraved || 0
        existing.orders += chunk.ordersInChunk || 0
        existing.totalSeconds += chunk.engravingDurationSeconds
        existing.fastest = Math.min(existing.fastest, chunk.engravingDurationSeconds)
        existing.slowest = Math.max(existing.slowest, chunk.engravingDurationSeconds)
        engraverMap.set(chunk.engraverName, existing)
      }
    }

    const pickers = Array.from(pickerMap.entries())
      .map(([name, stats]) => ({
        name,
        carts: stats.carts,
        orders: stats.orders,
        avgSeconds: Math.round(stats.totalSeconds / stats.carts),
        avgSecondsPerOrder: stats.orders > 0 ? Math.round(stats.totalSeconds / stats.orders) : 0,
        fastest: stats.fastest === Infinity ? 0 : stats.fastest,
        slowest: stats.slowest,
      }))
      .sort((a, b) => b.orders - a.orders)

    const shippers = Array.from(shipperMap.entries())
      .map(([name, stats]) => ({
        name,
        carts: stats.carts,
        orders: stats.orders,
        avgSeconds: Math.round(stats.totalSeconds / stats.carts),
        avgSecondsPerOrder: stats.orders > 0 ? Math.round(stats.totalSeconds / stats.orders) : 0,
        fastest: stats.fastest === Infinity ? 0 : stats.fastest,
        slowest: stats.slowest,
      }))
      .sort((a, b) => b.orders - a.orders)

    const engravers = Array.from(engraverMap.entries())
      .map(([name, stats]) => ({
        name,
        carts: stats.carts,
        items: stats.items,
        orders: stats.orders,
        avgSeconds: Math.round(stats.totalSeconds / stats.carts),
        avgSecondsPerItem: stats.items > 0 ? Math.round(stats.totalSeconds / stats.items) : 0,
        fastest: stats.fastest === Infinity ? 0 : stats.fastest,
        slowest: stats.slowest,
      }))
      .sort((a, b) => b.items - a.items)

    // --- Build throughput ---
    const throughput = {
      shippedToday: shippedTodayCount,
      shippedPeriod: shippedPeriodCount,
      cartsCompletedPeriod: completedChunks.length,
    }

    return NextResponse.json({
      liveOps,
      orderHealth,
      performance: { pickers, shippers, engravers },
      throughput,
      period,
    })
  } catch (error) {
    console.error('Dashboard API error:', error)
    return NextResponse.json({ error: 'Failed to load dashboard data' }, { status: 500 })
  }
}
