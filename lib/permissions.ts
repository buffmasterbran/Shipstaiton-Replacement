// ============================================================================
// Page Permission Registry
//
// Central definition of all permissionable pages. Imported by middleware,
// sidebar, and admin UI so everything stays in sync.
// ============================================================================

export interface PageDefinition {
  key: string
  label: string
  path: string
  section: 'Operations' | 'Warehouse' | 'Reports'
}

/**
 * All permissionable pages in the app.
 * Settings pages are NOT listed here — they are always admin-only.
 */
export const ALL_PAGES: PageDefinition[] = [
  // Operations
  { key: 'dashboard',            label: 'Dashboard',            path: '/dashboard',            section: 'Operations' },
  { key: 'all-orders',           label: 'All Orders',           path: '/',                     section: 'Operations' },
  { key: 'expedited',            label: 'Expedited Orders',     path: '/expedited',            section: 'Operations' },
  { key: 'errors',               label: 'Error Orders',         path: '/errors',               section: 'Operations' },
  { key: 'hold',                 label: 'Orders on Hold',       path: '/hold',                 section: 'Operations' },
  { key: 'singles',              label: 'Singles',              path: '/singles',              section: 'Operations' },
  { key: 'bulk',                 label: 'Bulk Orders',          path: '/bulk',                 section: 'Operations' },
  { key: 'box-size',             label: 'Orders by Size',       path: '/box-size',             section: 'Operations' },
  { key: 'personalized-orders',  label: 'Personalized Orders',  path: '/personalized-orders',  section: 'Operations' },
  { key: 'international',        label: 'International Orders', path: '/international',        section: 'Operations' },
  { key: 'batch-queue',          label: 'Batch Queue',          path: '/batch-queue',          section: 'Operations' },

  // Warehouse
  { key: 'pick',                 label: 'Picker',               path: '/pick',                 section: 'Warehouse' },
  { key: 'personalization',      label: 'Engraving Station',    path: '/personalization',      section: 'Warehouse' },
  { key: 'cart-scan',            label: 'Cart Scan',            path: '/cart-scan',            section: 'Warehouse' },
  { key: 'scan-to-verify',       label: 'Scan to Verify',       path: '/scan-to-verify',       section: 'Warehouse' },
  { key: 'local-pickup',         label: 'Local Pickup Orders',  path: '/local-pickup',         section: 'Warehouse' },
  { key: 'returns',              label: 'Receive Returns',      path: '/returns',              section: 'Warehouse' },
  { key: 'inventory-count',      label: 'Inventory Count',      path: '/inventory-count',      section: 'Warehouse' },

  // Reports
  { key: 'analytics',            label: 'Analytics',            path: '/analytics',            section: 'Reports' },
]

/** Lookup: URL path -> page key */
const pathToKeyMap = new Map<string, string>()
/** Lookup: page key -> page definition */
const keyToPageMap = new Map<string, PageDefinition>()

for (const page of ALL_PAGES) {
  pathToKeyMap.set(page.path, page.key)
  keyToPageMap.set(page.key, page)
}

/**
 * Convert a URL pathname to a page key.
 * Returns null if the path doesn't map to any permissionable page
 * (e.g., /settings/*, /login, /api/*).
 */
export function pathToPageKey(pathname: string): string | null {
  return pathToKeyMap.get(pathname) ?? null
}

/**
 * Get the full page definition for a page key.
 */
export function getPageDefinition(key: string): PageDefinition | undefined {
  return keyToPageMap.get(key)
}

/**
 * Get the URL path for a page key.
 */
export function pageKeyToPath(key: string): string {
  return keyToPageMap.get(key)?.path ?? '/pick'
}

/**
 * Get all page definitions grouped by section.
 */
export function getPagesBySection(): Record<string, PageDefinition[]> {
  const grouped: Record<string, PageDefinition[]> = {}
  for (const page of ALL_PAGES) {
    if (!grouped[page.section]) grouped[page.section] = []
    grouped[page.section].push(page)
  }
  return grouped
}

/**
 * Get all valid page keys (for validation).
 */
export function getAllPageKeys(): string[] {
  return ALL_PAGES.map((p) => p.key)
}
