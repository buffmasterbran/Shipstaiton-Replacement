/**
 * Extract size from SKU
 * DPT10 = 10oz
 * DPT16 = 16oz
 * DPT26 = 26oz
 * Otherwise = Accessories
 */
export function getSizeFromSku(sku: string): string {
  if (!sku) return 'Accessories'
  
  const upperSku = sku.toUpperCase()
  if (upperSku.startsWith('DPT10')) return '10oz'
  if (upperSku.startsWith('DPT16')) return '16oz'
  if (upperSku.startsWith('DPT26')) return '26oz'
  
  return 'Accessories'
}

/**
 * Get color from item - uses the color field sent from NetSuite.
 * Returns 'Unknown' for older orders without color data.
 */
export function getColorFromSku(sku: string, itemName?: string, itemColor?: string): string {
  if (itemColor && itemColor.trim()) {
    return itemColor.trim()
  }
  return 'Unknown'
}

/**
 * Check if an item is shipping insurance
 * Shipping insurance items typically have "insurance", "shipping", or specific SKU patterns
 */
export function isShippingInsurance(sku: string, itemName?: string): boolean {
  if (!sku) return false
  
  const upperSku = sku.toUpperCase()
  const upperName = itemName?.toUpperCase() || ''
  
  // Check for common shipping insurance indicators
  if (
    upperSku.includes('INSURANCE') ||
    upperSku.includes('SHIPPING') ||
    upperSku.includes('SHIP') ||
    upperName.includes('INSURANCE') ||
    upperName.includes('SHIPPING PROTECTION') ||
    upperSku.startsWith('SHIP') ||
    upperSku === '99998' ||
    upperSku === '99999'
  ) {
    return true
  }
  
  return false
}

/**
 * Check if an order is a single-item order
 * Returns true if:
 * - Order has exactly 1 non-insurance item with quantity 1 (1 cup total)
 * - Order has 2 items but one is shipping insurance and the other has quantity 1
 */
export function isSingleItemOrder(items: any[]): boolean {
  if (!items || items.length === 0) return false
  
  // Filter out shipping insurance items
  const nonInsuranceItems = items.filter(
    (item) => !isShippingInsurance(item.sku || '', item.name || '')
  )
  
  // Must have exactly 1 non-insurance item
  if (nonInsuranceItems.length !== 1) return false
  
  // Check that the single item has quantity 1 (1 cup total)
  const singleItem = nonInsuranceItems[0]
  const quantity = singleItem.quantity || 1
  
  return quantity === 1
}

