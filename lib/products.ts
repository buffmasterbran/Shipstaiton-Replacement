import type { PrismaClient } from '@prisma/client'

// ============================================================================
// Types
// ============================================================================

export interface ProductDimensions {
  length: number  // inches
  width: number   // inches
  height: number  // inches
}

/**
 * ProductSize: Physical attributes used for box fitting calculations.
 * IDs remain stable (e.g., "tumbler-16oz") for backward compatibility
 * with existing feedback rules in box-config.
 */
export interface ProductSize {
  id: string                    // e.g., "tumbler-16oz" - stable for box fitting
  name: string                  // e.g., "16oz Tumbler"
  dimensions: ProductDimensions
  volume: number                // Auto-calculated: L × W × H (in³)
  weight: number                // lbs
  category: 'tumbler' | 'bottle' | 'accessory' | 'other'
  active: boolean
  fallbackSkuPatterns: string[] // Regex patterns for backward compat
}

/**
 * ProductSku: Individual variant with unique SKU/barcode.
 * Links to a ProductSize for physical dimensions.
 */
export interface ProductSku {
  sku: string                   // Primary key, e.g., "DPT16-RED"
  sizeId: string                // References ProductSize.id
  name?: string                 // Optional display name, e.g., "16oz Tumbler - Red"
  barcode?: string              // UPC/EAN for this specific variant
  active: boolean
}

/**
 * Combined config stored in appSetting JSON
 */
export interface ProductsConfig {
  sizes: ProductSize[]
  skus: ProductSku[]
  version: string               // "2.0.0" for new structure
}

/**
 * Backward compatibility alias for box fitting code.
 * Box fitting only needs: id, volume, name, category
 */
export type Product = ProductSize

// Old v1 Product type for migration
interface OldProduct {
  id: string
  name: string
  skuPatterns: string[]
  dimensions: ProductDimensions
  volume: number
  weight: number
  barcode?: string
  category: 'tumbler' | 'bottle' | 'accessory' | 'other'
  active: boolean
}

// ============================================================================
// Constants
// ============================================================================

const PRODUCTS_KEY = 'products'

const DEFAULT_SIZES: ProductSize[] = [
  {
    id: 'tumbler-10oz',
    name: '10oz Tumbler',
    fallbackSkuPatterns: ['^DPT10', '^PT10'],
    dimensions: { length: 3, width: 3, height: 5 },
    volume: 45,
    weight: 0.4,
    category: 'tumbler',
    active: true,
  },
  {
    id: 'tumbler-16oz',
    name: '16oz Tumbler',
    fallbackSkuPatterns: ['^DPT16', '^PT16'],
    dimensions: { length: 3.5, width: 3.5, height: 6 },
    volume: 73.5,
    weight: 0.6,
    category: 'tumbler',
    active: true,
  },
  {
    id: 'tumbler-26oz',
    name: '26oz Tumbler',
    fallbackSkuPatterns: ['^DPT26', '^PT26'],
    dimensions: { length: 4, width: 4, height: 8 },
    volume: 128,
    weight: 0.9,
    category: 'tumbler',
    active: true,
  },
  {
    id: 'tumbler-32oz',
    name: '32oz Tumbler',
    fallbackSkuPatterns: ['^DPT32', '^PT32'],
    dimensions: { length: 4.5, width: 4.5, height: 9 },
    volume: 182.25,
    weight: 1.1,
    category: 'tumbler',
    active: true,
  },
]

const DEFAULT_CONFIG: ProductsConfig = {
  sizes: DEFAULT_SIZES,
  skus: [],
  version: '2.0.0',
}

// ============================================================================
// Helper Functions
// ============================================================================

/** Calculate volume from dimensions */
export function calculateVolume(dims: ProductDimensions): number {
  return dims.length * dims.width * dims.height
}

/** Generate a URL-safe ID from a name */
export function generateProductId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

// ============================================================================
// SKU Lookup Functions
// ============================================================================

/**
 * Look up a SKU to find its ProductSize.
 * Priority:
 *   1. Exact SKU match in skus table -> return linked ProductSize
 *   2. Fallback: regex pattern match in sizes.fallbackSkuPatterns
 */
export function matchSkuToSize(
  sku: string,
  config: ProductsConfig
): ProductSize | null {
  if (!sku) return null
  const upperSku = sku.toUpperCase()

  // LAYER 1: Exact SKU match
  const skuEntry = config.skus.find(
    s => s.active && s.sku.toUpperCase() === upperSku
  )
  if (skuEntry) {
    const size = config.sizes.find(sz => sz.id === skuEntry.sizeId)
    if (size?.active) return size
  }

  // LAYER 2: Fallback regex patterns (backward compatibility)
  for (const size of config.sizes) {
    if (!size.active) continue
    for (const pattern of size.fallbackSkuPatterns) {
      try {
        const regex = new RegExp(pattern, 'i')
        if (regex.test(upperSku)) {
          return size
        }
      } catch {
        continue
      }
    }
  }

  return null
}

/**
 * Backward-compatible wrapper for existing code.
 * @deprecated Use matchSkuToSize with full config instead
 */
export function matchSkuToProduct(sku: string, products: Product[]): Product | null {
  return matchSkuToSize(sku, { sizes: products, skus: [], version: '2.0.0' })
}

// ============================================================================
// Migration Functions
// ============================================================================

function migrateV1ToV2(oldProducts: OldProduct[]): ProductsConfig {
  const sizes: ProductSize[] = oldProducts.map(p => ({
    id: p.id,
    name: p.name,
    dimensions: p.dimensions,
    volume: p.volume,
    weight: p.weight,
    category: p.category,
    active: p.active,
    fallbackSkuPatterns: p.skuPatterns || [],
  }))

  // No SKUs in v1 - start with empty array
  return { sizes, skus: [], version: '2.0.0' }
}

// ============================================================================
// Database Functions
// ============================================================================

export function getDefaultProductsConfig(): ProductsConfig {
  return { ...DEFAULT_CONFIG, sizes: [...DEFAULT_CONFIG.sizes], skus: [] }
}

export async function getProductsConfig(prisma: PrismaClient): Promise<ProductsConfig> {
  try {
    const row = await prisma.appSetting.findUnique({
      where: { key: PRODUCTS_KEY },
    })

    if (!row?.value || typeof row.value !== 'object') {
      return getDefaultProductsConfig()
    }

    const v = row.value as Record<string, unknown>

    // Check if already v2 format (has sizes array)
    if (v.version === '2.0.0' || Array.isArray(v.sizes)) {
      return {
        sizes: Array.isArray(v.sizes) ? v.sizes as ProductSize[] : DEFAULT_SIZES,
        skus: Array.isArray(v.skus) ? v.skus as ProductSku[] : [],
        version: '2.0.0',
      }
    }

    // Migrate from v1 (flat products array)
    if (Array.isArray(v.products)) {
      return migrateV1ToV2(v.products as OldProduct[])
    }

    return getDefaultProductsConfig()
  } catch {
    return getDefaultProductsConfig()
  }
}

export async function setProductsConfig(
  prisma: PrismaClient,
  config: ProductsConfig
): Promise<ProductsConfig> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jsonValue = config as any
  await prisma.appSetting.upsert({
    where: { key: PRODUCTS_KEY },
    create: { key: PRODUCTS_KEY, value: jsonValue },
    update: { value: jsonValue },
  })
  return config
}

// ============================================================================
// Size CRUD Functions
// ============================================================================

export async function getSizes(prisma: PrismaClient): Promise<ProductSize[]> {
  const config = await getProductsConfig(prisma)
  return config.sizes
}

export async function addSize(
  prisma: PrismaClient,
  size: Omit<ProductSize, 'id' | 'volume'> & { id?: string }
): Promise<ProductSize> {
  const config = await getProductsConfig(prisma)

  const newSize: ProductSize = {
    ...size,
    id: size.id || generateProductId(size.name),
    volume: calculateVolume(size.dimensions),
  }

  if (config.sizes.some(s => s.id === newSize.id)) {
    throw new Error(`Size with ID "${newSize.id}" already exists`)
  }

  config.sizes.push(newSize)
  await setProductsConfig(prisma, config)
  return newSize
}

export async function updateSize(
  prisma: PrismaClient,
  id: string,
  updates: Partial<Omit<ProductSize, 'id'>>
): Promise<ProductSize> {
  const config = await getProductsConfig(prisma)
  const index = config.sizes.findIndex(s => s.id === id)

  if (index === -1) {
    throw new Error(`Size with ID "${id}" not found`)
  }

  const updated: ProductSize = { ...config.sizes[index], ...updates }
  if (updates.dimensions) {
    updated.volume = calculateVolume(updated.dimensions)
  }

  config.sizes[index] = updated
  await setProductsConfig(prisma, config)
  return updated
}

export async function deleteSize(
  prisma: PrismaClient,
  id: string
): Promise<{ deleted: boolean; orphanedSkus: string[] }> {
  const config = await getProductsConfig(prisma)
  const index = config.sizes.findIndex(s => s.id === id)

  if (index === -1) {
    return { deleted: false, orphanedSkus: [] }
  }

  // Find SKUs that reference this size
  const orphanedSkus = config.skus
    .filter(s => s.sizeId === id)
    .map(s => s.sku)

  // Remove the size
  config.sizes.splice(index, 1)

  // Also remove orphaned SKUs
  config.skus = config.skus.filter(s => s.sizeId !== id)

  await setProductsConfig(prisma, config)
  return { deleted: true, orphanedSkus }
}

// ============================================================================
// SKU CRUD Functions
// ============================================================================

export async function getSkus(prisma: PrismaClient): Promise<ProductSku[]> {
  const config = await getProductsConfig(prisma)
  return config.skus
}

export async function getSkusForSize(
  prisma: PrismaClient,
  sizeId: string
): Promise<ProductSku[]> {
  const config = await getProductsConfig(prisma)
  return config.skus.filter(s => s.sizeId === sizeId)
}

export async function addSku(
  prisma: PrismaClient,
  sku: ProductSku
): Promise<ProductSku> {
  const config = await getProductsConfig(prisma)

  // Validate size exists
  if (!config.sizes.some(s => s.id === sku.sizeId)) {
    throw new Error(`Size with ID "${sku.sizeId}" not found`)
  }

  // Check for duplicate SKU
  if (config.skus.some(s => s.sku.toUpperCase() === sku.sku.toUpperCase())) {
    throw new Error(`SKU "${sku.sku}" already exists`)
  }

  config.skus.push(sku)
  await setProductsConfig(prisma, config)
  return sku
}

export async function updateSku(
  prisma: PrismaClient,
  originalSku: string,
  updates: Partial<ProductSku>
): Promise<ProductSku> {
  const config = await getProductsConfig(prisma)
  const index = config.skus.findIndex(
    s => s.sku.toUpperCase() === originalSku.toUpperCase()
  )

  if (index === -1) {
    throw new Error(`SKU "${originalSku}" not found`)
  }

  // If changing sizeId, validate it exists
  if (updates.sizeId && !config.sizes.some(s => s.id === updates.sizeId)) {
    throw new Error(`Size with ID "${updates.sizeId}" not found`)
  }

  // If changing SKU value, check for conflicts
  if (updates.sku && updates.sku.toUpperCase() !== originalSku.toUpperCase()) {
    if (config.skus.some(s => s.sku.toUpperCase() === updates.sku!.toUpperCase())) {
      throw new Error(`SKU "${updates.sku}" already exists`)
    }
  }

  const updated: ProductSku = { ...config.skus[index], ...updates }
  config.skus[index] = updated
  await setProductsConfig(prisma, config)
  return updated
}

export async function deleteSku(
  prisma: PrismaClient,
  sku: string
): Promise<boolean> {
  const config = await getProductsConfig(prisma)
  const index = config.skus.findIndex(
    s => s.sku.toUpperCase() === sku.toUpperCase()
  )

  if (index === -1) return false

  config.skus.splice(index, 1)
  await setProductsConfig(prisma, config)
  return true
}

// ============================================================================
// Backward Compatibility Functions
// ============================================================================

/**
 * Backward-compatible: returns sizes as Product[] for box-config integration
 */
export async function getProducts(prisma: PrismaClient): Promise<Product[]> {
  const config = await getProductsConfig(prisma)
  return config.sizes
}

// Legacy function aliases for backward compatibility
export const addProduct = addSize
export const updateProduct = updateSize
