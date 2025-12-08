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
 * Extract color from SKU
 * Colors typically come after the size prefix (e.g., DPT10MC = Canyon Sky)
 * Pattern: DPT{size}{color code}
 */
export function getColorFromSku(sku: string, itemName?: string): string {
  // Common color codes in SKUs
  const colorMap: { [key: string]: string } = {
    // Solid Matte colors
    'MC': 'Canyon Sky',
    'MDFF': 'Dragon Fruit Fuchsia',
    'MPB': 'Paradise Blue',
    'MTD': 'The Deep (Navy)',
    'MCH': 'Champagne',
    'MCHM': 'Champagne (Metallic)',
    'MCR': 'Coral',
    'MDB': 'Day Break',
    'MEE': 'Enchanted Evergreen',
    'MFG': 'Forever Green',
    'MGW': 'Great White',
    'MKR': 'Kraken',
    'MKRB': 'Kraken Black',
    'MLL': 'Last Light',
    'MLM': 'Limon',
    'MPR': 'Party Red',
    'MSC': 'Sand Castle',
    'MSL': 'Slate',
    'MS': 'Slate', // Variant
    'ML': 'Last Light', // Variant
    'MSO': 'Solar Orange',
    'MSP': 'Solstice Purple',
    'MSS': 'Sunset',
    'MWL': 'White Lotus',
    // Ombre/Pattern variants (these might need special handling)
    'POSC': 'Party Red', // Ombre variant
    'POLL': 'Party Red', // Ombre variant
    'PODB': 'Party Red', // Ombre variant
    'PWL': 'Party Red', // Ombre variant
    // Other variants
    'SC': 'Unknown', // Special case - might be a variant
    'GPR': 'Unknown', // Gloss variant
    'SS-PERS': 'Personalized',
  }
  
  if (!sku) return 'Unknown'
  
  const upperSku = sku.toUpperCase()
  
  // Try to extract color code after DPT10/16/26
  // Pattern: DPT{size}{color code}
  const match = upperSku.match(/DPT(10|16|26)([A-Z]+(?:-[A-Z]+)?)/)
  if (match && match[2]) {
    const colorCode = match[2]
    
    // Check exact match first
    if (colorMap[colorCode]) {
      return colorMap[colorCode]
    }
    
    // Check if it starts with M (matte) and we have a partial match
    if (colorCode.startsWith('M')) {
      // Try to find a match that starts with the same prefix
      for (const [code, color] of Object.entries(colorMap)) {
        if (colorCode.startsWith(code) || code.startsWith(colorCode)) {
          return color
        }
      }
    }
    
    // For ombre variants starting with P
    if (colorCode.startsWith('P')) {
      return 'Ombre Variant'
    }
  }
  
  // Fallback: try to extract from item name if provided
  if (itemName) {
    const upperName = itemName.toUpperCase()
    // Look for color names in the item name
    const colors = [
      'CANYON SKY', 'DRAGON FRUIT FUCHSIA', 'PARADISE BLUE', 'THE DEEP', 'NAVY',
      'CHAMPAGNE', 'CORAL', 'DAY BREAK', 'ENCHANTED EVERGREEN', 'FOREVER GREEN',
      'GREAT WHITE', 'KRAKEN', 'LAST LIGHT', 'LIMON', 'PARTY RED', 'SAND CASTLE',
      'SLATE', 'SOLAR ORANGE', 'SOLSTICE PURPLE', 'SUNSET', 'WHITE LOTUS'
    ]
    for (const color of colors) {
      if (upperName.includes(color)) {
        // Map back to proper name
        const colorNameMap: { [key: string]: string } = {
          'CANYON SKY': 'Canyon Sky',
          'DRAGON FRUIT FUCHSIA': 'Dragon Fruit Fuchsia',
          'PARADISE BLUE': 'Paradise Blue',
          'THE DEEP': 'The Deep (Navy)',
          'NAVY': 'The Deep (Navy)',
          'CHAMPAGNE': 'Champagne',
          'CORAL': 'Coral',
          'DAY BREAK': 'Day Break',
          'ENCHANTED EVERGREEN': 'Enchanted Evergreen',
          'FOREVER GREEN': 'Forever Green',
          'GREAT WHITE': 'Great White',
          'KRAKEN': 'Kraken',
          'LAST LIGHT': 'Last Light',
          'LIMON': 'Limon',
          'PARTY RED': 'Party Red',
          'SAND CASTLE': 'Sand Castle',
          'SLATE': 'Slate',
          'SOLAR ORANGE': 'Solar Orange',
          'SOLSTICE PURPLE': 'Solstice Purple',
          'SUNSET': 'Sunset',
          'WHITE LOTUS': 'White Lotus',
        }
        return colorNameMap[color] || color
      }
    }
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
 * - Order has exactly 1 item, OR
 * - Order has 2 items but one is shipping insurance
 */
export function isSingleItemOrder(items: any[]): boolean {
  if (!items || items.length === 0) return false
  
  // Filter out shipping insurance items
  const nonInsuranceItems = items.filter(
    (item) => !isShippingInsurance(item.sku || '', item.name || '')
  )
  
  return nonInsuranceItems.length === 1
}

