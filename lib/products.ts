import type { PrismaClient } from '@prisma/client'

// ============================================================================
// Types (matching Prisma schema)
// ============================================================================

export interface ProductSize {
  id: string
  name: string
  lengthInches: number
  widthInches: number
  heightInches: number
  weightLbs: number
  category: string
  active: boolean
  singleBoxId?: string | null  // Links to dedicated box for single-item orders
  volume?: number // Calculated: L × W × H
}

export interface ProductSku {
  sku: string
  productSizeId: string
  name: string | null
  barcode: string | null
  active: boolean
}

export interface ProductSkuPattern {
  id: number
  productSizeId: string
  pattern: string
}

// For backward compatibility with box-config
export type Product = ProductSize

// Response types for API
export interface ProductsConfig {
  sizes: ProductSize[]
  skus: ProductSku[]
  patterns: ProductSkuPattern[]
}

// ============================================================================
// Helper Functions
// ============================================================================

/** Calculate volume from dimensions */
export function calculateVolume(length: number, width: number, height: number): number {
  return length * width * height
}

/** Prisma ProductSize type (without calculated volume) */
type PrismaProductSize = Omit<ProductSize, 'volume'> & { createdAt?: Date; updatedAt?: Date }

/** Add volume to a ProductSize from Prisma */
function addVolumeToSize(size: PrismaProductSize): ProductSize {
  const { createdAt, updatedAt, ...rest } = size as PrismaProductSize & { createdAt?: Date; updatedAt?: Date }
  return {
    ...rest,
    volume: calculateVolume(size.lengthInches, size.widthInches, size.heightInches),
  }
}

// ============================================================================
// Read Functions
// ============================================================================

/** Get all product sizes with calculated volume */
export async function getProductSizes(prisma: PrismaClient): Promise<ProductSize[]> {
  const sizes = await prisma.productSize.findMany({
    orderBy: { name: 'asc' },
  })
  return sizes.map(addVolumeToSize)
}

/** Get active product sizes only */
export async function getActiveProductSizes(prisma: PrismaClient): Promise<ProductSize[]> {
  const sizes = await prisma.productSize.findMany({
    where: { active: true },
    orderBy: { name: 'asc' },
  })
  return sizes.map(addVolumeToSize)
}

/** Get all SKUs */
export async function getProductSkus(prisma: PrismaClient): Promise<ProductSku[]> {
  return prisma.productSku.findMany({
    orderBy: { sku: 'asc' },
  })
}

/** Get SKUs for a specific size */
export async function getSkusForSize(prisma: PrismaClient, sizeId: string): Promise<ProductSku[]> {
  return prisma.productSku.findMany({
    where: { productSizeId: sizeId },
    orderBy: { sku: 'asc' },
  })
}

/** Get all SKU patterns */
export async function getProductSkuPatterns(prisma: PrismaClient): Promise<ProductSkuPattern[]> {
  return prisma.productSkuPattern.findMany({
    orderBy: { productSizeId: 'asc' },
  })
}

/** Get full products config (sizes + skus + patterns) */
export async function getProductsConfig(prisma: PrismaClient): Promise<ProductsConfig> {
  const [sizes, skus, patterns] = await Promise.all([
    getProductSizes(prisma),
    getProductSkus(prisma),
    getProductSkuPatterns(prisma),
  ])
  return { sizes, skus, patterns }
}

// Backward compatibility alias
export async function getProducts(prisma: PrismaClient): Promise<Product[]> {
  return getActiveProductSizes(prisma)
}

// ============================================================================
// SKU Lookup Functions
// ============================================================================

/**
 * Look up a SKU to find its ProductSize.
 * Priority:
 *   1. Exact SKU match in product_skus table -> return linked ProductSize
 *   2. Fallback: regex pattern match in product_sku_patterns
 */
export async function matchSkuToSize(
  prisma: PrismaClient,
  sku: string
): Promise<ProductSize | null> {
  if (!sku) return null
  const upperSku = sku.toUpperCase()

  // LAYER 1: Exact SKU match
  const skuRecord = await prisma.productSku.findUnique({
    where: { sku: upperSku },
    include: { productSize: true },
  })

  if (skuRecord?.active && skuRecord.productSize?.active) {
    return addVolumeToSize(skuRecord.productSize)
  }

  // Also try original case
  const skuRecordOriginal = await prisma.productSku.findUnique({
    where: { sku },
    include: { productSize: true },
  })

  if (skuRecordOriginal?.active && skuRecordOriginal.productSize?.active) {
    return addVolumeToSize(skuRecordOriginal.productSize)
  }

  // LAYER 2: Fallback regex patterns
  const patterns = await prisma.productSkuPattern.findMany({
    include: { productSize: true },
  })

  for (const patternRecord of patterns) {
    if (!patternRecord.productSize?.active) continue
    try {
      const regex = new RegExp(patternRecord.pattern, 'i')
      if (regex.test(sku)) {
        return addVolumeToSize(patternRecord.productSize)
      }
    } catch {
      // Invalid regex, skip
      continue
    }
  }

  return null
}

/**
 * Backward-compatible wrapper that takes products array.
 * Uses in-memory matching (for box-config integration).
 */
export function matchSkuToProduct(
  sku: string,
  products: Product[],
  patterns?: ProductSkuPattern[]
): Product | null {
  if (!sku) return null

  // If we have patterns, use them for regex matching
  if (patterns) {
    for (const patternRecord of patterns) {
      const product = products.find(p => p.id === patternRecord.productSizeId)
      if (!product?.active) continue
      try {
        const regex = new RegExp(patternRecord.pattern, 'i')
        if (regex.test(sku)) {
          return product
        }
      } catch {
        continue
      }
    }
  }

  return null
}

// ============================================================================
// Size CRUD Functions
// ============================================================================

export async function addProductSize(
  prisma: PrismaClient,
  data: {
    id?: string
    name: string
    lengthInches: number
    widthInches: number
    heightInches: number
    weightLbs?: number
    category?: string
    active?: boolean
    singleBoxId?: string | null
  }
): Promise<ProductSize> {
  const id = data.id || data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

  const size = await prisma.productSize.create({
    data: {
      id,
      name: data.name,
      lengthInches: data.lengthInches,
      widthInches: data.widthInches,
      heightInches: data.heightInches,
      weightLbs: data.weightLbs ?? 0,
      category: data.category ?? 'other',
      active: data.active ?? true,
      singleBoxId: data.singleBoxId ?? null,
    },
  })

  return addVolumeToSize(size)
}

export async function updateProductSize(
  prisma: PrismaClient,
  id: string,
  data: Partial<{
    name: string
    lengthInches: number
    widthInches: number
    heightInches: number
    weightLbs: number
    category: string
    active: boolean
    singleBoxId: string | null
  }>
): Promise<ProductSize> {
  const size = await prisma.productSize.update({
    where: { id },
    data,
  })
  return addVolumeToSize(size)
}

export async function deleteProductSize(
  prisma: PrismaClient,
  id: string
): Promise<{ deleted: boolean; orphanedSkus: number; orphanedPatterns: number }> {
  // Count related records before deletion (cascade will remove them)
  const [skuCount, patternCount] = await Promise.all([
    prisma.productSku.count({ where: { productSizeId: id } }),
    prisma.productSkuPattern.count({ where: { productSizeId: id } }),
  ])

  try {
    await prisma.productSize.delete({ where: { id } })
    return { deleted: true, orphanedSkus: skuCount, orphanedPatterns: patternCount }
  } catch {
    return { deleted: false, orphanedSkus: 0, orphanedPatterns: 0 }
  }
}

// ============================================================================
// SKU CRUD Functions
// ============================================================================

export async function addProductSku(
  prisma: PrismaClient,
  data: {
    sku: string
    productSizeId: string
    name?: string
    barcode?: string
    active?: boolean
  }
): Promise<ProductSku> {
  return prisma.productSku.create({
    data: {
      sku: data.sku,
      productSizeId: data.productSizeId,
      name: data.name ?? null,
      barcode: data.barcode ?? null,
      active: data.active ?? true,
    },
  })
}

export async function updateProductSku(
  prisma: PrismaClient,
  sku: string,
  data: Partial<{
    sku: string
    productSizeId: string
    name: string | null
    barcode: string | null
    active: boolean
  }>
): Promise<ProductSku> {
  // If changing SKU, we need to delete and recreate
  if (data.sku && data.sku !== sku) {
    const existing = await prisma.productSku.findUnique({ where: { sku } })
    if (!existing) throw new Error(`SKU "${sku}" not found`)

    await prisma.productSku.delete({ where: { sku } })
    return prisma.productSku.create({
      data: {
        sku: data.sku,
        productSizeId: data.productSizeId ?? existing.productSizeId,
        name: data.name !== undefined ? data.name : existing.name,
        barcode: data.barcode !== undefined ? data.barcode : existing.barcode,
        active: data.active !== undefined ? data.active : existing.active,
      },
    })
  }

  return prisma.productSku.update({
    where: { sku },
    data,
  })
}

export async function deleteProductSku(
  prisma: PrismaClient,
  sku: string
): Promise<boolean> {
  try {
    await prisma.productSku.delete({ where: { sku } })
    return true
  } catch {
    return false
  }
}

// ============================================================================
// SKU Pattern CRUD Functions
// ============================================================================

export async function addProductSkuPattern(
  prisma: PrismaClient,
  data: {
    productSizeId: string
    pattern: string
  }
): Promise<ProductSkuPattern> {
  return prisma.productSkuPattern.create({
    data: {
      productSizeId: data.productSizeId,
      pattern: data.pattern,
    },
  })
}

export async function deleteProductSkuPattern(
  prisma: PrismaClient,
  id: number
): Promise<boolean> {
  try {
    await prisma.productSkuPattern.delete({ where: { id } })
    return true
  } catch {
    return false
  }
}

// ============================================================================
// Bulk Operations
// ============================================================================

export async function addPatternsToSize(
  prisma: PrismaClient,
  sizeId: string,
  patterns: string[]
): Promise<ProductSkuPattern[]> {
  const created = await prisma.productSkuPattern.createMany({
    data: patterns.map(pattern => ({
      productSizeId: sizeId,
      pattern,
    })),
  })

  // Return the created patterns
  return prisma.productSkuPattern.findMany({
    where: { productSizeId: sizeId },
    orderBy: { id: 'desc' },
    take: created.count,
  })
}

export async function replacePatternsForSize(
  prisma: PrismaClient,
  sizeId: string,
  patterns: string[]
): Promise<ProductSkuPattern[]> {
  // Delete existing patterns
  await prisma.productSkuPattern.deleteMany({
    where: { productSizeId: sizeId },
  })

  // Add new ones
  if (patterns.length === 0) return []

  await prisma.productSkuPattern.createMany({
    data: patterns.map(pattern => ({
      productSizeId: sizeId,
      pattern,
    })),
  })

  return prisma.productSkuPattern.findMany({
    where: { productSizeId: sizeId },
  })
}

// ============================================================================
// Unmatched SKU Tracking
// ============================================================================

export interface UnmatchedSku {
  sku: string
  firstSeen: Date | string
  lastSeen: Date | string
  occurrences: number
  exampleOrder: string | null
  itemName: string | null
  dismissed: boolean
}

/**
 * Record unmatched SKUs during order ingestion.
 * Uses upsert to increment occurrences if SKU already exists.
 */
export async function recordUnmatchedSkus(
  prisma: PrismaClient,
  skus: Array<{ sku: string; orderNumber: string; itemName: string | null }>
): Promise<void> {
  if (skus.length === 0) return

  // Deduplicate by SKU within the batch
  const uniqueSkus = new Map<string, { sku: string; orderNumber: string; itemName: string | null }>()
  for (const s of skus) {
    const upperSku = s.sku.toUpperCase()
    if (upperSku && !uniqueSkus.has(upperSku)) {
      uniqueSkus.set(upperSku, { ...s, sku: upperSku })
    }
  }

  // Batch upsert - increment occurrences if exists
  await prisma.$transaction(
    Array.from(uniqueSkus.values()).map(({ sku, orderNumber, itemName }) =>
      prisma.unmatchedSku.upsert({
        where: { sku },
        create: { sku, exampleOrder: orderNumber, itemName, occurrences: 1 },
        update: {
          occurrences: { increment: 1 },
          lastSeen: new Date(),
          exampleOrder: orderNumber,
        },
      })
    )
  )
}

/**
 * Get all unmatched SKUs that haven't been dismissed.
 */
export async function getUnmatchedSkus(prisma: PrismaClient): Promise<UnmatchedSku[]> {
  return prisma.unmatchedSku.findMany({
    where: { dismissed: false },
    orderBy: { occurrences: 'desc' },
  })
}

/**
 * Dismiss an unmatched SKU (hide it from the list).
 */
export async function dismissUnmatchedSku(prisma: PrismaClient, sku: string): Promise<void> {
  await prisma.unmatchedSku.update({
    where: { sku },
    data: { dismissed: true },
  })
}

/**
 * Remove an unmatched SKU from the table (e.g., after it's been added as a product SKU).
 */
export async function removeUnmatchedSku(prisma: PrismaClient, sku: string): Promise<void> {
  try {
    await prisma.unmatchedSku.delete({ where: { sku } })
  } catch {
    // SKU might not exist in unmatched table, ignore
  }
}
