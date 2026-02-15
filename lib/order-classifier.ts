/**
 * Order Classification Engine (V2)
 * 
 * Classifies orders into one of four categories:
 * 
 * - SINGLE: Exactly 1 non-insurance item, quantity 1
 * - BULK: 2-4 total items per order AND at least N identical orders exist (N = configurable, default 4)
 * - ORDER_BY_SIZE: Everything else (multi-item orders that don't qualify as Bulk)
 * - PERSONALIZED: Any order with personalization flag (always picked as 1-per-bin)
 * 
 * Key rules:
 * - Singles are ALWAYS singles, regardless of how many identical singles exist
 * - Bulk requires exact-match identical orders (same SKUs + same quantities)
 * - Orders with 5+ items can never be Bulk (physical constraint: 4-wide cart)
 * - Personalized overrides everything - always picked 1-per-bin
 * - Re-classification happens when new orders arrive (may push groups over bulk threshold)
 */

import { isShippingInsurance, isSingleItemOrder } from './order-utils'

// ============================================================================
// Types
// ============================================================================

export type OrderClassification = 'SINGLE' | 'BULK' | 'ORDER_BY_SIZE' | 'PERSONALIZED'

export interface ClassifiableItem {
  sku: string
  name?: string
  quantity: number
}

export interface ClassifiableOrder {
  orderNumber: string
  items: ClassifiableItem[]
  isPersonalized: boolean
  isExpedited?: boolean
}

/** Signature identifying a unique order composition for bulk matching */
export interface OrderSignature {
  signature: string
  itemCount: number // Total items (sum of quantities, excluding insurance)
  items: Array<{ sku: string; quantity: number }> // Normalized, sorted
}

// ============================================================================
// Core Classification
// ============================================================================

/**
 * Classify a single order WITHOUT considering duplicates (stateless).
 * Returns SINGLE, PERSONALIZED, or a "candidate" that needs duplicate-checking.
 * 
 * For BULK classification, you must use classifyWithDuplicates() which
 * compares against other orders.
 */
function classifyOrderBasic(order: ClassifiableOrder): OrderClassification {
  // Personalized always wins
  if (order.isPersonalized) {
    return 'PERSONALIZED'
  }

  // Filter out insurance items
  const realItems = order.items.filter(
    (item) => !isShippingInsurance(item.sku || '', item.name || '')
  )

  // Single: exactly 1 item, qty 1
  if (realItems.length === 1 && (realItems[0].quantity || 1) === 1) {
    return 'SINGLE'
  }

  // Multi-item orders default to ORDER_BY_SIZE
  // BULK classification requires checking for duplicates (see classifyWithDuplicates)
  return 'ORDER_BY_SIZE'
}

/**
 * Compute a deterministic signature for an order's item composition.
 * Two orders with the same signature are "identical" for bulk matching.
 * 
 * Ignores insurance items. Sorts by SKU for deterministic output.
 */
export function computeOrderSignature(items: ClassifiableItem[]): OrderSignature {
  // Filter out insurance items
  const realItems = items.filter(
    (item) => !isShippingInsurance(item.sku || '', item.name || '')
  )

  // Normalize: sort by SKU, keep sku + quantity
  const normalized = realItems
    .map((item) => ({
      sku: (item.sku || '').toUpperCase().trim(),
      quantity: item.quantity || 1,
    }))
    .sort((a, b) => a.sku.localeCompare(b.sku))

  // Compute total item count (sum of quantities)
  const itemCount = normalized.reduce((sum, item) => sum + item.quantity, 0)

  // Create signature string: "SKU1:QTY|SKU2:QTY|..."
  const signature = normalized.map((item) => `${item.sku}:${item.quantity}`).join('|')

  return { signature, itemCount, items: normalized }
}

/**
 * Check if an order's item composition qualifies for bulk picking.
 * Requirements:
 * - Total items (sum of quantities) must be 2-4
 * - This is a physical constraint: cart rows are 4 bins wide, 1 bin per SKU instance
 */
function canBeBulk(sig: OrderSignature): boolean {
  return sig.itemCount >= 2 && sig.itemCount <= 4
}

/**
 * Group orders by their signature and classify, considering duplicates.
 * 
 * @param orders - All unprocessed orders to consider
 * @param bulkThreshold - Minimum identical orders to qualify as BULK (default 4)
 * @returns Map of orderNumber -> classification
 */
export function classifyOrders(
  orders: ClassifiableOrder[],
  bulkThreshold: number = 4
): Map<string, OrderClassification> {
  const result = new Map<string, OrderClassification>()

  // First pass: classify singles and personalized (no duplicate check needed)
  const candidateOrders: Array<{ order: ClassifiableOrder; sig: OrderSignature }> = []

  for (const order of orders) {
    const basic = classifyOrderBasic(order)

    if (basic === 'SINGLE' || basic === 'PERSONALIZED') {
      result.set(order.orderNumber, basic)
      continue
    }

    // Multi-item order - needs duplicate checking for potential BULK
    const sig = computeOrderSignature(order.items)
    candidateOrders.push({ order, sig })
  }

  // Second pass: group candidates by signature to find bulk opportunities
  const signatureGroups = new Map<string, Array<{ order: ClassifiableOrder; sig: OrderSignature }>>()

  for (const candidate of candidateOrders) {
    const key = candidate.sig.signature
    if (!signatureGroups.has(key)) {
      signatureGroups.set(key, [])
    }
    signatureGroups.get(key)!.push(candidate)
  }

  // Third pass: classify based on group sizes
  signatureGroups.forEach((group) => {
    const firstSig = group[0].sig

    // Check if this group qualifies as BULK:
    // 1. Items per order must be 2-4 (physical cart constraint)
    // 2. Number of identical orders must meet threshold
    const isBulkEligible = canBeBulk(firstSig) && group.length >= bulkThreshold

    for (const { order } of group) {
      result.set(order.orderNumber, isBulkEligible ? 'BULK' : 'ORDER_BY_SIZE')
    }
  })

  return result
}

// ============================================================================
// Bulk Batch Splitting
// ============================================================================

/**
 * Split a group of identical orders into balanced sub-groups of max 24.
 * 
 * Algorithm: ceil(total / 24) groups, distributed as evenly as possible.
 * Example: 50 orders -> 3 groups of 17, 17, 16
 * Example: 72 orders -> 3 groups of 24, 24, 24
 * Example: 30 orders -> 2 groups of 15, 15
 */
export function splitBulkGroup(totalOrders: number, maxPerBin: number = 24): number[] {
  if (totalOrders <= maxPerBin) {
    return [totalOrders]
  }

  const groups = Math.ceil(totalOrders / maxPerBin)
  const perGroup = Math.floor(totalOrders / groups)
  const remainder = totalOrders % groups

  const splits: number[] = []
  for (let i = 0; i < groups; i++) {
    // First 'remainder' groups get perGroup + 1, rest get perGroup
    splits.push(i < remainder ? perGroup + 1 : perGroup)
  }

  return splits
}

/**
 * Build the SKU layout for a bulk batch row on the cart.
 * Each SKU instance in the order gets its own bin.
 * Duplicate SKUs within an order get separate bins.
 * 
 * Example: Order has 1x Red, 1x White, 2x Green
 * -> 4 bins: [Red, White, Green, Green]
 * Each bin's quantity = the number of identical orders in this split.
 * 
 * @param items - Normalized items from the order signature
 * @param orderCount - Number of identical orders in this split
 * @returns Array of bin definitions for the row
 */
export function buildBulkSkuLayout(
  items: Array<{ sku: string; quantity: number }>,
  orderCount: number
): Array<{ sku: string; binQty: number; masterUnitIndex: number }> {
  const layout: Array<{ sku: string; binQty: number; masterUnitIndex: number }> = []
  let masterUnitIndex = 0

  for (const item of items) {
    // Each unit of quantity gets its own bin (master unit)
    for (let q = 0; q < item.quantity; q++) {
      layout.push({
        sku: item.sku,
        binQty: orderCount, // Every bin has the same qty = number of orders
        masterUnitIndex: masterUnitIndex++,
      })
    }
  }

  return layout
}

