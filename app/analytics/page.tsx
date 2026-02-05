'use client'

import { useState, useEffect } from 'react'

interface PickingMetrics {
  period: string
  summary: {
    totalChunks: number
    totalOrdersPicked: number
    totalOrdersShipped: number
    totalOrdersSkipped: number
    problemRate: number
  }
  picking: {
    avgDurationSeconds: number
    avgOrdersPerHour: number
    leaderboard: Array<{ name: string; orders: number; avgOrdersPerHour: number }>
  }
  shipping: {
    avgDurationSeconds: number
    avgOrdersPerHour: number
    leaderboard: Array<{ name: string; orders: number; avgOrdersPerHour: number }>
  }
  batches: {
    draft: number
    released: number
    in_progress: number
    completed: number
  }
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  if (mins < 60) return `${mins}m ${secs}s`
  const hours = Math.floor(mins / 60)
  const remainingMins = mins % 60
  return `${hours}h ${remainingMins}m`
}

function StatCard({ 
  title, 
  value, 
  subtitle,
  color = 'blue' 
}: { 
  title: string
  value: string | number
  subtitle?: string
  color?: 'blue' | 'green' | 'yellow' | 'red' | 'purple'
}) {
  const colorClasses = {
    blue: 'text-blue-600',
    green: 'text-green-600',
    yellow: 'text-yellow-600',
    red: 'text-red-600',
    purple: 'text-purple-600',
  }

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="text-sm text-gray-500">{title}</div>
      <div className={`text-3xl font-bold ${colorClasses[color]}`}>{value}</div>
      {subtitle && <div className="text-sm text-gray-400">{subtitle}</div>}
    </div>
  )
}

function Leaderboard({ 
  title, 
  entries 
}: { 
  title: string
  entries: Array<{ name: string; orders: number; avgOrdersPerHour: number }>
}) {
  if (entries.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="font-semibold text-gray-900 mb-3">{title}</h3>
        <p className="text-gray-400 text-sm">No data yet</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h3 className="font-semibold text-gray-900 mb-3">{title}</h3>
      <div className="space-y-2">
        {entries.map((entry, idx) => (
          <div key={entry.name} className="flex items-center gap-3">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
              idx === 0 ? 'bg-yellow-100 text-yellow-700' :
              idx === 1 ? 'bg-gray-100 text-gray-600' :
              idx === 2 ? 'bg-orange-100 text-orange-700' :
              'bg-gray-50 text-gray-500'
            }`}>
              {idx + 1}
            </div>
            <div className="flex-1">
              <div className="font-medium text-gray-900">{entry.name}</div>
              <div className="text-xs text-gray-500">{entry.avgOrdersPerHour} orders/hr</div>
            </div>
            <div className="text-right font-bold text-gray-700">
              {entry.orders}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('today')
  const [metrics, setMetrics] = useState<PickingMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchMetrics = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/metrics/picking?period=${period}`)
        if (!res.ok) throw new Error('Failed to fetch metrics')
        const data = await res.json()
        setMetrics(data)
      } catch (err: any) {
        setError(err.message || 'Failed to load metrics')
      } finally {
        setLoading(false)
      }
    }

    fetchMetrics()
  }, [period])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Picking & Shipping Analytics</h1>
        <div className="flex gap-2">
          {(['today', 'week', 'month'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                period === p
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {p === 'today' ? 'Today' : p === 'week' ? 'This Week' : 'This Month'}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">Loading metrics...</span>
        </div>
      )}

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg">
          {error}
        </div>
      )}

      {metrics && !loading && (
        <div className="space-y-6">
          {/* Batch Status */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Batch Status</h2>
            <div className="grid grid-cols-4 gap-4">
              <StatCard title="Draft" value={metrics.batches.draft} color="blue" />
              <StatCard title="Released" value={metrics.batches.released} color="purple" />
              <StatCard title="In Progress" value={metrics.batches.in_progress} color="yellow" />
              <StatCard title="Completed" value={metrics.batches.completed} color="green" />
            </div>
          </div>

          {/* Summary Stats */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Summary</h2>
            <div className="grid grid-cols-5 gap-4">
              <StatCard 
                title="Chunks Completed" 
                value={metrics.summary.totalChunks} 
                color="blue"
              />
              <StatCard 
                title="Orders Picked" 
                value={metrics.summary.totalOrdersPicked} 
                color="blue"
              />
              <StatCard 
                title="Orders Shipped" 
                value={metrics.summary.totalOrdersShipped} 
                color="green"
              />
              <StatCard 
                title="Orders Skipped" 
                value={metrics.summary.totalOrdersSkipped} 
                subtitle="Out of stock"
                color="yellow"
              />
              <StatCard 
                title="Problem Rate" 
                value={`${metrics.summary.problemRate}%`} 
                color={metrics.summary.problemRate > 5 ? 'red' : 'green'}
              />
            </div>
          </div>

          {/* Picking Performance */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Picking Performance</h2>
            <div className="grid grid-cols-3 gap-4">
              <StatCard 
                title="Avg Chunk Duration" 
                value={formatDuration(metrics.picking.avgDurationSeconds)} 
                subtitle="Time to pick one cart"
                color="blue"
              />
              <StatCard 
                title="Avg Orders/Hour" 
                value={metrics.picking.avgOrdersPerHour} 
                subtitle="Picking speed"
                color="blue"
              />
              <Leaderboard 
                title="Top Pickers" 
                entries={metrics.picking.leaderboard} 
              />
            </div>
          </div>

          {/* Shipping Performance */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Shipping Performance</h2>
            <div className="grid grid-cols-3 gap-4">
              <StatCard 
                title="Avg Cart Ship Time" 
                value={formatDuration(metrics.shipping.avgDurationSeconds)} 
                subtitle="Time to ship one cart"
                color="green"
              />
              <StatCard 
                title="Avg Orders/Hour" 
                value={metrics.shipping.avgOrdersPerHour} 
                subtitle="Shipping speed"
                color="green"
              />
              <Leaderboard 
                title="Top Shippers" 
                entries={metrics.shipping.leaderboard} 
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
