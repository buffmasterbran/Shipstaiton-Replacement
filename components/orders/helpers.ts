import type { OrderLog, OrderHighlightSettings, OrderTypeFilter } from './types'

function formatCurrency(amount: number | string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(amount))
}

/** Normalize to local calendar date (midnight) so "days old" is consistent regardless of UTC vs local parsing. */
function toCalendarDate(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** Days between order date and today (floor). Uses orderDate or createdAt. Calendar-day based so sort-by-date gives blocks. */
function getDaysOld(log: OrderLog): number {
  const payload = log.rawPayload as any
  const order = Array.isArray(payload) ? payload[0] : payload
  const raw = order?.orderDate ? new Date(order.orderDate) : new Date(log.createdAt)
  const orderDate = toCalendarDate(raw)
  const today = toCalendarDate(new Date())
  const diffMs = today.getTime() - orderDate.getTime()
  return Math.floor(diffMs / 86400000)
}

/** Row color = age only (so sort-by-date gives clear red / orange / white blocks). Red = 6+ days, Orange = 3–6 days. */
function getOrderHighlightType(
  log: OrderLog,
  settings: OrderHighlightSettings | null | undefined
): 'red' | 'orange' | null {
  if (!settings) return null
  const days = getDaysOld(log)
  if (days >= settings.redMinDays) return 'red'
  if (days > settings.orangeMinDays && days <= settings.orangeMaxDays) return 'orange'
  return null
}

function getOrderDate(log: OrderLog): Date {
  const payload = log.rawPayload as any
  const order = Array.isArray(payload) ? payload[0] : payload
  const d = order?.orderDate ? new Date(order.orderDate) : new Date(log.createdAt)
  return toCalendarDate(d)
}

function getCustomerName(log: OrderLog): string {
  const payload = log.rawPayload as any
  const order = Array.isArray(payload) ? payload[0] : payload
  return order?.shipTo?.name || order?.billTo?.name || 'N/A'
}

function getOrderNumber(log: OrderLog): string {
  const payload = log.rawPayload as any
  const order = Array.isArray(payload) ? payload[0] : payload
  return String(order?.orderNumber ?? log.orderNumber ?? '')
}

function getAmount(log: OrderLog): number {
  const payload = log.rawPayload as any
  const order = Array.isArray(payload) ? payload[0] : payload
  return typeof order?.amountPaid === 'number' ? order.amountPaid : 0
}

/** Categorize order type based on items, shipping, etc. Adjust logic as needed. */
function getOrderType(log: OrderLog): OrderTypeFilter {
  const payload = log.rawPayload as any
  const order = Array.isArray(payload) ? payload[0] : payload
  const items = order?.items || []
  const totalQty = items.reduce((sum: number, item: any) => sum + (item.quantity || 1), 0)

  // Check if batched (has batchId or batch info)
  if (order?.batchId || order?.batch || log.status?.toUpperCase().includes('BATCH')) {
    return 'batched'
  }

  // Single = 1 item total quantity
  if (totalQty === 1) {
    return 'single'
  }

  // Box = orders that need box packaging (2-5 items, or shipping method indicates box)
  if (totalQty >= 2 && totalQty <= 5) {
    return 'box'
  }

  // Bulk = larger orders (6+ items)
  if (totalQty >= 6) {
    return 'bulk'
  }

  // Uncategorized = anything else
  return 'uncategorized'
}

export {
  formatCurrency,
  getDaysOld,
  getOrderHighlightType,
  getOrderDate,
  getCustomerName,
  getOrderNumber,
  getAmount,
  getOrderType,
}
