import type { PrismaClient } from '@prisma/client'
import type { Product } from './products'

// ============================================================================
// Types
// ============================================================================

export interface BoxDimensions {
  length: number  // inches (internal)
  width: number   // inches (internal)
  height: number  // inches (internal)
}

export interface Box {
  id: string
  name: string
  internalDimensions: BoxDimensions
  volume: number      // Auto-calculated (in³)
  priority: number    // Lower = try first (prefer smaller boxes)
  active: boolean
  inStock: boolean
}

export interface FeedbackRule {
  id: string
  comboSignature: string  // Normalized: "tumbler-16oz:1|tumbler-26oz:2"
  boxId: string           // Box that was tested
  fits: boolean           // true = fits, false = doesn't fit
  correctBoxId?: string   // If doesn't fit, which box actually works?
  testedAt: string
}

export interface BoxConfig {
  boxes: Box[]
  feedbackRules: FeedbackRule[]
  packingEfficiency: number  // Default 0.7 (70%)
  version: string
}

export interface BoxMatchResult {
  box: Box | null
  confidence: 'confirmed' | 'calculated' | 'unknown'
  fitRatio?: number
  orderVolume?: number
}

// ============================================================================
// Constants
// ============================================================================

const BOX_CONFIG_KEY = 'box_config'

const DEFAULT_BOXES: Box[] = [
  {
    id: 'single',
    name: 'Single Box',
    internalDimensions: { length: 5, width: 5, height: 9 },
    volume: 225,
    priority: 1,
    active: true,
    inStock: true,
  },
  {
    id: '2-4-box',
    name: '2/4 Box',
    internalDimensions: { length: 8, width: 8, height: 9 },
    volume: 576,
    priority: 2,
    active: true,
    inStock: true,
  },
  {
    id: '4-5-box',
    name: '4/5 Box',
    internalDimensions: { length: 10, width: 10, height: 10 },
    volume: 1000,
    priority: 3,
    active: true,
    inStock: true,
  },
  {
    id: '6-10-box',
    name: '6/10 Box',
    internalDimensions: { length: 12, width: 12, height: 12 },
    volume: 1728,
    priority: 4,
    active: true,
    inStock: true,
  },
]

const DEFAULT_CONFIG: BoxConfig = {
  boxes: DEFAULT_BOXES,
  feedbackRules: [],
  packingEfficiency: 0.7,
  version: '1.0.0',
}

// ============================================================================
// Helper Functions
// ============================================================================

/** Calculate volume from dimensions */
export function calculateBoxVolume(dims: BoxDimensions): number {
  return dims.length * dims.width * dims.height
}

/** Generate a URL-safe ID from a name */
export function generateBoxId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/** Build normalized signature for an order (for feedback lookup) */
export function buildComboSignature(items: { productId: string; quantity: number }[]): string {
  return items
    .filter(i => i.quantity > 0)
    .map(i => `${i.productId}:${i.quantity}`)
    .sort()
    .join('|')
}

/** Calculate total product volume for an order */
export function calculateOrderVolume(
  items: { productId: string; quantity: number }[],
  products: Product[]
): number {
  let total = 0
  for (const item of items) {
    const product = products.find(p => p.id === item.productId)
    if (product) {
      total += product.volume * item.quantity
    }
  }
  return total
}

/** Check if order fits in box (volume-based) */
export function calculateFitRatio(
  orderVolume: number,
  box: Box,
  packingEfficiency: number
): number {
  const usableVolume = box.volume * packingEfficiency
  if (usableVolume === 0) return Infinity
  return orderVolume / usableVolume
}

/** Check feedback rules for this combo + box */
export function checkFeedback(
  signature: string,
  boxId: string,
  feedbackRules: FeedbackRule[]
): { hasFeedback: boolean; fits?: boolean; correctBoxId?: string } {
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
  items: { productId: string; quantity: number }[],
  products: Product[],
  boxConfig: BoxConfig
): BoxMatchResult {
  const signature = buildComboSignature(items)
  const orderVolume = calculateOrderVolume(items, products)

  // Sort boxes by priority (smaller/preferred first)
  const activeBoxes = boxConfig.boxes
    .filter(b => b.active && b.inStock)
    .sort((a, b) => a.priority - b.priority)

  for (const box of activeBoxes) {
    // LAYER 1: Check feedback rules first (human override)
    const feedback = checkFeedback(signature, box.id, boxConfig.feedbackRules)

    if (feedback.hasFeedback) {
      if (feedback.fits) {
        return { box, confidence: 'confirmed', orderVolume }
      } else {
        // Human said doesn't fit, try next box
        continue
      }
    }

    // LAYER 2: Fall back to volume calculation
    const fitRatio = calculateFitRatio(orderVolume, box, boxConfig.packingEfficiency)
    if (fitRatio <= 1.0) {
      return { box, confidence: 'calculated', fitRatio, orderVolume }
    }
  }

  return { box: null, confidence: 'unknown', orderVolume }
}

// ============================================================================
// Database Functions
// ============================================================================

export function getDefaultBoxConfig(): BoxConfig {
  return {
    ...DEFAULT_CONFIG,
    boxes: [...DEFAULT_CONFIG.boxes],
    feedbackRules: [...DEFAULT_CONFIG.feedbackRules],
  }
}

export async function getBoxConfig(prisma: PrismaClient): Promise<BoxConfig> {
  try {
    const row = await prisma.appSetting.findUnique({
      where: { key: BOX_CONFIG_KEY },
    })
    if (!row?.value || typeof row.value !== 'object') {
      return getDefaultBoxConfig()
    }
    const v = row.value as Record<string, unknown>
    return {
      boxes: Array.isArray(v.boxes) ? v.boxes as Box[] : DEFAULT_BOXES,
      feedbackRules: Array.isArray(v.feedbackRules) ? v.feedbackRules as FeedbackRule[] : [],
      packingEfficiency: typeof v.packingEfficiency === 'number' ? v.packingEfficiency : 0.7,
      version: typeof v.version === 'string' ? v.version : '1.0.0',
    }
  } catch {
    return getDefaultBoxConfig()
  }
}

export async function setBoxConfig(
  prisma: PrismaClient,
  config: BoxConfig
): Promise<BoxConfig> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jsonValue = config as any
  await prisma.appSetting.upsert({
    where: { key: BOX_CONFIG_KEY },
    create: { key: BOX_CONFIG_KEY, value: jsonValue },
    update: { value: jsonValue },
  })
  return config
}

// Box CRUD
export async function addBox(
  prisma: PrismaClient,
  box: Omit<Box, 'id' | 'volume'> & { id?: string }
): Promise<Box> {
  const config = await getBoxConfig(prisma)

  const newBox: Box = {
    ...box,
    id: box.id || generateBoxId(box.name),
    volume: calculateBoxVolume(box.internalDimensions),
  }

  if (config.boxes.some(b => b.id === newBox.id)) {
    throw new Error(`Box with ID "${newBox.id}" already exists`)
  }

  config.boxes.push(newBox)
  await setBoxConfig(prisma, config)
  return newBox
}

export async function updateBox(
  prisma: PrismaClient,
  id: string,
  updates: Partial<Omit<Box, 'id'>>
): Promise<Box> {
  const config = await getBoxConfig(prisma)
  const index = config.boxes.findIndex(b => b.id === id)

  if (index === -1) {
    throw new Error(`Box with ID "${id}" not found`)
  }

  const updated: Box = {
    ...config.boxes[index],
    ...updates,
  }

  if (updates.internalDimensions) {
    updated.volume = calculateBoxVolume(updated.internalDimensions)
  }

  config.boxes[index] = updated
  await setBoxConfig(prisma, config)
  return updated
}

export async function deleteBox(
  prisma: PrismaClient,
  id: string
): Promise<boolean> {
  const config = await getBoxConfig(prisma)
  const index = config.boxes.findIndex(b => b.id === id)

  if (index === -1) {
    return false
  }

  config.boxes.splice(index, 1)
  await setBoxConfig(prisma, config)
  return true
}

// Feedback Rule CRUD
export async function addFeedbackRule(
  prisma: PrismaClient,
  rule: Omit<FeedbackRule, 'id' | 'testedAt'>
): Promise<FeedbackRule> {
  const config = await getBoxConfig(prisma)

  const newRule: FeedbackRule = {
    ...rule,
    id: `rule-${Date.now()}`,
    testedAt: new Date().toISOString(),
  }

  // Remove any existing rule for this combo + box
  config.feedbackRules = config.feedbackRules.filter(
    r => !(r.comboSignature === rule.comboSignature && r.boxId === rule.boxId)
  )

  config.feedbackRules.push(newRule)
  await setBoxConfig(prisma, config)
  return newRule
}

export async function deleteFeedbackRule(
  prisma: PrismaClient,
  id: string
): Promise<boolean> {
  const config = await getBoxConfig(prisma)
  const index = config.feedbackRules.findIndex(r => r.id === id)

  if (index === -1) {
    return false
  }

  config.feedbackRules.splice(index, 1)
  await setBoxConfig(prisma, config)
  return true
}
