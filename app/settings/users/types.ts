// ============================================================================
// Page permission registry (mirrored from lib/permissions.ts for client use)
// ============================================================================

export interface PageDef {
  key: string
  label: string
  section: string
}

export const ALL_PAGES: PageDef[] = [
  { key: 'dashboard', label: 'Dashboard', section: 'Operations' },
  { key: 'all-orders', label: 'All Orders', section: 'Operations' },
  { key: 'expedited', label: 'Expedited Orders', section: 'Operations' },
  { key: 'errors', label: 'Error Orders', section: 'Operations' },
  { key: 'hold', label: 'Orders on Hold', section: 'Operations' },
  { key: 'singles', label: 'Singles', section: 'Operations' },
  { key: 'bulk', label: 'Bulk Orders', section: 'Operations' },
  { key: 'box-size', label: 'Orders by Size', section: 'Operations' },
  { key: 'personalized-orders', label: 'Personalized Orders', section: 'Operations' },
  { key: 'international', label: 'International Orders', section: 'Operations' },
  { key: 'batch-queue', label: 'Batch Queue', section: 'Operations' },
  { key: 'pick', label: 'Picker', section: 'Warehouse' },
  { key: 'personalization', label: 'Engraving Station', section: 'Warehouse' },
  { key: 'cart-scan', label: 'Cart Scan', section: 'Warehouse' },
  { key: 'local-pickup', label: 'Local Pickup Orders', section: 'Warehouse' },
  { key: 'returns', label: 'Receive Returns', section: 'Warehouse' },
  { key: 'inventory-count', label: 'Inventory Count', section: 'Warehouse' },
  { key: 'analytics', label: 'Analytics', section: 'Reports' },
]

export function getPagesBySection(): Record<string, PageDef[]> {
  const grouped: Record<string, PageDef[]> = {}
  for (const p of ALL_PAGES) {
    if (!grouped[p.section]) grouped[p.section] = []
    grouped[p.section].push(p)
  }
  return grouped
}

// ============================================================================
// Types
// ============================================================================

export interface PermGroup {
  id: string
  name: string
  description: string | null
  isDefault: boolean
  pageKeys: string[]
  userCount: number
}

export interface AppUser {
  id: string
  netsuiteEmpId: string | null
  name: string
  isAdmin: boolean
  groupId: string | null
  groupName: string | null
  isDefaultGroup: boolean
  lastLoginAt: string | null
  active: boolean
}
