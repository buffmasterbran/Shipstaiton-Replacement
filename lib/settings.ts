import type { PrismaClient } from '@prisma/client'

/** Order highlight rules (All Orders). Matches NetSuite saved search logic: orange for mid-range, red for oldest. */
export interface OrderHighlightSettings {
  /** Highlight orange when order is more than this many days old (e.g. 3). */
  orangeMinDays: number
  /** Highlight orange when order is at most this many days old (e.g. 5). */
  orangeMaxDays: number
  /** Highlight red when order is at least this many days old (e.g. 6). */
  redMinDays: number
}

const ORDER_HIGHLIGHT_KEY = 'order_highlight'

const DEFAULT_ORDER_HIGHLIGHT: OrderHighlightSettings = {
  orangeMinDays: 3,
  orangeMaxDays: 5,
  redMinDays: 6,
}

function getDefaultOrderHighlight(): OrderHighlightSettings {
  return { ...DEFAULT_ORDER_HIGHLIGHT }
}

export async function getOrderHighlightSettings(prisma: PrismaClient): Promise<OrderHighlightSettings> {
  const row = await prisma.appSetting.findUnique({
    where: { key: ORDER_HIGHLIGHT_KEY },
  })
  if (!row?.value || typeof row.value !== 'object') return getDefaultOrderHighlight()
  const v = row.value as Record<string, unknown>
  return {
    orangeMinDays: typeof v.orangeMinDays === 'number' ? v.orangeMinDays : DEFAULT_ORDER_HIGHLIGHT.orangeMinDays,
    orangeMaxDays: typeof v.orangeMaxDays === 'number' ? v.orangeMaxDays : DEFAULT_ORDER_HIGHLIGHT.orangeMaxDays,
    redMinDays: typeof v.redMinDays === 'number' ? v.redMinDays : DEFAULT_ORDER_HIGHLIGHT.redMinDays,
  }
}

export async function setOrderHighlightSettings(
  prisma: PrismaClient,
  data: Partial<OrderHighlightSettings>
): Promise<OrderHighlightSettings> {
  const current = await getOrderHighlightSettings(prisma)
  const next: OrderHighlightSettings = {
    ...current,
    ...data,
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jsonValue = next as any
  await prisma.appSetting.upsert({
    where: { key: ORDER_HIGHLIGHT_KEY },
    create: { key: ORDER_HIGHLIGHT_KEY, value: jsonValue },
    update: { value: jsonValue },
  })
  return next
}
