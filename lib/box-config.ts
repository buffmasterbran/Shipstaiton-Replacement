import type { PrismaClient } from '@prisma/client'
import type { ProductSize } from './products'

// ============================================================================
// Types (matching Prisma schema)
// ============================================================================

export interface Box {
  id: string
  name: string
  lengthInches: number
  widthInches: number
  heightInches: number
  weightLbs: number // Box weight in pounds (for shipping calculations)
  volume: number // Calculated: L × W × H
  priority: number
  active: boolean
  inStock: boolean
  singleCupOnly: boolean // If true, only use for single-cup orders (no multi-cup, no accessories)
}

export interface BoxFeedbackRule {
  id: string
  comboSignature: string
  boxId: string
  fits: boolean
  correctBoxId: string | null
  testedAt: Date
  testedBy: string | null
}

export interface BoxMatchResult {
  box: Box | null
  confidence: 'confirmed' | 'calculated' | 'unknown'
  fitRatio?: number
  orderVolume?: number
}

// For backward compatibility
export type Product = ProductSize

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_PACKING_EFFICIENCY = 1.0  // 100% - box dimensions are internal measurements

// ============================================================================
// Helper Functions
// ============================================================================

/** Calculate volume from dimensions */
export function calculateBoxVolume(length: number, width: number, height: number): number {
  return length * width * height
}

/** Add volume to a Box from Prisma */
function addVolumeToBox(box: any): Box {
  const { createdAt, updatedAt, ...rest } = box
  return {
    ...rest,
    weightLbs: box.weightLbs ?? 0,
    volume: calculateBoxVolume(box.lengthInches, box.widthInches, box.heightInches),
    singleCupOnly: box.singleCupOnly ?? false,
  }
}

/** Build normalized signature for an order (for feedback lookup) */
export function buildComboSignature(items: { productId: string; quantity: number }[]): string {
  // Aggregate items with the same productId first
  // This handles cases where an order has multiple line items (different SKUs)
  // that map to the same ProductSize (e.g., DPT16PWL + DPT16PYN both = 16oz tumbler)
  const aggregated = new Map<string, number>()
  for (const item of items) {
    if (item.quantity > 0) {
      aggregated.set(item.productId, (aggregated.get(item.productId) || 0) + item.quantity)
    }
  }

  return Array.from(aggregated.entries())
    .map(([productId, quantity]) => `${productId}:${quantity}`)
    .sort()
    .join('|')
}

/** Calculate total product volume for an order */
export function calculateOrderVolume(
  items: { productId: string; quantity: number }[],
  products: ProductSize[]
): number {
  let total = 0
  for (const item of items) {
    const product = products.find(p => p.id === item.productId)
    if (product?.volume) {
      total += product.volume * item.quantity
    }
  }
  return total
}

// ============================================================================
// Order Classification (for single-cup box logic)
// ============================================================================

export interface OrderClassification {
  cupCount: number        // Total quantity of tumblers/bottles
  hasAccessories: boolean // Has non-sticker accessories (lids, etc.)
  stickerOnly: boolean    // Order contains only stickers
  accessoryOnly: boolean  // Order contains only accessories (no cups)
}

/**
 * Classify order items to determine if single-cup boxes are eligible.
 * - Cups = tumbler or bottle categories
 * - Stickers = SKU starts with PL-STCK (ignored for box fitting)
 * - Accessories = everything else (lids, straws, etc.)
 */
export function classifyOrderItems(
  items: { productId: string; quantity: number; sku?: string }[],
  products: ProductSize[]
): OrderClassification {
  let cupCount = 0
  let hasAccessories = false
  let hasCups = false
  let hasNonSticker = false

  for (const item of items) {
    const product = products.find(p => p.id === item.productId)
    if (!product) continue

    // Check if it's a sticker by SKU pattern (PL-STCK*)
    // Stickers are ignored for box fitting - they fit with anything
    const sku = item.sku?.toUpperCase() || ''
    if (sku.startsWith('PL-STCK')) {
      continue // Skip stickers - they don't affect box selection
    }

    const category = product.category.toLowerCase()

    if (category === 'tumbler' || category === 'bottle') {
      cupCount += item.quantity
      hasCups = true
      hasNonSticker = true
    } else if (category === 'accessory' || category === 'other') {
      hasAccessories = true
      hasNonSticker = true
    }
  }

  return {
    cupCount,
    hasAccessories,
    stickerOnly: !hasNonSticker,
    accessoryOnly: !hasCups && hasAccessories,
  }
}

/** Check if order fits in box (volume-based) */
export function calculateFitRatio(
  orderVolume: number,
  box: Box,
  packingEfficiency: number = DEFAULT_PACKING_EFFICIENCY
): number {
  const usableVolume = box.volume * packingEfficiency
  if (usableVolume === 0) return Infinity
  return orderVolume / usableVolume
}

// ============================================================================
// Read Functions
// ============================================================================

/** Get all boxes with calculated volume */
export async function getBoxes(prisma: PrismaClient): Promise<Box[]> {
  const boxes = await prisma.box.findMany({
    orderBy: { priority: 'asc' },
  })
  return boxes.map(addVolumeToBox)
}

/** Get active, in-stock boxes only */
export async function getActiveBoxes(prisma: PrismaClient): Promise<Box[]> {
  const boxes = await prisma.box.findMany({
    where: { active: true, inStock: true },
    orderBy: { priority: 'asc' },
  })
  return boxes.map(addVolumeToBox)
}

/** Get all feedback rules */
export async function getFeedbackRules(prisma: PrismaClient): Promise<BoxFeedbackRule[]> {
  return prisma.boxFeedbackRule.findMany({
    orderBy: { testedAt: 'desc' },
  })
}

/** Get packing efficiency from app settings (or default) */
export async function getPackingEfficiency(prisma: PrismaClient): Promise<number> {
  try {
    const setting = await prisma.appSetting.findUnique({
      where: { key: 'packing_efficiency' },
    })
    if (setting?.value && typeof setting.value === 'number') {
      return setting.value
    }
  } catch {
    // Ignore errors
  }
  return DEFAULT_PACKING_EFFICIENCY
}

/** Set packing efficiency in app settings */
export async function setPackingEfficiency(prisma: PrismaClient, value: number): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key: 'packing_efficiency' },
    create: { key: 'packing_efficiency', value },
    update: { value },
  })
}

// ============================================================================
// Box Fitting Logic
// ============================================================================

/** Check feedback rules for this combo + box */
export function checkFeedback(
  signature: string,
  boxId: string,
  feedbackRules: BoxFeedbackRule[]
): { hasFeedback: boolean; fits?: boolean; correctBoxId?: string | null } {
  const rule = feedbackRules.find(
    r => r.comboSignature === signature && r.boxId === boxId
  )
  if (rule) {
    return { hasFeedback: true, fits: rule.fits, correctBoxId: rule.correctBoxId }
  }
  return { hasFeedback: false }
}

/** Find best box for an order */
export function findBestBox(
  items: { productId: string; quantity: number; sku?: string }[],
  products: ProductSize[],
  boxes: Box[],
  feedbackRules: BoxFeedbackRule[],
  packingEfficiency: number = DEFAULT_PACKING_EFFICIENCY
): BoxMatchResult {
  const signature = buildComboSignature(items)
  const orderVolume = calculateOrderVolume(items, products)

  // Classify order to determine single-cup box eligibility
  const classification = classifyOrderItems(items, products)

  // Sort boxes by priority (smaller/preferred first)
  // Filter out boxes that don't match the order type
  const eligibleBoxes = boxes
    .filter(b => {
      if (!b.active || !b.inStock) return false

      // Single-cup boxes: only for exactly 1 cup with no accessories
      if (b.singleCupOnly) {
        // Must have exactly 1 cup (quantity = 1)
        if (classification.cupCount !== 1) return false
        // Must not have accessories (lids, straws, etc.)
        if (classification.hasAccessories) return false
      }

      return true
    })
    .sort((a, b) => a.priority - b.priority)

  for (const box of eligibleBoxes) {
    // LAYER 1: Check feedback rules first (human override)
    const feedback = checkFeedback(signature, box.id, feedbackRules)

    if (feedback.hasFeedback) {
      if (feedback.fits) {
        return { box, confidence: 'confirmed', orderVolume }
      } else {
        // Human said doesn't fit, try next box
        continue
      }
    }

    // LAYER 2: Fall back to volume calculation
    const fitRatio = calculateFitRatio(orderVolume, box, packingEfficiency)
    if (fitRatio <= 1.0) {
      return { box, confidence: 'calculated', fitRatio, orderVolume }
    }
  }

  return { box: null, confidence: 'unknown', orderVolume }
}

/** Find best box using database queries (convenience wrapper) */
export async function findBestBoxForOrder(
  prisma: PrismaClient,
  items: { productId: string; quantity: number }[],
  products: ProductSize[]
): Promise<BoxMatchResult> {
  const [boxes, feedbackRules, packingEfficiency] = await Promise.all([
    getActiveBoxes(prisma),
    getFeedbackRules(prisma),
    getPackingEfficiency(prisma),
  ])

  return findBestBox(items, products, boxes, feedbackRules, packingEfficiency)
}

// ============================================================================
// Box CRUD Functions
// ============================================================================

export async function addBox(
  prisma: PrismaClient,
  data: {
    id?: string
    name: string
    lengthInches: number
    widthInches: number
    heightInches: number
    weightLbs?: number
    priority?: number
    active?: boolean
    inStock?: boolean
    singleCupOnly?: boolean
  }
): Promise<Box> {
  const id = data.id || data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

  // Get max priority if not provided
  let priority = data.priority
  if (priority === undefined) {
    const maxPriority = await prisma.box.aggregate({
      _max: { priority: true },
    })
    priority = (maxPriority._max.priority ?? 0) + 1
  }

  const box = await prisma.box.create({
    data: {
      id,
      name: data.name,
      lengthInches: data.lengthInches,
      widthInches: data.widthInches,
      heightInches: data.heightInches,
      weightLbs: data.weightLbs ?? 0,
      priority,
      active: data.active ?? true,
      inStock: data.inStock ?? true,
      singleCupOnly: data.singleCupOnly ?? false,
    } as any,
  })

  return addVolumeToBox(box)
}

export async function updateBox(
  prisma: PrismaClient,
  id: string,
  data: Partial<{
    name: string
    lengthInches: number
    widthInches: number
    heightInches: number
    weightLbs: number
    priority: number
    active: boolean
    inStock: boolean
    singleCupOnly: boolean
  }>
): Promise<Box> {
  const box = await prisma.box.update({
    where: { id },
    data,
  })
  return addVolumeToBox(box)
}

export async function deleteBox(
  prisma: PrismaClient,
  id: string
): Promise<{ deleted: boolean; feedbackRulesRemoved: number }> {
  // Count feedback rules that will be cascade deleted
  const feedbackCount = await prisma.boxFeedbackRule.count({
    where: { boxId: id },
  })

  try {
    await prisma.box.delete({ where: { id } })
    return { deleted: true, feedbackRulesRemoved: feedbackCount }
  } catch {
    return { deleted: false, feedbackRulesRemoved: 0 }
  }
}

// ============================================================================
// Feedback Rule CRUD Functions
// ============================================================================

export async function addFeedbackRule(
  prisma: PrismaClient,
  data: {
    comboSignature: string
    boxId: string
    fits: boolean
    correctBoxId?: string
    testedBy?: string
  }
): Promise<BoxFeedbackRule> {
  // Upsert - replace existing rule for this combo + box
  return prisma.boxFeedbackRule.upsert({
    where: {
      comboSignature_boxId: {
        comboSignature: data.comboSignature,
        boxId: data.boxId,
      },
    },
    create: {
      comboSignature: data.comboSignature,
      boxId: data.boxId,
      fits: data.fits,
      correctBoxId: data.fits ? null : data.correctBoxId ?? null,
      testedBy: data.testedBy ?? null,
    },
    update: {
      fits: data.fits,
      correctBoxId: data.fits ? null : data.correctBoxId ?? null,
      testedAt: new Date(),
      testedBy: data.testedBy ?? null,
    },
  })
}

export async function deleteFeedbackRule(
  prisma: PrismaClient,
  id: string
): Promise<boolean> {
  try {
    await prisma.boxFeedbackRule.delete({ where: { id } })
    return true
  } catch {
    return false
  }
}

export async function clearFeedbackRulesForBox(
  prisma: PrismaClient,
  boxId: string
): Promise<number> {
  const result = await prisma.boxFeedbackRule.deleteMany({
    where: { boxId },
  })
  return result.count
}

// ============================================================================
// Config Response (for API compatibility)
// ============================================================================

export interface BoxConfig {
  boxes: Box[]
  feedbackRules: BoxFeedbackRule[]
  packingEfficiency: number
}

export async function getBoxConfig(prisma: PrismaClient): Promise<BoxConfig> {
  const [boxes, feedbackRules, packingEfficiency] = await Promise.all([
    getBoxes(prisma),
    getFeedbackRules(prisma),
    getPackingEfficiency(prisma),
  ])

  return { boxes, feedbackRules, packingEfficiency }
}
