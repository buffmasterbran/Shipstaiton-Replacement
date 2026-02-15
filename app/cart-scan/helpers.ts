import { ChunkOrder, OrderItem, PickingMode } from './types'

// Convert shipstationId to barcode string: ^#^ + hex + ^
export function getShipstationBarcode(order: ChunkOrder | null): string | null {
  if (!order) return null
  const ssId = order.rawPayload?.shipstationOrderId || order.rawPayload?.shipstationId
  if (!ssId) return null
  const numId = typeof ssId === 'number' ? ssId : parseInt(ssId, 10)
  if (isNaN(numId) || numId <= 0) return null
  return '^#^' + numId.toString(16) + '^'
}

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
      sku: item.sku || 'N/A',
      name: item.name || 'Unknown',
      quantity: item.quantity || 1,
    }))
}

export function getModeBadge(mode: PickingMode, isPersonalized?: boolean) {
  if (isPersonalized) return { label: 'PERSONALIZED', bg: 'bg-purple-600 text-white' }
  switch (mode) {
    case 'SINGLES': return { label: 'SINGLES', bg: 'bg-blue-600 text-white' }
    case 'BULK': return { label: 'BULK', bg: 'bg-orange-600 text-white' }
    case 'ORDER_BY_SIZE': return { label: 'ORDER BY SIZE', bg: 'bg-teal-600 text-white' }
    default: return { label: 'STANDARD', bg: 'bg-gray-600 text-white' }
  }
}
