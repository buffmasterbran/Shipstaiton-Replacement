'use client'

import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import OrderDialog from '../dialogs/OrderDialog'
import BoxConfirmDialog from '../dialogs/BoxConfirmDialog'
import ColumnSettingsDialog from './ColumnSettingsDialog'
import BulkActionBar from './BulkActionBar'
import { RATE_SHOP_VALUE } from '@/components/ui/ServiceSelect'
import ManualOrderDialog from '../dialogs/ManualOrderDialog'
import { useExpeditedFilter, isOrderExpedited, isOrderPersonalized } from '@/context/ExpeditedFilterContext'
import { useOrders, type OrderLog as ContextOrderLog } from '@/context/OrdersContext'
import { useReferenceData } from '@/hooks/useReferenceData'
import { PAGE_SIZES, DEFAULT_PAGE_SIZE, SortKey, SortDir, OrderTypeFilter, ORDER_TYPE_TABS, type OrderLog, type OrderHighlightSettings, type OrdersTableProps } from './types'
import { formatCurrency, getDaysOld, getOrderHighlightType, getOrderDate, getCustomerName, getOrderNumber, getAmount, getOrderType } from './helpers'

interface ColumnDef {
  id: string
  label: string
  sortKey?: SortKey
  className?: string
  headerClassName?: string
  defaultWidth?: number
}

function getStorageKey(view: 'awaiting' | 'shipped') {
  const userId = typeof window !== 'undefined' ? localStorage.getItem('current-user-id') : null
  const base = view === 'shipped' ? 'orders-table-columns-shipped' : 'orders-table-columns'
  return userId ? `${base}-${userId}` : base
}
const PINNED_COLUMNS = new Set(['orderNumber', 'actions'])

const AWAITING_COLUMNS: ColumnDef[] = [
  { id: 'orderNumber', label: 'Order #', sortKey: 'orderNumber', defaultWidth: 100 },
  { id: 'if', label: 'IF', defaultWidth: 45 },
  { id: 'customer', label: 'Customer', sortKey: 'customer', defaultWidth: 160 },
  { id: 'items', label: 'Items', sortKey: 'items', defaultWidth: 55 },
  { id: 'box', label: 'Box', defaultWidth: 100 },
  { id: 'weight', label: 'Weight', sortKey: 'weight', className: 'whitespace-nowrap', defaultWidth: 85 },
  { id: 'carrier', label: 'Carrier', sortKey: 'carrier', className: 'whitespace-nowrap', defaultWidth: 80 },
  { id: 'service', label: 'Service', sortKey: 'service', className: 'whitespace-nowrap', defaultWidth: 150 },
  { id: 'rate', label: 'Rate', sortKey: 'rate', className: 'whitespace-nowrap text-right font-mono', defaultWidth: 80 },
  { id: 'amount', label: 'Amount', sortKey: 'amount', defaultWidth: 85 },
  { id: 'orderDate', label: 'Order Date', sortKey: 'orderDate', defaultWidth: 95 },
  { id: 'received', label: 'Received', sortKey: 'received', defaultWidth: 95 },
  { id: 'status', label: 'Status', sortKey: 'status', defaultWidth: 110 },
  { id: 'actions', label: 'Actions', defaultWidth: 80 },
]

const SHIPPED_COLUMNS: ColumnDef[] = [
  { id: 'orderNumber', label: 'Order #', sortKey: 'orderNumber', defaultWidth: 100 },
  { id: 'if', label: 'IF', defaultWidth: 45 },
  { id: 'customer', label: 'Customer', sortKey: 'customer', defaultWidth: 160 },
  { id: 'carrier', label: 'Carrier', sortKey: 'carrier', className: 'whitespace-nowrap', defaultWidth: 80 },
  { id: 'service', label: 'Service', sortKey: 'service', className: 'whitespace-nowrap', defaultWidth: 150 },
  { id: 'tracking', label: 'Tracking', defaultWidth: 180 },
  { id: 'rate', label: 'Cost', sortKey: 'rate', className: 'whitespace-nowrap text-right font-mono', defaultWidth: 80 },
  { id: 'printed', label: 'Printed', defaultWidth: 70 },
  { id: 'nsUpdated', label: 'NS Updated', defaultWidth: 90 },
  { id: 'shippedDate', label: 'Shipped Date', defaultWidth: 100 },
  { id: 'amount', label: 'Amount', sortKey: 'amount', defaultWidth: 85 },
  { id: 'orderDate', label: 'Order Date', sortKey: 'orderDate', defaultWidth: 95 },
  { id: 'items', label: 'Items', sortKey: 'items', defaultWidth: 55 },
  { id: 'weight', label: 'Weight', sortKey: 'weight', className: 'whitespace-nowrap', defaultWidth: 85 },
  { id: 'box', label: 'Box', defaultWidth: 100 },
  { id: 'actions', label: 'Actions', defaultWidth: 80 },
]

function getColumnsForView(shipped: boolean) {
  return shipped ? SHIPPED_COLUMNS : AWAITING_COLUMNS
}

function getDefaultWidths(cols: ColumnDef[]): Record<string, number> {
  const w: Record<string, number> = {}
  for (const c of cols) if (c.defaultWidth) w[c.id] = c.defaultWidth
  return w
}

function loadColumnPrefs(view: 'awaiting' | 'shipped'): { order: string[]; hidden: Set<string>; widths: Record<string, number> } {
  const cols = view === 'shipped' ? SHIPPED_COLUMNS : AWAITING_COLUMNS
  const defaultOrder = cols.map(c => c.id)
  const defaultWidths = getDefaultWidths(cols)
  if (typeof window === 'undefined') return { order: defaultOrder, hidden: new Set(), widths: defaultWidths }
  try {
    const raw = localStorage.getItem(getStorageKey(view))
    if (!raw) return { order: defaultOrder, hidden: new Set(), widths: defaultWidths }
    const parsed = JSON.parse(raw)
    const knownIds = new Set(cols.map((c) => c.id))
    const order = (parsed.order as string[]).filter((id: string) => knownIds.has(id))
    for (const col of cols) {
      if (!order.includes(col.id)) order.push(col.id)
    }
    const savedWidths = (parsed.widths as Record<string, number>) || {}
    const widths = { ...defaultWidths, ...savedWidths }
    return { order, hidden: new Set((parsed.hidden as string[]) || []), widths }
  } catch {
    return { order: defaultOrder, hidden: new Set(), widths: defaultWidths }
  }
}

function saveColumnPrefs(view: 'awaiting' | 'shipped', order: string[], hidden: Set<string>, widths?: Record<string, number>) {
  try {
    const data: any = { order, hidden: Array.from(hidden) }
    if (widths) data.widths = widths
    localStorage.setItem(getStorageKey(view), JSON.stringify(data))
  } catch { /* ignore */ }
}

export default function OrdersTable({ logs, orderHighlightSettings }: OrdersTableProps) {
  const { expeditedFilter, personalizedFilter } = useExpeditedFilter()
  const { refreshOrders, updateOrderStatus, updateOrderInPlace, removeOrders } = useOrders()
  const { boxes: refBoxes, carrierServices, loaded: refDataLoaded } = useReferenceData()
  const searchParams = useSearchParams()
  const router = useRouter()

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number; action: string } | null>(null)
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null)
  const [selectedRawPayload, setSelectedRawPayload] = useState<any | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showShipped, setShowShipped] = useState(false)
  const [typeFilter, setTypeFilter] = useState<OrderTypeFilter>('all')
  const [sortKey, setSortKey] = useState<SortKey>('orderDate')

  // Box confirm dialog state
  const [isBoxConfirmOpen, setIsBoxConfirmOpen] = useState(false)
  const [boxConfirmLog, setBoxConfirmLog] = useState<OrderLog | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)

  // Delete confirmation state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [orderToDelete, setOrderToDelete] = useState<OrderLog | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Hold state
  const [holdingIds, setHoldingIds] = useState<Set<string>>(new Set())
  const [holdDialogOpen, setHoldDialogOpen] = useState(false)
  const [holdOrderId, setHoldOrderId] = useState<string | null>(null)
  const [holdOrderNumber, setHoldOrderNumber] = useState<string>('')
  const [holdReason, setHoldReason] = useState('')

  // Column settings
  const currentView = showShipped ? 'shipped' : 'awaiting' as const
  const activeColumns = getColumnsForView(showShipped)
  const [columnOrder, setColumnOrder] = useState<string[]>(() => activeColumns.map(c => c.id))
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set())
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => getDefaultWidths(activeColumns))
  const [showColumnSettings, setShowColumnSettings] = useState(false)
  const [showManualOrder, setShowManualOrder] = useState(false)
  const [recalculating, setRecalculating] = useState(false)
  const [recalcResult, setRecalcResult] = useState<string | null>(null)

  useEffect(() => {
    const prefs = loadColumnPrefs(showShipped ? 'shipped' : 'awaiting')
    setColumnOrder(prefs.order)
    setHiddenColumns(prefs.hidden)
    setColumnWidths(prefs.widths)
  }, [showShipped])

  // Auto-open dialog when ?order=<number> is in the URL
  const urlOrderParam = searchParams.get('order')
  const autoOpenDoneRef = useRef<string | null>(null)
  useEffect(() => {
    if (!urlOrderParam || logs.length === 0) return
    if (autoOpenDoneRef.current === urlOrderParam) return
    const needle = urlOrderParam.replace(/^#/, '')
    const match = logs.find(l => {
      const num = l.orderNumber?.replace(/^#/, '')
      return num === needle
    })
    if (match) {
      autoOpenDoneRef.current = urlOrderParam
      if (match.status === 'SHIPPED' && !showShipped) {
        setShowShipped(true)
      }
      const payload = match.rawPayload as any
      const order = Array.isArray(payload) ? payload[0] : payload
      setSelectedOrder(order)
      setSelectedRawPayload(payload)
      setViewedLog(match)
      setIsDialogOpen(true)
    }
  }, [urlOrderParam, logs, showShipped])

  const handleColumnSave = useCallback((order: string[], hidden: Set<string>) => {
    setColumnOrder(order)
    setHiddenColumns(hidden)
    saveColumnPrefs(currentView, order, hidden, columnWidths)
  }, [currentView, columnWidths])

  // Resize handling
  const resizingRef = useRef<{ colId: string; startX: number; startW: number } | null>(null)

  const handleResizeStart = useCallback((colId: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startW = columnWidths[colId] || 100
    resizingRef.current = { colId, startX, startW }

    const onMouseMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return
      const delta = ev.clientX - resizingRef.current.startX
      const newW = Math.max(40, resizingRef.current.startW + delta)
      setColumnWidths(prev => ({ ...prev, [resizingRef.current!.colId]: newW }))
    }
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setColumnWidths(prev => {
        saveColumnPrefs(currentView, columnOrder, hiddenColumns, prev)
        return prev
      })
      resizingRef.current = null
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [columnWidths, currentView, columnOrder, hiddenColumns])

  const visibleColumns = useMemo(() => {
    const lookup = new Map(activeColumns.map((c) => [c.id, c]))
    return columnOrder.filter((id) => !hiddenColumns.has(id)).map((id) => lookup.get(id)!).filter(Boolean)
  }, [columnOrder, hiddenColumns, activeColumns])

  // Open hold reason dialog
  const handleHoldClick = (log: OrderLog, e: React.MouseEvent) => {
    e.stopPropagation()
    const payload = log.rawPayload as any
    const order = Array.isArray(payload) ? payload[0] : payload
    setHoldOrderId(log.id)
    setHoldOrderNumber(order?.orderNumber || log.orderNumber)
    setHoldReason('')
    setHoldDialogOpen(true)
  }

  // Confirm hold with reason
  const handleConfirmHold = async () => {
    if (!holdOrderId) return
    setHoldDialogOpen(false)
    setHoldingIds(prev => new Set(prev).add(holdOrderId))

    try {
      const res = await fetch('/api/orders/hold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: holdOrderId, reason: holdReason.trim() || undefined }),
      })

      if (res.ok) {
        updateOrderStatus(holdOrderId, 'ON_HOLD')
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to put order on hold')
      }
    } catch (err) {
      console.error('Error putting order on hold:', err)
      alert('Failed to put order on hold')
    } finally {
      setHoldingIds(prev => {
        const next = new Set(prev)
        next.delete(holdOrderId!)
        return next
      })
      setHoldOrderId(null)
    }
  }

  const filteredAndSortedLogs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    let list = logs

    // Hide orders on hold (they appear in the Hold tab)
    list = list.filter((log) => log.status !== 'ON_HOLD')

    // Shipped toggle
    if (showShipped) {
      list = list.filter((log) => log.status === 'SHIPPED')
    } else {
      list = list.filter((log) => log.status !== 'SHIPPED')
    }

    // Filter by personalized (3-state: all, only, hide)
    if (personalizedFilter === 'only') {
      list = list.filter((log) => isOrderPersonalized(log.rawPayload))
    } else if (personalizedFilter === 'hide') {
      list = list.filter((log) => !isOrderPersonalized(log.rawPayload))
    }

    // Filter by expedited (3-state: all, only, hide)
    if (expeditedFilter === 'only') {
      list = list.filter((log) => isOrderExpedited(log.rawPayload, log.customerReachedOut, log.orderType))
    } else if (expeditedFilter === 'hide') {
      list = list.filter((log) => !isOrderExpedited(log.rawPayload, log.customerReachedOut, log.orderType))
    }

    // Filter by type
    if (typeFilter !== 'all') {
      list = list.filter((log) => getOrderType(log) === typeFilter)
    }

    // Filter by search query
    if (q) {
      list = list.filter((log) => {
        const num = getOrderNumber(log).toLowerCase()
        const customer = getCustomerName(log).toLowerCase()
        return num.includes(q) || customer.includes(q)
      })
    }

    return [...list].sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'orderNumber':
          cmp = getOrderNumber(a).localeCompare(getOrderNumber(b))
          break
        case 'customer':
          cmp = getCustomerName(a).localeCompare(getCustomerName(b))
          break
        case 'items': {
          const pa = (a.rawPayload as any)
          const oa = Array.isArray(pa) ? pa[0] : pa
          const pb = (b.rawPayload as any)
          const ob = Array.isArray(pb) ? pb[0] : pb
          const na = oa?.items?.length ?? 0
          const nb = ob?.items?.length ?? 0
          cmp = na - nb
          break
        }
        case 'amount':
          cmp = getAmount(a) - getAmount(b)
          break
        case 'orderDate':
          cmp = getOrderDate(a).getTime() - getOrderDate(b).getTime()
          break
        case 'received':
          cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          break
        case 'status':
          cmp = (a.status ?? '').localeCompare(b.status ?? '')
          break
        case 'weight':
          cmp = ((a as any).shippedWeight ?? 0) - ((b as any).shippedWeight ?? 0)
          break
        case 'carrier':
          cmp = ((a as any).preShoppedRate?.carrier ?? '').localeCompare((b as any).preShoppedRate?.carrier ?? '')
          break
        case 'service':
          cmp = ((a as any).preShoppedRate?.serviceName ?? '').localeCompare((b as any).preShoppedRate?.serviceName ?? '')
          break
        case 'rate':
          cmp = ((a as any).preShoppedRate?.price ?? 0) - ((b as any).preShoppedRate?.price ?? 0)
          break
        default:
          break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [logs, personalizedFilter, expeditedFilter, searchQuery, showShipped, typeFilter, sortKey, sortDir])
  
  // Count orders by type for tab badges + shipped count
  const { typeCounts, shippedCount, notShippedCount } = useMemo(() => {
    let baseList = logs.filter(log => log.status !== 'ON_HOLD')

    const shipped = baseList.filter(log => log.status === 'SHIPPED').length
    const notShipped = baseList.filter(log => log.status !== 'SHIPPED').length

    // For type counts, only count non-shipped orders
    let countList = baseList.filter(log => log.status !== 'SHIPPED')

    if (personalizedFilter === 'only') {
      countList = countList.filter((log) => isOrderPersonalized(log.rawPayload))
    } else if (personalizedFilter === 'hide') {
      countList = countList.filter((log) => !isOrderPersonalized(log.rawPayload))
    }

    if (expeditedFilter === 'only') {
      countList = countList.filter((log) => isOrderExpedited(log.rawPayload, log.customerReachedOut, log.orderType))
    } else if (expeditedFilter === 'hide') {
      countList = countList.filter((log) => !isOrderExpedited(log.rawPayload, log.customerReachedOut, log.orderType))
    }

    const counts: Record<OrderTypeFilter, number> = {
      all: countList.length,
      single: 0,
      bulk: 0,
      box: 0,
      batched: 0,
      uncategorized: 0,
    }
    countList.forEach((log) => {
      const t = getOrderType(log)
      counts[t]++
    })
    return { typeCounts: counts, shippedCount: shipped, notShippedCount: notShipped }
  }, [logs, personalizedFilter, expeditedFilter])

  const totalFiltered = filteredAndSortedLogs.length
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize))
  const pageLogs = useMemo(
    () => filteredAndSortedLogs.slice((page - 1) * pageSize, page * pageSize),
    [filteredAndSortedLogs, page, pageSize]
  )

  useEffect(() => {
    setPage(1)
  }, [personalizedFilter, expeditedFilter, searchQuery, showShipped, typeFilter, sortKey, sortDir])

  useEffect(() => {
    if (page > totalPages) setPage(1)
  }, [page, totalPages])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
    setPage(1)
  }

  // Track currently viewed log for the edit-from-view flow
  const [viewedLog, setViewedLog] = useState<OrderLog | null>(null)

  const handleRowClick = useCallback((log: OrderLog) => {
    const payload = log.rawPayload as any
    const order = Array.isArray(payload) ? payload[0] : payload
    setSelectedOrder(order)
    setSelectedRawPayload(payload)
    setViewedLog(log)
    setIsDialogOpen(true)
    const num = log.orderNumber?.replace(/^#/, '')
    if (num) {
      const params = new URLSearchParams(window.location.search)
      params.set('order', num)
      router.replace(`?${params.toString()}`, { scroll: false })
    }
  }, [router])

  const handleCloseDialog = useCallback(() => {
    setIsDialogOpen(false)
    setSelectedOrder(null)
    setSelectedRawPayload(null)
    autoOpenDoneRef.current = null
    const params = new URLSearchParams(window.location.search)
    params.delete('order')
    const qs = params.toString()
    router.replace(qs ? `?${qs}` : window.location.pathname, { scroll: false })
  }, [router])

  const handleBoxClick = (log: OrderLog, e: React.MouseEvent) => {
    e.stopPropagation() // Prevent row click from opening order dialog
    setBoxConfirmLog(log)
    setIsBoxConfirmOpen(true)
  }

  const handleBoxConfirmClose = () => {
    setIsBoxConfirmOpen(false)
    setBoxConfirmLog(null)
  }

  const handleBoxFeedbackSaved = () => {
    // Refresh the page to get updated box assignments
    window.location.reload()
  }

  const handleOrderSaved = useCallback((updatedOrder: any) => {
    if (updatedOrder?.id) updateOrderInPlace(updatedOrder.id, updatedOrder as Partial<ContextOrderLog>)
  }, [updateOrderInPlace])

  const viewedIndex = viewedLog ? pageLogs.findIndex(l => l.id === viewedLog.id) : -1
  const handleNavPrev = useCallback(() => {
    if (viewedIndex <= 0) return
    const log = pageLogs[viewedIndex - 1]
    const payload = log.rawPayload as any
    setSelectedOrder(Array.isArray(payload) ? payload[0] : payload)
    setSelectedRawPayload(payload)
    setViewedLog(log)
  }, [viewedIndex, pageLogs])
  const handleNavNext = useCallback(() => {
    if (viewedIndex < 0 || viewedIndex >= pageLogs.length - 1) return
    const log = pageLogs[viewedIndex + 1]
    const payload = log.rawPayload as any
    setSelectedOrder(Array.isArray(payload) ? payload[0] : payload)
    setSelectedRawPayload(payload)
    setViewedLog(log)
  }, [viewedIndex, pageLogs])

  // === Bulk selection ===
  const pageIds = useMemo(() => new Set(pageLogs.map(l => l.id)), [pageLogs])
  const allPageSelected = pageIds.size > 0 && Array.from(pageIds).every(id => selectedIds.has(id))
  const somePageSelected = selectedIds.size > 0

  const toggleSelectAll = useCallback(() => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (allPageSelected) {
        Array.from(pageIds).forEach(id => next.delete(id))
      } else {
        Array.from(pageIds).forEach(id => next.add(id))
      }
      return next
    })
  }, [allPageSelected, pageIds])

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  const clearSelection = useCallback(() => setSelectedIds(new Set()), [])

  // Clear selection when filters/page change
  useEffect(() => { setSelectedIds(new Set()) }, [typeFilter, searchQuery, page, pageSize])

  // === Bulk action runners ===
  const runBulkAction = useCallback(async (
    label: string,
    ids: string[],
    action: (id: string) => Promise<any>
  ) => {
    setBulkProgress({ done: 0, total: ids.length, action: label })
    for (let i = 0; i < ids.length; i++) {
      try {
        const result = await action(ids[i])
        if (result?.order) updateOrderInPlace(result.order.id, result.order as Partial<ContextOrderLog>)
      } catch (e) { console.error(`Bulk ${label} error for ${ids[i]}:`, e) }
      setBulkProgress({ done: i + 1, total: ids.length, action: label })
    }
    setBulkProgress(null)
    setSelectedIds(new Set())
  }, [updateOrderInPlace])

  const handleBulkChangeBox = useCallback(async (boxId: string) => {
    const box = refBoxes.find(b => b.id === boxId)
    if (!box) return
    const ids = Array.from(selectedIds)
    await runBulkAction('Change Box', ids, async (id) => {
      const res = await fetch(`/api/orders/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ box: { boxId: box.id, boxName: box.name, lengthInches: box.lengthInches, widthInches: box.widthInches, heightInches: box.heightInches, weightLbs: box.weightLbs } }),
      })
      return res.json()
    })
  }, [selectedIds, refBoxes, runBulkAction])

  const handleBulkChangeService = useCallback(async (serviceCode: string) => {
    const ids = Array.from(selectedIds)

    if (serviceCode === RATE_SHOP_VALUE) {
      await runBulkAction('Rate Shop', ids, async (id) => {
        const res = await fetch(`/api/orders/${id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ retryRateShopping: true }),
        })
        return res.json()
      })
    } else {
      const svc = carrierServices.find(s => s.serviceCode === serviceCode)
      if (!svc) return
      await runBulkAction('Change Service', ids, async (id) => {
        const res = await fetch(`/api/orders/${id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ carrier: { carrierId: svc.carrierId, carrierCode: svc.carrierCode, carrier: svc.carrierName, serviceCode: svc.serviceCode, serviceName: svc.serviceName } }),
        })
        return res.json()
      })
    }
  }, [selectedIds, carrierServices, runBulkAction])

  const handleBulkGetRates = useCallback(async () => {
    const ids = Array.from(selectedIds)
    await runBulkAction('Get Rates', ids, async (id) => {
      const res = await fetch(`/api/orders/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ retryRateShopping: true }),
      })
      return res.json()
    })
  }, [selectedIds, runBulkAction])

  const handleBulkReingest = useCallback(async () => {
    const ids = Array.from(selectedIds)
    await runBulkAction('Re-run Ingest', ids, async (id) => {
      const res = await fetch(`/api/orders/${id}/reingest`, { method: 'POST' })
      return res.json()
    })
  }, [selectedIds, runBulkAction])

  const handleBulkValidateAddresses = useCallback(async () => {
    const ids = Array.from(selectedIds)
    await runBulkAction('Validate Addresses', ids, async (id) => {
      const order = logs.find(l => l.id === id)
      if (!order) return null
      const payload = order.rawPayload as any
      const od = Array.isArray(payload) ? payload[0] : payload
      const shipTo = od?.shipTo || {}
      const res = await fetch(`/api/orders/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: { name: shipTo.name, company: shipTo.company, street1: shipTo.street1, street2: shipTo.street2, city: shipTo.city, state: shipTo.state, postalCode: shipTo.postalCode, country: shipTo.country || 'US', phone: shipTo.phone } }),
      })
      return res.json()
    })
  }, [selectedIds, logs, runBulkAction])

  const handleBulkHold = useCallback(async () => {
    const reason = prompt('Hold reason for selected orders:')
    if (!reason) return
    const ids = Array.from(selectedIds)
    await runBulkAction('Put on Hold', ids, async (id) => {
      const res = await fetch('/api/orders', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: id, status: 'ON_HOLD', reason }),
      })
      const data = await res.json()
      if (data.success) updateOrderStatus(id, 'ON_HOLD')
      return null
    })
  }, [selectedIds, runBulkAction, updateOrderStatus])

  const handleBulkDelete = useCallback(async () => {
    const ids = Array.from(selectedIds)
    if (!confirm(`Delete ${ids.length} order(s)? This cannot be undone.`)) return
    try {
      const res = await fetch('/api/orders', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIds: ids }),
      })
      if (res.ok) {
        removeOrders(ids)
        setSelectedIds(new Set())
      }
    } catch (e) { console.error('Bulk delete error:', e) }
  }, [selectedIds, removeOrders])

  const handleDeleteClick = (log: OrderLog, e: React.MouseEvent) => {
    e.stopPropagation() // Prevent row click
    setOrderToDelete(log)
    setDeleteConfirmOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!orderToDelete) return
    
    setDeleting(true)
    try {
      const res = await fetch('/api/orders', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIds: [orderToDelete.id] }),
      })
      
      if (res.ok) {
        setDeleteConfirmOpen(false)
        removeOrders([orderToDelete.id])
        setOrderToDelete(null)
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to delete order')
      }
    } catch (err) {
      console.error('Error deleting order:', err)
      alert('Failed to delete order')
    } finally {
      setDeleting(false)
    }
  }

  const handleCancelDelete = () => {
    setDeleteConfirmOpen(false)
    setOrderToDelete(null)
  }

  if (logs.length === 0) {
    return (
      <div className="bg-white rounded shadow p-6 text-center">
        <p className="text-gray-500">No order logs found</p>
        <p className="text-gray-400 text-sm mt-1">Orders will appear once sent from NetSuite</p>
      </div>
    )
  }

  const handleResizeReset = useCallback((colId: string) => {
    const col = activeColumns.find(c => c.id === colId)
    if (!col?.defaultWidth) return
    setColumnWidths(prev => {
      const next = { ...prev, [colId]: col.defaultWidth! }
      saveColumnPrefs(currentView, columnOrder, hiddenColumns, next)
      return next
    })
  }, [activeColumns, currentView, columnOrder, hiddenColumns])

  const ResizeHandle = ({ colId }: { colId: string }) => (
    <div
      onMouseDown={e => handleResizeStart(colId, e)}
      onDoubleClick={e => { e.stopPropagation(); handleResizeReset(colId) }}
      className="absolute right-0 top-0 bottom-0 w-3 cursor-col-resize group z-10 flex items-center justify-center"
      title="Drag to resize, double-click to reset"
    >
      <div className="w-px h-3/5 bg-gray-300 group-hover:bg-blue-400 group-active:bg-blue-500 transition-colors" />
    </div>
  )

  const Th = ({ columnKey, colId, children }: { columnKey: SortKey; colId: string; children: React.ReactNode }) => (
    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider relative overflow-hidden" style={{ width: columnWidths[colId] }}>
      <button
        type="button"
        onClick={() => handleSort(columnKey)}
        className="inline-flex items-center gap-0.5 hover:text-gray-700 focus:outline-none truncate"
      >
        {children}
        {sortKey === columnKey && (
          <span className="text-gray-400">{sortDir === 'asc' ? '↑' : '↓'}</span>
        )}
      </button>
      <ResizeHandle colId={colId} />
    </th>
  )

  return (
    <>
      {/* Shipped / Not Shipped toggle + Recalculate button */}
      <div className="mb-3 flex items-center gap-3">
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 w-fit">
          <button
            type="button"
            onClick={() => { setShowShipped(false); setTypeFilter('all') }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              !showShipped ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Awaiting Shipment
            <span className={`ml-1.5 text-xs ${!showShipped ? 'text-gray-500' : 'text-gray-400'}`}>{notShippedCount}</span>
          </button>
          <button
            type="button"
            onClick={() => { setShowShipped(true); setTypeFilter('all') }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              showShipped ? 'bg-green-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Shipped
            <span className={`ml-1.5 text-xs ${showShipped ? 'text-green-200' : 'text-gray-400'}`}>{shippedCount}</span>
          </button>
        </div>

        {!showShipped && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={recalculating}
              onClick={async () => {
                setRecalculating(true)
                setRecalcResult(null)
                try {
                  const res = await fetch('/api/orders/recalculate-boxes', { method: 'POST' })
                  const data = await res.json()
                  if (res.ok) {
                    setRecalcResult(`Updated ${data.updated}/${data.total} orders${data.errors?.length ? ` (${data.errors.length} errors)` : ''}`)
                    refreshOrders()
                  } else {
                    setRecalcResult(`Error: ${data.error || 'Failed'}`)
                  }
                } catch (e: any) {
                  setRecalcResult(`Error: ${e.message}`)
                } finally {
                  setRecalculating(false)
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 hover:text-gray-800 transition-colors disabled:opacity-50"
            >
              {recalculating ? (
                <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
              ) : (
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" /></svg>
              )}
              {recalculating ? 'Recalculating...' : 'Recalculate Boxes'}
            </button>
            {recalcResult && (
              <span className={`text-xs ${recalcResult.startsWith('Error') ? 'text-red-600' : 'text-green-600'}`}>
                {recalcResult}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Type filter tabs — hidden when viewing shipped */}
      {!showShipped && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {ORDER_TYPE_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setTypeFilter(tab.key)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                typeFilter === tab.key
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {tab.label}
              <span className={`ml-1.5 text-xs ${typeFilter === tab.key ? 'text-green-100' : 'text-gray-500'}`}>
                {typeCounts[tab.key]}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Compact toolbar: search + pagination in one row */}
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <input
          id="orders-search"
          type="search"
          placeholder="Search order # or customer..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 min-w-[180px] max-w-xs border border-gray-300 rounded px-2 py-1 text-sm placeholder-gray-400 focus:ring-1 focus:ring-green-500 focus:border-green-500"
        />
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span className="hidden sm:inline">Show</span>
          <select
            id="page-size"
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value))
              setPage(1)
            }}
            className="border border-gray-300 rounded px-1.5 py-1 text-sm"
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => setShowColumnSettings(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1 border border-gray-300 rounded text-xs font-medium text-gray-600 hover:bg-gray-50"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18M3 8h18M3 12h18M3 16h18M3 20h18" />
          </svg>
          Columns
        </button>
        <button
          type="button"
          onClick={() => setShowManualOrder(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1 border border-blue-300 bg-blue-50 rounded text-xs font-medium text-blue-700 hover:bg-blue-100"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add Order
        </button>
        <span className="text-xs text-gray-500">
          {searchQuery.trim() ? `${totalFiltered}/${logs.length}` : `${logs.length} orders`}
        </span>
      </div>

      <div className="bg-white rounded shadow overflow-hidden">
        {selectedIds.size > 0 && (
          <BulkActionBar
            count={selectedIds.size}
            boxes={refBoxes.filter(b => b.active)}
            carrierServices={carrierServices}
            progress={bulkProgress}
            onChangeBox={handleBulkChangeBox}
            onChangeService={handleBulkChangeService}
            onGetRates={handleBulkGetRates}
            onReingest={handleBulkReingest}
            onValidateAddresses={handleBulkValidateAddresses}
            onHold={handleBulkHold}
            onDelete={handleBulkDelete}
            onClear={clearSelection}
          />
        )}
        <div className="overflow-x-auto">
          <table className="divide-y divide-gray-200 text-sm" style={{ tableLayout: 'fixed', width: 40 + visibleColumns.reduce((sum, c) => sum + (columnWidths[c.id] || c.defaultWidth || 100), 0) }}>
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-3" style={{ width: 40 }}>
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                </th>
                {visibleColumns.map((col) =>
                  col.sortKey ? (
                    <Th key={col.id} colId={col.id} columnKey={col.sortKey}>{col.label}</Th>
                  ) : (
                    <th key={col.id} className={`px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider relative overflow-hidden ${col.headerClassName || ''}`} style={{ width: columnWidths[col.id] || col.defaultWidth }}>
                      <span className="truncate block">{col.label}</span>
                      <ResizeHandle colId={col.id} />
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {pageLogs.map((log) => {
                const payload = log.rawPayload as any
                const order = Array.isArray(payload) ? payload[0] : payload
                const highlightType = getOrderHighlightType(log, orderHighlightSettings)
                const preShoppedRate = (log as any).preShoppedRate as any
                const shippedWeight = (log as any).shippedWeight as number | null

                return (
                  <tr
                    key={log.id}
                    onClick={() => handleRowClick(log)}
                    className={`cursor-pointer transition-colors ${selectedIds.has(log.id) ? 'bg-blue-50 hover:bg-blue-100' : 'hover:bg-gray-50'}`}
                  >
                    <td className="px-3 py-3 w-10" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(log.id)}
                        onChange={() => toggleSelect(log.id)}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </td>
                    {visibleColumns.map((col) => {
                      const tdCls = 'px-4 py-3 whitespace-nowrap overflow-hidden text-ellipsis'
                      switch (col.id) {
                        case 'orderNumber':
                          return (
                            <td key={col.id} className={`${tdCls} border-l-4 ${
                              highlightType === 'red' ? 'border-l-red-500' : highlightType === 'orange' ? 'border-l-yellow-400' : 'border-l-transparent'
                            }`}>
                              <span className="text-sm font-semibold text-gray-900">
                                {order?.orderNumber || log.orderNumber}
                              </span>
                            </td>
                          )
                        case 'if':
                          return (
                            <td key={col.id} className={`${tdCls} px-2 text-center`}>
                              {order?.netsuiteIfId ? (
                                <a
                                  href={`https://7913744.app.netsuite.com/app/accounting/transactions/itemship.nl?id=${order.netsuiteIfId}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-blue-500 hover:text-blue-700"
                                  title={`IF ${order.netsuiteIfId}`}
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                  </svg>
                                </a>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                          )
                        case 'customer':
                          return (
                            <td key={col.id} className={`${tdCls} !whitespace-normal`}>
                              <div className="text-sm text-gray-900 truncate">{order?.shipTo?.name || order?.billTo?.name || 'N/A'}</div>
                              {order?.shipTo?.city && order?.shipTo?.state && (
                                <div className="text-xs text-gray-500 truncate">
                                  {order.shipTo.city}, {order.shipTo.state}
                                </div>
                              )}
                            </td>
                          )
                        case 'items':
                          return (
                            <td key={col.id} className={`${tdCls} text-sm text-gray-900`}>
                              {order?.items?.length || 0}
                            </td>
                          )
                        case 'box':
                          return (
                            <td key={col.id} className={tdCls}>
                              {(() => {
                                const suggestion = log.suggestedBox
                                if (!suggestion) {
                                  return (
                                    <button
                                      onClick={(e) => handleBoxClick(log, e)}
                                      className="text-sm text-gray-400 hover:text-gray-600 hover:underline"
                                      title="Click to set box"
                                    >
                                      — Set
                                    </button>
                                  )
                                }
                                if (!suggestion.boxName) {
                                  return (
                                    <button
                                      onClick={(e) => handleBoxClick(log, e)}
                                      className="text-sm text-red-600 font-medium hover:text-red-800 hover:underline"
                                      title="Click to set box"
                                    >
                                      No fit
                                    </button>
                                  )
                                }
                                if (suggestion.confidence === 'confirmed') {
                                  return (
                                    <span className="text-sm font-medium text-green-600">
                                      {suggestion.boxName}
                                    </span>
                                  )
                                }
                                const colorClass = suggestion.confidence === 'calculated'
                                  ? 'text-amber-600 hover:text-amber-800'
                                  : 'text-red-600 hover:text-red-800'
                                return (
                                  <button
                                    onClick={(e) => handleBoxClick(log, e)}
                                    className={`text-sm font-medium ${colorClass} hover:underline`}
                                    title="Click to confirm or change box"
                                  >
                                    {suggestion.boxName}
                                  </button>
                                )
                              })()}
                            </td>
                          )
                        case 'weight':
                          return (
                            <td key={col.id} className={`${tdCls} text-sm text-gray-600`}>
                              {shippedWeight != null ? `${shippedWeight.toFixed(2)} lbs` : <span className="text-gray-300">—</span>}
                            </td>
                          )
                        case 'carrier':
                          return (
                            <td key={col.id} className={`${tdCls} text-sm text-gray-600`}>
                              {preShoppedRate?.carrier || <span className="text-gray-300">—</span>}
                            </td>
                          )
                        case 'service':
                          return (
                            <td key={col.id} className={`${tdCls} text-sm text-gray-600`} title={preShoppedRate?.serviceName || ''}>
                              {preShoppedRate?.serviceName || <span className="text-gray-300">—</span>}
                            </td>
                          )
                        case 'rate':
                          return (
                            <td key={col.id} className={`${tdCls} text-sm text-right font-mono`}>
                              {preShoppedRate?.price != null ? (
                                <span className="text-green-700 font-medium">{formatCurrency(preShoppedRate.price)}</span>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                          )
                        case 'amount':
                          return (
                            <td key={col.id} className={`${tdCls} text-sm font-medium text-gray-900`}>
                              {order?.amountPaid !== undefined ? formatCurrency(order.amountPaid) : '—'}
                            </td>
                          )
                        case 'orderDate':
                          return (
                            <td key={col.id} className={`${tdCls} text-sm text-gray-500`}>
                              {order?.orderDate ? new Date(order.orderDate).toLocaleDateString() : '—'}
                            </td>
                          )
                        case 'received':
                          return (
                            <td key={col.id} className={`${tdCls} text-sm text-gray-500`}>
                              {new Date(log.createdAt).toLocaleDateString()}
                            </td>
                          )
                        case 'tracking':
                          return (
                            <td key={col.id} className={`${tdCls} text-xs font-mono text-gray-600`}>
                              {(log as any).trackingNumber || '—'}
                            </td>
                          )
                        case 'printed':
                          return (
                            <td key={col.id} className={tdCls}>
                              {log.status === 'SHIPPED' ? (
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                                  (log as any).printStatus === 'sent' || (log as any).printStatus === 'opened_pdf' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                }`}>
                                  {(log as any).printStatus === 'sent' || (log as any).printStatus === 'opened_pdf' ? '✓' : '✗'}
                                </span>
                              ) : <span className="text-gray-300">—</span>}
                            </td>
                          )
                        case 'nsUpdated':
                          return (
                            <td key={col.id} className={tdCls}>
                              {log.status === 'SHIPPED' ? (
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                                  (log as any).netsuiteUpdated ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                                }`}>
                                  {(log as any).netsuiteUpdated ? '✓' : '✗'}
                                </span>
                              ) : <span className="text-gray-300">—</span>}
                            </td>
                          )
                        case 'shippedDate':
                          return (
                            <td key={col.id} className={`${tdCls} text-sm text-gray-500`}>
                              {(log as any).shippedAt ? new Date((log as any).shippedAt).toLocaleDateString() : '—'}
                            </td>
                          )
                        case 'status': {
                          const statusLabel: Record<string, string> = {
                            AWAITING_SHIPMENT: 'Awaiting',
                            SHIPPED: 'Shipped',
                            ON_HOLD: 'On Hold',
                            CANCELLED: 'Cancelled',
                            DELIVERED: 'Delivered',
                            RETURNED: 'Returned',
                            RECEIVED: 'Received',
                          }
                          return (
                            <td key={col.id} className={tdCls}>
                              <span
                                className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                                  highlightType === 'red'
                                    ? 'bg-red-100 text-red-700'
                                    : highlightType === 'orange'
                                      ? 'bg-yellow-100 text-yellow-700'
                                      : log.status === 'SHIPPED'
                                        ? 'bg-green-100 text-green-800'
                                        : 'bg-blue-100 text-blue-800'
                                }`}
                              >
                                {statusLabel[log.status] || log.status}
                              </span>
                            </td>
                          )
                        }
                        case 'actions':
                          return (
                            <td key={col.id} className={tdCls}>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleRowClick(log) }}
                                  className="p-1.5 rounded hover:bg-blue-100 transition-colors text-gray-400 hover:text-blue-600"
                                  title="View / edit order"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                </button>
                                <button
                                  onClick={(e) => handleHoldClick(log, e)}
                                  disabled={holdingIds.has(log.id) || log.status === 'ON_HOLD'}
                                  className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                                    log.status === 'ON_HOLD'
                                      ? 'bg-yellow-200 text-yellow-800 cursor-default'
                                      : 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                                  } disabled:opacity-50`}
                                  title={log.status === 'ON_HOLD' ? 'Already on hold' : 'Put order on hold'}
                                >
                                  {holdingIds.has(log.id) ? '...' : log.status === 'ON_HOLD' ? 'Held' : 'Hold'}
                                </button>
                                <button
                                  onClick={(e) => handleDeleteClick(log, e)}
                                  className="p-1.5 rounded hover:bg-red-100 transition-colors text-gray-400 hover:text-red-600"
                                  title="Delete order"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </div>
                            </td>
                          )
                        default:
                          return <td key={col.id} className={tdCls}>—</td>
                      }
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Compact pagination */}
      <div className="mt-2 flex items-center justify-between text-sm">
        <span className="text-gray-500">
          {totalFiltered === 0 ? 'No orders' : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, totalFiltered)} of ${totalFiltered}`}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-2 py-1 border border-gray-300 rounded text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Prev
          </button>
          <span className="px-2 text-gray-600">{page}/{totalPages}</span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-2 py-1 border border-gray-300 rounded text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      </div>

      <OrderDialog
        isOpen={isDialogOpen}
        onClose={handleCloseDialog}
        order={selectedOrder}
        rawPayload={selectedRawPayload}
        orderLog={viewedLog}
        onSaved={handleOrderSaved}
        onPrev={viewedIndex > 0 ? handleNavPrev : null}
        onNext={viewedIndex >= 0 && viewedIndex < pageLogs.length - 1 ? handleNavNext : null}
      />
      {boxConfirmLog && (() => {
        const payload = boxConfirmLog.rawPayload as any
        const order = Array.isArray(payload) ? payload[0] : payload
        const items = (order?.items || []).map((item: any) => ({
          sku: item.sku || 'N/A',
          name: item.name || 'Unknown',
          quantity: item.quantity || 1,
        }))
        return (
          <BoxConfirmDialog
            isOpen={isBoxConfirmOpen}
            onClose={handleBoxConfirmClose}
            orderNumber={order?.orderNumber || boxConfirmLog.orderNumber}
            items={items}
            currentBoxName={boxConfirmLog.suggestedBox?.boxName || null}
            currentConfidence={boxConfirmLog.suggestedBox?.confidence || 'unknown'}
            onFeedbackSaved={handleBoxFeedbackSaved}
          />
        )
      })()}
      {/* Hold Reason Dialog */}
      {holdDialogOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
            <div className="fixed inset-0 bg-black/50 transition-opacity" onClick={() => setHoldDialogOpen(false)} />
            <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-auto p-6 z-10">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center">
                  <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-900">Hold Order {holdOrderNumber}</h3>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reason <span className="text-gray-400 text-xs">(optional)</span>
                </label>
                <textarea
                  value={holdReason}
                  onChange={(e) => setHoldReason(e.target.value)}
                  placeholder="Why is this order being held?"
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-1 focus:ring-yellow-500 focus:border-yellow-500 resize-none"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleConfirmHold()
                    }
                  }}
                />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setHoldDialogOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmHold}
                  className="px-4 py-2 text-sm font-medium text-white bg-yellow-600 rounded-lg hover:bg-yellow-700"
                >
                  Put on Hold
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manual Order Dialog */}
      <ManualOrderDialog
        isOpen={showManualOrder}
        onClose={() => setShowManualOrder(false)}
        onCreated={() => { setShowManualOrder(false); refreshOrders() }}
      />

      {/* Column Settings Dialog */}
      <ColumnSettingsDialog
        open={showColumnSettings}
        onClose={() => setShowColumnSettings(false)}
        columns={activeColumns.map((c) => ({ id: c.id, label: c.label }))}
        columnOrder={columnOrder}
        hiddenColumns={hiddenColumns}
        pinnedColumns={PINNED_COLUMNS}
        onSave={handleColumnSave}
      />

      {/* Delete Confirmation Dialog */}
      {deleteConfirmOpen && orderToDelete && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
            <div className="fixed inset-0 bg-black/50 transition-opacity" onClick={handleCancelDelete} />
            <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-auto p-6 z-10">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                  <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-900">Delete Order</h3>
              </div>
              <p className="text-gray-600 mb-6">
                Are you sure you want to delete order <span className="font-semibold">{getOrderNumber(orderToDelete)}</span>? 
                This action cannot be undone.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={handleCancelDelete}
                  disabled={deleting}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmDelete}
                  disabled={deleting}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {deleting ? (
                    <>
                      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Deleting...
                    </>
                  ) : (
                    'Delete'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}


