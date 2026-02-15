export function getTypeBadge(type: string, isPersonalized: boolean) {
  if (isPersonalized) return { label: 'Personalized', bg: 'bg-purple-100 text-purple-700' }
  switch (type) {
    case 'SINGLES': return { label: 'Singles', bg: 'bg-blue-100 text-blue-700' }
    case 'BULK': return { label: 'Bulk', bg: 'bg-orange-100 text-orange-700' }
    case 'ORDER_BY_SIZE': return { label: 'Order by Size', bg: 'bg-teal-100 text-teal-700' }
    default: return { label: type, bg: 'bg-gray-100 text-gray-700' }
  }
}

// Deterministic color from batch ID for shared batch visual matching
export const SHARED_COLORS = [
  '#6366f1', // indigo
  '#ec4899', // pink
  '#f59e0b', // amber
  '#10b981', // emerald
  '#8b5cf6', // violet
  '#ef4444', // red
  '#06b6d4', // cyan
  '#f97316', // orange
  '#14b8a6', // teal
  '#a855f7', // purple
]

export function getSharedColor(batchId: string): string {
  let hash = 0
  for (let i = 0; i < batchId.length; i++) {
    hash = ((hash << 5) - hash) + batchId.charCodeAt(i)
    hash |= 0
  }
  return SHARED_COLORS[Math.abs(hash) % SHARED_COLORS.length]
}

export function getStatusColor(status: string) {
  switch (status) {
    case 'ACTIVE': return 'bg-blue-100 text-blue-700'
    case 'IN_PROGRESS': return 'bg-yellow-100 text-yellow-700'
    case 'COMPLETED': return 'bg-green-100 text-green-700'
    // Legacy statuses
    case 'DRAFT': return 'bg-gray-100 text-gray-700'
    case 'RELEASED': return 'bg-blue-100 text-blue-700'
    default: return 'bg-gray-100 text-gray-700'
  }
}
