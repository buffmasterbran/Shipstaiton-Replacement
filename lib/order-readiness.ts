import type { OrderLog } from '@/context/OrdersContext'

export interface ReadinessResult {
  ready: boolean
  missing: string[]
}

/**
 * Checks if an order has everything needed to purchase a shipping label.
 * Returns { ready, missing[] } where missing lists human-readable field names.
 */
export function checkOrderReadiness(order: OrderLog): ReadinessResult {
  const missing: string[] = []

  const rate = order.preShoppedRate
  if (!rate?.serviceCode) {
    missing.push('Service')
  }

  if (!order.shippedWeight || order.shippedWeight <= 0) {
    missing.push('Weight')
  }

  const box = order.suggestedBox
  if (!box?.lengthInches || !box?.widthInches || !box?.heightInches) {
    missing.push('Dims')
  }

  const raw = order.rawPayload
  const data = Array.isArray(raw) ? raw[0] : raw
  const shipTo = data?.shipTo
  if (!shipTo?.street1 || !shipTo?.city || !shipTo?.postalCode) {
    missing.push('Address')
  }

  if (!order.addressValidated && !order.addressOverridden) {
    missing.push('Verified')
  }

  return { ready: missing.length === 0, missing }
}

/**
 * Summarizes readiness across an array of orders.
 */
export function countReady(orders: OrderLog[]): { ready: number; notReady: number } {
  let ready = 0
  let notReady = 0
  for (const o of orders) {
    if (checkOrderReadiness(o).ready) ready++
    else notReady++
  }
  return { ready, notReady }
}
