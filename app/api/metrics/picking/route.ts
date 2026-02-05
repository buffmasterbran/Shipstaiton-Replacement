import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period') || 'today' // today, week, month

    // Calculate date range
    const now = new Date()
    let startDate: Date
    
    switch (period) {
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        break
      case 'month':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        break
      case 'today':
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    }

    // Get completed chunks with timing data
    const completedChunks = await prisma.pickChunk.findMany({
      where: {
        status: 'COMPLETED',
        pickingCompletedAt: { gte: startDate },
      },
      select: {
        id: true,
        pickerName: true,
        shipperName: true,
        ordersInChunk: true,
        ordersShipped: true,
        ordersSkipped: true,
        pickDurationSeconds: true,
        shipDurationSeconds: true,
        pickingStartedAt: true,
        pickingCompletedAt: true,
        shippingStartedAt: true,
        shippingCompletedAt: true,
        batch: {
          select: {
            name: true,
          },
        },
      },
    })

    // Calculate aggregate metrics
    const totalChunks = completedChunks.length
    const totalOrdersPicked = completedChunks.reduce((sum, c) => sum + c.ordersInChunk, 0)
    const totalOrdersShipped = completedChunks.reduce((sum, c) => sum + c.ordersShipped, 0)
    const totalOrdersSkipped = completedChunks.reduce((sum, c) => sum + c.ordersSkipped, 0)

    // Pick metrics
    const pickDurations = completedChunks
      .filter(c => c.pickDurationSeconds != null)
      .map(c => c.pickDurationSeconds!)
    
    const avgPickDuration = pickDurations.length > 0
      ? Math.round(pickDurations.reduce((a, b) => a + b, 0) / pickDurations.length)
      : 0

    const avgPickOrdersPerHour = pickDurations.length > 0
      ? Math.round(
          (totalOrdersPicked / pickDurations.reduce((a, b) => a + b, 0)) * 3600
        )
      : 0

    // Ship metrics
    const shipDurations = completedChunks
      .filter(c => c.shipDurationSeconds != null)
      .map(c => c.shipDurationSeconds!)
    
    const avgShipDuration = shipDurations.length > 0
      ? Math.round(shipDurations.reduce((a, b) => a + b, 0) / shipDurations.length)
      : 0

    const avgShipOrdersPerHour = shipDurations.length > 0
      ? Math.round(
          (totalOrdersShipped / shipDurations.reduce((a, b) => a + b, 0)) * 3600
        )
      : 0

    // Picker leaderboard
    const pickerStats = new Map<string, { orders: number; totalSeconds: number }>()
    completedChunks.forEach(chunk => {
      if (chunk.pickerName && chunk.pickDurationSeconds) {
        const existing = pickerStats.get(chunk.pickerName) || { orders: 0, totalSeconds: 0 }
        existing.orders += chunk.ordersInChunk
        existing.totalSeconds += chunk.pickDurationSeconds
        pickerStats.set(chunk.pickerName, existing)
      }
    })

    const pickerLeaderboard = Array.from(pickerStats.entries())
      .map(([name, stats]) => ({
        name,
        orders: stats.orders,
        avgOrdersPerHour: stats.totalSeconds > 0 
          ? Math.round((stats.orders / stats.totalSeconds) * 3600) 
          : 0,
      }))
      .sort((a, b) => b.orders - a.orders)
      .slice(0, 10)

    // Shipper leaderboard
    const shipperStats = new Map<string, { orders: number; totalSeconds: number }>()
    completedChunks.forEach(chunk => {
      if (chunk.shipperName && chunk.shipDurationSeconds) {
        const existing = shipperStats.get(chunk.shipperName) || { orders: 0, totalSeconds: 0 }
        existing.orders += chunk.ordersShipped
        existing.totalSeconds += chunk.shipDurationSeconds
        shipperStats.set(chunk.shipperName, existing)
      }
    })

    const shipperLeaderboard = Array.from(shipperStats.entries())
      .map(([name, stats]) => ({
        name,
        orders: stats.orders,
        avgOrdersPerHour: stats.totalSeconds > 0 
          ? Math.round((stats.orders / stats.totalSeconds) * 3600) 
          : 0,
      }))
      .sort((a, b) => b.orders - a.orders)
      .slice(0, 10)

    // Problem rate (skipped orders / total orders)
    const problemRate = totalOrdersPicked > 0
      ? Math.round((totalOrdersSkipped / totalOrdersPicked) * 100 * 10) / 10
      : 0

    // Batch status counts
    const batchStatuses = await prisma.pickBatch.groupBy({
      by: ['status'],
      _count: true,
    })

    const batchCounts = {
      draft: 0,
      released: 0,
      in_progress: 0,
      completed: 0,
    }
    batchStatuses.forEach(s => {
      const key = s.status.toLowerCase().replace('_', '_') as keyof typeof batchCounts
      if (key in batchCounts) {
        batchCounts[key] = s._count
      }
    })

    return NextResponse.json({
      period,
      summary: {
        totalChunks,
        totalOrdersPicked,
        totalOrdersShipped,
        totalOrdersSkipped,
        problemRate,
      },
      picking: {
        avgDurationSeconds: avgPickDuration,
        avgOrdersPerHour: avgPickOrdersPerHour,
        leaderboard: pickerLeaderboard,
      },
      shipping: {
        avgDurationSeconds: avgShipDuration,
        avgOrdersPerHour: avgShipOrdersPerHour,
        leaderboard: shipperLeaderboard,
      },
      batches: batchCounts,
    })
  } catch (error) {
    console.error('Failed to fetch picking metrics:', error)
    return NextResponse.json({ error: 'Failed to fetch metrics' }, { status: 500 })
  }
}
