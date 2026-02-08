'use client'

import { useState, useEffect, useCallback } from 'react'

// ============================================================================
// Types
// ============================================================================

interface DashboardData {
  liveOps: {
    pickingCarts: Array<{
      id: string; name: string; color: string | null
      pickerName: string; startedAt: string | null; orderCount: number
    }>
    shippingCarts: Array<{
      id: string; name: string; color: string | null
      shipperName: string; startedAt: string | null
      ordersShipped: number; ordersTotal: number
    }>
    queueDepth: {
      awaitingPick: number; pickedAwaitingShip: number
      onHold: number; errors: number
    }
  }
  orderHealth: {
    thresholds: { orangeMinDays: number; redMinDays: number }
    normal: number; late: number; reallyLate: number
    total: number; onHold: number; errors: number
  }
  performance: {
    pickers: Array<{
      name: string; carts: number; orders: number
      avgSeconds: number; avgSecondsPerOrder: number
      fastest: number; slowest: number
    }>
    shippers: Array<{
      name: string; carts: number; orders: number
      avgSeconds: number; avgSecondsPerOrder: number
      fastest: number; slowest: number
    }>
  }
  throughput: {
    shippedToday: number; shippedPeriod: number; cartsCompletedPeriod: number
  }
  period: string
}

type Period = 'today' | '7d' | '30d'

// ============================================================================
// Helpers
// ============================================================================

function formatDuration(seconds: number): string {
  if (seconds === 0) return '—'
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  if (mins === 0) return `${secs}s`
  return `${mins}m ${secs}s`
}

function formatMinutesAgo(dateStr: string | null): string {
  if (!dateStr) return '—'
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  return `${hours}h ${mins % 60}m ago`
}

const periodLabels: Record<Period, string> = {
  today: 'Today',
  '7d': 'Last 7 Days',
  '30d': 'Last 30 Days',
}

// ============================================================================
// Stat Card Component
// ============================================================================

function StatCard({ label, value, sub, color }: {
  label: string; value: number | string; sub?: string
  color?: 'green' | 'blue' | 'amber' | 'red' | 'gray'
}) {
  const colors = {
    green: 'bg-green-50 border-green-200 text-green-700',
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    red: 'bg-red-50 border-red-200 text-red-700',
    gray: 'bg-gray-50 border-gray-200 text-gray-700',
  }
  const c = colors[color || 'gray']

  return (
    <div className={`rounded-xl border-2 p-4 ${c}`}>
      <div className="text-sm font-medium opacity-75">{label}</div>
      <div className="text-3xl font-bold mt-1">{value}</div>
      {sub && <div className="text-xs opacity-60 mt-1">{sub}</div>}
    </div>
  )
}

// ============================================================================
// Main Page
// ============================================================================

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [period, setPeriod] = useState<Period>('7d')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/dashboard?period=${period}`)
      if (!res.ok) throw new Error('Failed to load')
      const d = await res.json()
      setData(d)
      setError(null)
    } catch {
      setError('Failed to load dashboard data')
    } finally {
      setLoading(false)
    }
  }, [period])

  // Fetch on mount and period change
  useEffect(() => {
    setLoading(true)
    fetchData()
  }, [fetchData])

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [fetchData])

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-lg text-gray-500">Loading dashboard...</div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="p-6">
        <div className="bg-red-50 text-red-600 p-4 rounded-lg text-center">{error}</div>
      </div>
    )
  }

  if (!data) return null

  const { liveOps, orderHealth, performance, throughput } = data
  const totalActiveCarts = liveOps.pickingCarts.length + liveOps.shippingCarts.length

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            Auto-refreshes every 30s
            {loading && <span className="ml-2 text-blue-500">Updating...</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(['today', '7d', '30d'] as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                period === p
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {periodLabels[p]}
            </button>
          ))}
        </div>
      </div>

      {/* ================================================================ */}
      {/* SECTION 1: Live Operations                                       */}
      {/* ================================================================ */}
      <div>
        <h2 className="text-lg font-bold text-gray-800 mb-3">Live Operations</h2>

        {/* Queue Depth Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <StatCard label="Awaiting Pick" value={liveOps.queueDepth.awaitingPick} color="blue" />
          <StatCard label="Awaiting Ship" value={liveOps.queueDepth.pickedAwaitingShip} color="amber" />
          <StatCard label="On Hold" value={liveOps.queueDepth.onHold} color="amber" />
          <StatCard label="Errors" value={liveOps.queueDepth.errors} color={liveOps.queueDepth.errors > 0 ? 'red' : 'gray'} />
        </div>

        {/* Active Carts */}
        {totalActiveCarts > 0 ? (
          <div className="grid md:grid-cols-2 gap-4">
            {/* Picking Carts */}
            {liveOps.pickingCarts.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-3">
                  Picking ({liveOps.pickingCarts.length})
                </h3>
                <div className="space-y-3">
                  {liveOps.pickingCarts.map(cart => (
                    <div key={cart.id} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full shrink-0" style={{ backgroundColor: cart.color || '#9ca3af' }} />
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-gray-900">{cart.name}</div>
                        <div className="text-sm text-gray-500">{cart.pickerName} · {cart.orderCount} orders</div>
                      </div>
                      <div className="text-sm text-gray-400 shrink-0">{formatMinutesAgo(cart.startedAt)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Shipping Carts */}
            {liveOps.shippingCarts.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-3">
                  Shipping ({liveOps.shippingCarts.length})
                </h3>
                <div className="space-y-3">
                  {liveOps.shippingCarts.map(cart => (
                    <div key={cart.id} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full shrink-0" style={{ backgroundColor: cart.color || '#9ca3af' }} />
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-gray-900">{cart.name}</div>
                        <div className="text-sm text-gray-500">
                          {cart.shipperName} · {cart.ordersShipped}/{cart.ordersTotal} shipped
                        </div>
                      </div>
                      <div className="text-sm text-gray-400 shrink-0">{formatMinutesAgo(cart.startedAt)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-6 text-center text-gray-500">
            No active carts right now
          </div>
        )}
      </div>

      {/* ================================================================ */}
      {/* SECTION 2: Order Health                                          */}
      {/* ================================================================ */}
      <div>
        <h2 className="text-lg font-bold text-gray-800 mb-3">Order Health</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard
            label="On Time"
            value={orderHealth.normal}
            sub={`< ${orderHealth.thresholds.orangeMinDays} days old`}
            color="green"
          />
          <StatCard
            label="Late"
            value={orderHealth.late}
            sub={`${orderHealth.thresholds.orangeMinDays}-${orderHealth.thresholds.redMinDays - 1} days old`}
            color={orderHealth.late > 0 ? 'amber' : 'green'}
          />
          <StatCard
            label="Very Late"
            value={orderHealth.reallyLate}
            sub={`${orderHealth.thresholds.redMinDays}+ days old`}
            color={orderHealth.reallyLate > 0 ? 'red' : 'green'}
          />
          <StatCard
            label="On Hold"
            value={orderHealth.onHold}
            color={orderHealth.onHold > 0 ? 'amber' : 'gray'}
          />
          <StatCard
            label="Errors"
            value={orderHealth.errors}
            color={orderHealth.errors > 0 ? 'red' : 'gray'}
          />
        </div>
        {orderHealth.total > 0 && (
          <div className="mt-3 bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-medium text-gray-600">{orderHealth.total} unshipped orders</span>
            </div>
            <div className="w-full h-4 bg-gray-100 rounded-full overflow-hidden flex">
              {orderHealth.normal > 0 && (
                <div
                  className="bg-green-500 h-full"
                  style={{ width: `${(orderHealth.normal / orderHealth.total) * 100}%` }}
                  title={`${orderHealth.normal} on time`}
                />
              )}
              {orderHealth.late > 0 && (
                <div
                  className="bg-amber-500 h-full"
                  style={{ width: `${(orderHealth.late / orderHealth.total) * 100}%` }}
                  title={`${orderHealth.late} late`}
                />
              )}
              {orderHealth.reallyLate > 0 && (
                <div
                  className="bg-red-500 h-full"
                  style={{ width: `${(orderHealth.reallyLate / orderHealth.total) * 100}%` }}
                  title={`${orderHealth.reallyLate} very late`}
                />
              )}
            </div>
            <div className="flex justify-between mt-1 text-xs text-gray-400">
              <span>On time</span>
              <span>Very late</span>
            </div>
          </div>
        )}
      </div>

      {/* ================================================================ */}
      {/* SECTION 3: Throughput                                            */}
      {/* ================================================================ */}
      <div>
        <h2 className="text-lg font-bold text-gray-800 mb-3">
          Throughput
          <span className="text-sm font-normal text-gray-500 ml-2">({periodLabels[period]})</span>
        </h2>
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="Shipped Today" value={throughput.shippedToday} color="green" />
          <StatCard
            label={`Shipped (${periodLabels[period]})`}
            value={throughput.shippedPeriod}
            color="blue"
          />
          <StatCard
            label={`Carts Completed`}
            value={throughput.cartsCompletedPeriod}
            color="blue"
          />
        </div>
      </div>

      {/* ================================================================ */}
      {/* SECTION 4: Team Performance                                      */}
      {/* ================================================================ */}
      <div>
        <h2 className="text-lg font-bold text-gray-800 mb-3">
          Team Performance
          <span className="text-sm font-normal text-gray-500 ml-2">({periodLabels[period]})</span>
        </h2>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Pickers Table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 bg-blue-50 border-b border-blue-100">
              <h3 className="font-bold text-blue-800">Pickers</h3>
            </div>
            {performance.pickers.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-500 text-xs uppercase">
                    <th className="text-left px-4 py-2">Name</th>
                    <th className="text-right px-4 py-2">Carts</th>
                    <th className="text-right px-4 py-2">Orders</th>
                    <th className="text-right px-4 py-2">Avg/Cart</th>
                    <th className="text-right px-4 py-2">Avg/Order</th>
                  </tr>
                </thead>
                <tbody>
                  {performance.pickers.map((picker, idx) => (
                    <tr key={picker.name} className={`border-b border-gray-50 ${idx === 0 ? 'bg-blue-50/50' : ''}`}>
                      <td className="px-4 py-2.5 font-medium text-gray-900">
                        {idx === 0 && performance.pickers.length > 1 && <span className="mr-1">&#9733;</span>}
                        {picker.name}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-600">{picker.carts}</td>
                      <td className="px-4 py-2.5 text-right text-gray-600">{picker.orders}</td>
                      <td className="px-4 py-2.5 text-right text-gray-600 font-mono">{formatDuration(picker.avgSeconds)}</td>
                      <td className="px-4 py-2.5 text-right text-gray-600 font-mono">{formatDuration(picker.avgSecondsPerOrder)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-6 text-center text-gray-400 text-sm">No picking data for this period</div>
            )}
          </div>

          {/* Shippers Table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 bg-green-50 border-b border-green-100">
              <h3 className="font-bold text-green-800">Shippers</h3>
            </div>
            {performance.shippers.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-500 text-xs uppercase">
                    <th className="text-left px-4 py-2">Name</th>
                    <th className="text-right px-4 py-2">Carts</th>
                    <th className="text-right px-4 py-2">Orders</th>
                    <th className="text-right px-4 py-2">Avg/Cart</th>
                    <th className="text-right px-4 py-2">Avg/Order</th>
                  </tr>
                </thead>
                <tbody>
                  {performance.shippers.map((shipper, idx) => (
                    <tr key={shipper.name} className={`border-b border-gray-50 ${idx === 0 ? 'bg-green-50/50' : ''}`}>
                      <td className="px-4 py-2.5 font-medium text-gray-900">
                        {idx === 0 && performance.shippers.length > 1 && <span className="mr-1">&#9733;</span>}
                        {shipper.name}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-600">{shipper.carts}</td>
                      <td className="px-4 py-2.5 text-right text-gray-600">{shipper.orders}</td>
                      <td className="px-4 py-2.5 text-right text-gray-600 font-mono">{formatDuration(shipper.avgSeconds)}</td>
                      <td className="px-4 py-2.5 text-right text-gray-600 font-mono">{formatDuration(shipper.avgSecondsPerOrder)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-6 text-center text-gray-400 text-sm">No shipping data for this period</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
