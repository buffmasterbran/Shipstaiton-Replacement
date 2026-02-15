import type { OrderLog } from '@/context/OrdersContext'

const PAGE_SIZES = [25, 50, 100] as const
const DEFAULT_PAGE_SIZE = 25

type SortKey = 'orderNumber' | 'customer' | 'items' | 'amount' | 'orderDate' | 'received' | 'status'
type SortDir = 'asc' | 'desc'
type OrderTypeFilter = 'all' | 'single' | 'bulk' | 'box' | 'batched' | 'uncategorized'

const ORDER_TYPE_TABS: { key: OrderTypeFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'single', label: 'Single' },
  { key: 'bulk', label: 'Bulk' },
  { key: 'box', label: 'Box' },
  { key: 'batched', label: 'Batched' },
  { key: 'uncategorized', label: 'Uncategorized' },
]

/** Same shape as lib/settings OrderHighlightSettings (passed from server). */
interface OrderHighlightSettings {
  orangeMinDays: number
  orangeMaxDays: number
  redMinDays: number
}

interface OrdersTableProps {
  logs: OrderLog[]
  orderHighlightSettings?: OrderHighlightSettings | null
}

export {
  PAGE_SIZES,
  DEFAULT_PAGE_SIZE,
  ORDER_TYPE_TABS,
}
export type {
  SortKey,
  SortDir,
  OrderTypeFilter,
  OrderLog,
  OrderHighlightSettings,
  OrdersTableProps,
}
