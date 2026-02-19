import { OrderItem } from './types'

export function getOrderItems(rawPayload: any): OrderItem[] {
  const order = Array.isArray(rawPayload) ? rawPayload[0] : rawPayload
  const items = order?.items || []
  return items
    .filter((item: any) => {
      const sku = (item.sku || '').toUpperCase()
      const name = (item.name || '').toUpperCase()
      return !sku.includes('INSURANCE') && !sku.includes('SHIPPING') && !name.includes('INSURANCE')
    })
    .map((item: any) => ({
      sku: item.sku || 'UNKNOWN',
      name: item.name || item.sku || 'Unknown Item',
      quantity: item.quantity || 1,
    }))
}

export function extractProductInfo(sku: string): { size: string; color: string } {
  const parts = sku.split('-')
  // Common pattern: BRAND-SIZE-COLOR or BRAND-COLOR-SIZE
  let size = ''
  let color = ''
  for (const part of parts) {
    if (/^\d+oz$/i.test(part)) size = part
    else if (/^\d+$/.test(part)) size = part + 'oz'
    else if (part.length > 2 && !/^[A-Z]{2,4}$/.test(part)) color = part
  }
  return { size: size || 'N/A', color: color || 'N/A' }
}

export function formatTimer(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

export function getModeBadge(type?: string, isPersonalized?: boolean) {
  if (isPersonalized) return { label: 'PERSONALIZED', bg: 'bg-purple-600' }
  switch (type) {
    case 'SINGLES': return { label: 'SINGLES', bg: 'bg-blue-600' }
    case 'BULK': return { label: 'BULK', bg: 'bg-orange-600' }
    case 'ORDER_BY_SIZE': return { label: 'ORDER BY SIZE', bg: 'bg-teal-600' }
    default: return { label: 'PICK', bg: 'bg-gray-600' }
  }
}
