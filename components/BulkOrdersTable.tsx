'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import OrderDialog from './OrderDialog'
import BulkOrderProcessDialog from './BulkOrderProcessDialog'
import PackageInfoDialog, { PackageInfo } from './PackageInfoDialog'
import BatchPackageInfoDialog from './BatchPackageInfoDialog'
import { getSizeFromSku, getColorFromSku, isShippingInsurance } from '@/lib/order-utils'
import { useExpeditedFilter, isOrderExpedited, isOrderPersonalized } from '@/context/ExpeditedFilterContext'

interface OrderLog {
  id: string
  orderNumber: string
  status: string
  rawPayload: any
  suggestedBox?: {
    boxId: string | null
    boxName: string | null
    confidence: 'confirmed' | 'calculated' | 'unknown'
    reason?: string
  } | null
  createdAt: Date | string
  updatedAt: Date | string
}

export type QueueStatusBySignature = Record<string, 'pending' | 'in_queue' | 'completed'>

interface BulkOrdersTableProps {
  orders: OrderLog[]
  /** Status per bulk group signature: pending = not sent, in_queue = has PENDING batches, completed = all COMPLETED */
  queueStatusBySignature?: QueueStatusBySignature
}

interface BulkOrderGroup {
  signature: string
  items: Array<{
    sku: string
    name: string
    quantity: number
    size: string
    color: string
  }>
  orders: Array<{
    log: OrderLog
    order: any
    customerName: string
    orderDate: string
  }>
  totalOrders: number
}

interface ShippingRate {
  groupId: string
  price: string
  service: string
}

interface LabelInfo {
  carrier: string
  service: string
  packaging: string
  weight: string
  dimensions: {
    length: string
    width: string
    height: string
  }
}

type StatusFilter = 'all' | 'pending' | 'shipped'

export default function BulkOrdersTable({ orders, queueStatusBySignature = {} }: BulkOrdersTableProps) {
  const { expeditedOnly, hidePersonalized } = useExpeditedFilter()
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isBulkProcessDialogOpen, setIsBulkProcessDialogOpen] = useState(false)
  const [isPackageInfoDialogOpen, setIsPackageInfoDialogOpen] = useState(false)
  const [selectedGroup, setSelectedGroup] = useState<BulkOrderGroup | null>(null)
  const [packageInfo, setPackageInfo] = useState<PackageInfo | null>(null)
  const [shippingRates, setShippingRates] = useState<Map<string, ShippingRate>>(new Map())
  const [rateShoppingActive, setRateShoppingActive] = useState(false)
  const rateShoppingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const isFetchingRatesRef = useRef<boolean>(false)
  const [autoProcessEnabled, setAutoProcessEnabled] = useState(false)
  const [autoProcessThreshold, setAutoProcessThreshold] = useState<number>(2)
  const [isBatchPackageInfoDialogOpen, setIsBatchPackageInfoDialogOpen] = useState(false)
  const [sliderValue, setSliderValue] = useState<number>(2)
  const [sendToQueueLoading, setSendToQueueLoading] = useState(false)
  const [sendToQueueError, setSendToQueueError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending')
  const router = useRouter()

  // Group orders by identical product combinations
  const bulkGroups = useMemo(() => {
    const groupMap = new Map<string, BulkOrderGroup>()

    orders.forEach((log) => {
      // Global personalized filter (hide personalized by default)
      if (hidePersonalized && isOrderPersonalized(log.rawPayload)) {
        return
      }

      // Global expedited filter
      if (expeditedOnly) {
        const customerReachedOut = (log as any).customerReachedOut || false
        if (!isOrderExpedited(log.rawPayload, customerReachedOut)) {
          return
        }
      }

      const payload = log.rawPayload as any
      const order = Array.isArray(payload) ? payload[0] : payload
      const items = order?.items || []

      // Filter out shipping insurance items
      const nonInsuranceItems = items.filter(
        (item: any) => !isShippingInsurance(item.sku || '', item.name || '')
      )

      // Skip single-item orders (those belong in Singles)
      if (nonInsuranceItems.length <= 1) return

      // Create signature: sorted SKU:quantity pairs
      const signature = nonInsuranceItems
        .map((item: any) => `${item.sku || 'N/A'}:${item.quantity || 1}`)
        .sort()
        .join('|')

      if (!groupMap.has(signature)) {
        // Create group with item details
        const groupItems = nonInsuranceItems.map((item: any) => ({
          sku: item.sku || 'N/A',
          name: item.name || 'Unknown',
          quantity: item.quantity || 1,
          size: getSizeFromSku(item.sku || ''),
          color: getColorFromSku(item.sku || '', item.name),
        }))

        groupMap.set(signature, {
          signature,
          items: groupItems,
          orders: [],
          totalOrders: 0,
        })
      }

      const group = groupMap.get(signature)!
      const customerName = order?.shipTo?.name || order?.billTo?.name || 'Unknown'
      const orderDate = order?.orderDate || log.createdAt

      group.orders.push({
        log,
        order,
        customerName,
        orderDate: typeof orderDate === 'string' ? orderDate : orderDate.toISOString(),
      })
      group.totalOrders++
    })

    // Filter to only groups with 2+ orders and sort by count descending
    return Array.from(groupMap.values())
      .filter((group) => group.totalOrders >= 2)
      .sort((a, b) => b.totalOrders - a.totalOrders)
  }, [orders, hidePersonalized, expeditedOnly])

  // Filter groups by slider value
  const sliderFilteredGroups = useMemo(() => {
    return bulkGroups.filter(group => group.totalOrders >= sliderValue)
  }, [bulkGroups, sliderValue])

  // Filter groups for auto-processing (only those above threshold)
  const filteredBulkGroups = useMemo(() => {
    if (!autoProcessEnabled) return bulkGroups
    return bulkGroups.filter(group => group.totalOrders > autoProcessThreshold)
  }, [bulkGroups, autoProcessEnabled, autoProcessThreshold])

  // Get queue status for a group (pending = not sent, in_queue = has PENDING batches, completed = all COMPLETED)
  const getGroupStatus = (signature: string): 'pending' | 'in_queue' | 'completed' =>
    queueStatusBySignature[signature] ?? 'pending'

  // Filter by status: pending = not sent or in queue, shipped = all batches completed
  const displayGroups = useMemo(() => {
    const list = autoProcessEnabled ? filteredBulkGroups : sliderFilteredGroups
    if (statusFilter === 'all') return list
    if (statusFilter === 'pending') {
      return list.filter(g => {
        const s = queueStatusBySignature[g.signature] ?? 'pending'
        return s === 'pending' || s === 'in_queue'
      })
    }
    return list.filter(g => (queueStatusBySignature[g.signature] ?? 'pending') === 'completed')
  }, [autoProcessEnabled, filteredBulkGroups, sliderFilteredGroups, statusFilter, queueStatusBySignature])

  // Convert bulk groups to batches for BatchPackageInfoDialog
  interface BulkOrderBatch {
    id: string
    orders: Array<{
      log: OrderLog
      order: any
      mainItem: any
      size: string
      color: string
      customerName: string
      customerId?: string
      orderDate: string
      status: string
    }>
    size: string
    color: string
    label: string
  }

  const bulkOrderBatches = useMemo(() => {
    if (!autoProcessEnabled) return []
    
    return filteredBulkGroups.map((group, index) => {
      // Convert bulk group orders to the format expected by BatchPackageInfoDialog
      const batchOrders = group.orders.map(orderData => {
        const payload = orderData.log.rawPayload as any
        const order = Array.isArray(payload) ? payload[0] : payload
        const items = order?.items || []
        const mainItem = items.find((item: any) => !isShippingInsurance(item.sku || '', item.name || '')) || items[0]
        
        return {
          log: orderData.log,
          order,
          mainItem: mainItem || { sku: 'N/A', name: 'Unknown', quantity: 1 },
          size: getSizeFromSku(mainItem?.sku || ''),
          color: getColorFromSku(mainItem?.sku || '', mainItem?.name),
          customerName: orderData.customerName,
          customerId: orderData.customerName ? orderData.customerName.split(' ')[0] : undefined,
          orderDate: orderData.orderDate,
          status: orderData.log.status,
        }
      })

      // Create label from group items
      const itemLabels = group.items.map(item => `${item.sku}×${item.quantity}`).join(', ')
      const label = `Bulk ${index + 1}: ${itemLabels} (${group.totalOrders} orders)`

      return {
        id: group.signature,
        orders: batchOrders,
        size: group.items[0]?.size || 'Mixed',
        color: group.items[0]?.color || 'Mixed',
        label,
      } as BulkOrderBatch
    })
  }, [filteredBulkGroups, autoProcessEnabled])

  // Check if selected group has shipping rates
  const selectedGroupHasRates = useMemo(() => {
    if (!selectedGroup) return false
    if (rateShoppingActive) {
      const rate = shippingRates.get(selectedGroup.signature)
      return rate && rate.price && rate.service
    }
    return true
  }, [selectedGroup, shippingRates, rateShoppingActive])

  const handleRowClick = (group: BulkOrderGroup) => {
    // Show first order in dialog for now
    if (group.orders.length > 0) {
      const firstOrder = group.orders[0]
      setSelectedOrder({
        orderNumber: firstOrder.log.orderNumber,
        orderKey: firstOrder.log.orderNumber,
        ...firstOrder.order,
      })
      setIsDialogOpen(true)
    }
  }

  const handleCloseDialog = () => {
    setIsDialogOpen(false)
    setSelectedOrder(null)
  }

  const handleProcessClick = (group: BulkOrderGroup) => {
    setSelectedGroup(group)
    setIsBulkProcessDialogOpen(true)
  }

  // Mock function to simulate rate shopping API call
  const fetchShippingRate = async (group: BulkOrderGroup, packageInfo: PackageInfo): Promise<ShippingRate> => {
    await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000))

    const mockRates = [
      { carrier: 'USPS', service: 'First Class', price: (4.50 + Math.random() * 2).toFixed(2), days: 3 },
      { carrier: 'USPS', service: 'Priority Mail', price: (7.50 + Math.random() * 3).toFixed(2), days: 2 },
      { carrier: 'UPS', service: 'Ground', price: (8.00 + Math.random() * 4).toFixed(2), days: 5 },
      { carrier: 'UPS', service: '2nd Day Air', price: (15.00 + Math.random() * 5).toFixed(2), days: 2 },
      { carrier: 'FedEx', service: 'Ground', price: (9.00 + Math.random() * 4).toFixed(2), days: 4 },
      { carrier: 'FedEx', service: '2Day', price: (18.00 + Math.random() * 6).toFixed(2), days: 2 },
    ]

    let selectedRate: typeof mockRates[0] | undefined

    if (packageInfo.carrier === 'Rate Shopper - Cheapest') {
      selectedRate = mockRates.reduce((min, rate) =>
        parseFloat(rate.price) < parseFloat(min.price) ? rate : min
      )
    } else if (packageInfo.carrier === 'Rate Shopper - Fastest') {
      selectedRate = mockRates.reduce((fastest, rate) =>
        rate.days < fastest.days ? fastest : fastest
      )
    } else {
      selectedRate = mockRates.find(rate =>
        rate.carrier === packageInfo.carrier && rate.service === packageInfo.service
      )
      if (!selectedRate) {
        selectedRate = mockRates.find(rate => rate.carrier === packageInfo.carrier) || mockRates[0]
      }
    }

    return {
      groupId: group.signature,
      price: `$${selectedRate.price}`,
      service: `${selectedRate.carrier} ${selectedRate.service}`,
    }
  }

  const handleSavePackageInfo = (info: PackageInfo) => {
    setPackageInfo(info)

    if (!selectedGroup) return

    if (rateShoppingIntervalRef.current) {
      clearInterval(rateShoppingIntervalRef.current)
      rateShoppingIntervalRef.current = null
    }

    const isRateShoppingMode = !!info.carrier && !!info.packaging && !!info.weight && !!info.dimensions.length && !!info.dimensions.width && !!info.dimensions.height

    if (isRateShoppingMode) {
      setRateShoppingActive(true)

      const fetchRatesForGroup = async () => {
        if (isFetchingRatesRef.current) return

        isFetchingRatesRef.current = true

        try {
          const rate = await fetchShippingRate(selectedGroup, info)
          setShippingRates((prevRates) => {
            const updatedRates = new Map(prevRates)
            updatedRates.set(rate.groupId, rate)
            return updatedRates
          })
        } finally {
          isFetchingRatesRef.current = false
        }
      }

      fetchRatesForGroup()

      rateShoppingIntervalRef.current = setInterval(() => {
        fetchRatesForGroup()
      }, 3000)
    } else {
      if (rateShoppingIntervalRef.current) {
        clearInterval(rateShoppingIntervalRef.current)
        rateShoppingIntervalRef.current = null
      }
      setRateShoppingActive(false)
      setShippingRates(new Map())
    }
  }

  useEffect(() => {
    return () => {
      if (rateShoppingIntervalRef.current) {
        clearInterval(rateShoppingIntervalRef.current)
      }
    }
  }, [])

  const handleProceed = async () => {
    if (!selectedGroup || !packageInfo) return

    setSendToQueueError(null)
    setSendToQueueLoading(true)
    try {
      const res = await fetch('/api/bulk-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bulkGroupSignature: selectedGroup.signature,
          orderNumbers: selectedGroup.orders.map((o) => o.log.orderNumber),
          packageInfo: {
            carrier: packageInfo.carrier,
            service: packageInfo.service,
            packaging: packageInfo.packaging,
            weight: packageInfo.weight,
            dimensions: packageInfo.dimensions,
          },
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to send to queue')
      setIsBulkProcessDialogOpen(false)
      setSelectedGroup(null)
      setPackageInfo(null)
      router.refresh()
      if (typeof window !== 'undefined') window.alert(`Sent to queue: ${data.created} packer batch(es) created. Packers can verify and print from Bulk Verification.`)
    } catch (e: any) {
      setSendToQueueError(e?.message || 'Failed to send to queue')
    } finally {
      setSendToQueueLoading(false)
    }
  }

  const generatePickListAndLabels = (group: BulkOrderGroup, labelInfo: LabelInfo) => {
    // Aggregate items for pick list
    const itemMap = new Map<string, { sku: string; name: string; totalQty: number; size: string; color: string }>()
    
    group.orders.forEach(orderData => {
      const payload = orderData.log.rawPayload as any
      const order = Array.isArray(payload) ? payload[0] : payload
      const items = order?.items || []
      
      items.forEach((item: any) => {
        if (isShippingInsurance(item.sku || '', item.name || '')) return
        
        const sku = item.sku || 'N/A'
        const existing = itemMap.get(sku)
        const qty = item.quantity || 1
        
        if (existing) {
          existing.totalQty += qty * group.totalOrders // Multiply by number of orders
        } else {
          itemMap.set(sku, {
            sku,
            name: item.name || 'N/A',
            totalQty: qty * group.totalOrders,
            size: getSizeFromSku(sku),
            color: getColorFromSku(sku, item.name),
          })
        }
      })
    })
    
    const aggregatedItems = Array.from(itemMap.values())
    const totalItems = aggregatedItems.reduce((sum, item) => sum + item.totalQty, 0)

    // Generate tracking number helper
    const generateTrackingNumber = (orderNumber: string) => {
      const randomDigits = orderNumber.padStart(22, '0').slice(-22)
      return `420 ${randomDigits.slice(0, 5)} ${randomDigits.slice(5, 9)} ${randomDigits.slice(9, 13)} ${randomDigits.slice(13, 17)} ${randomDigits.slice(17, 21)} ${randomDigits.slice(21, 22)}`
    }

    const getServiceIndicator = (service: string) => {
      if (service.includes('Express')) return 'E'
      if (service.includes('Priority')) return 'P'
      if (service.includes('First Class')) return 'FC'
      return 'P'
    }

    const getServiceName = (service: string) => {
      if (service.includes('Express')) return 'USPS PRIORITY MAIL EXPRESS®'
      if (service.includes('Priority')) return 'USPS PRIORITY MAIL®'
      if (service.includes('First Class')) return 'USPS FIRST-CLASS MAIL®'
      return 'USPS PRIORITY MAIL®'
    }

    const getCurrentDate = () => {
      const now = new Date()
      const month = String(now.getMonth() + 1).padStart(2, '0')
      const day = String(now.getDate()).padStart(2, '0')
      const year = String(now.getFullYear()).slice(-2)
      return `${month}/${day}/${year}`
    }

    const pickListHTML = `
<!DOCTYPE html>
<html>
<head>
  <title>Pick List & Shipping Labels</title>
  <style>
    @page {
      size: 4in 6in;
      margin: 0;
    }
    * {
      color: #000 !important;
    }
    .usps-service-banner {
      background: #000 !important;
      color: #fff !important;
    }
    body { 
      font-family: Arial, Helvetica, sans-serif; 
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .page {
      width: 4in;
      height: 6in;
      padding: 8px;
      box-sizing: border-box;
      page-break-after: always;
      page-break-inside: avoid;
      border: 1px solid #000;
    }
    .label { 
      width: 100%;
      height: 100%;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .pick-label {
      border: 2px solid #000;
      padding: 10px;
    }
    .pick-label-header {
      font-weight: bold;
      font-size: 18px;
      text-align: center;
      border-bottom: 2px solid #000;
      padding-bottom: 6px;
      margin-bottom: 8px;
    }
    .pick-label-content {
      font-size: 11px;
      line-height: 1.4;
      flex: 1;
      display: flex;
      flex-direction: column;
    }
    .pick-list-item {
      margin-bottom: 8px;
      padding-bottom: 6px;
      border-bottom: 1px solid #000;
    }
    .pick-list-item:last-child {
      border-bottom: none;
    }
    .sample-order-label {
      border: 2px solid #000;
      padding: 20px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
    }
    .sample-order-header {
      font-size: 48px;
      font-weight: bold;
      margin-bottom: 30px;
      letter-spacing: 4px;
    }
    .sample-order-items {
      width: 100%;
      margin-top: 20px;
    }
    .sample-order-item {
      margin-bottom: 15px;
      padding-bottom: 15px;
      border-bottom: 2px solid #000;
    }
    .sample-order-item:last-child {
      border-bottom: none;
    }
    .usps-label {
      border: 2px solid #000;
      padding: 0;
      position: relative;
      height: 100%;
      width: 100%;
    }
    .usps-top-left {
      position: absolute;
      top: 6px;
      left: 6px;
      font-size: 9px;
      line-height: 1.2;
    }
    .usps-service-indicator-large {
      font-size: 48px;
      font-weight: bold;
      line-height: 1;
      margin-bottom: 2px;
    }
    .usps-date-from {
      font-size: 8px;
      margin-top: 2px;
    }
    .usps-top-right {
      position: absolute;
      top: 6px;
      right: 6px;
      text-align: right;
      font-size: 8px;
      line-height: 1.3;
      max-width: 1.2in;
    }
    .usps-postage-paid {
      font-weight: bold;
      margin-bottom: 2px;
    }
    .usps-2d-barcode {
      border: 1px solid #000;
      width: 0.8in;
      height: 0.8in;
      margin: 4px auto;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 6px;
      font-family: 'Courier New', monospace;
    }
    .usps-service-banner {
      position: absolute;
      top: 0.5in;
      left: 0;
      right: 0;
      text-align: center;
      font-size: 12px;
      font-weight: bold;
      padding: 3px 0;
      letter-spacing: 0.5px;
    }
    .usps-sender-address {
      position: absolute;
      top: 0.75in;
      left: 0.5in;
      font-size: 9px;
      line-height: 1.3;
      max-width: 2in;
    }
    .usps-ship-to-label {
      position: absolute;
      top: 1.3in;
      left: 0.5in;
      font-size: 8px;
      font-weight: bold;
      margin-bottom: 2px;
    }
    .usps-delivery-address {
      position: absolute;
      top: 1.45in;
      left: 0.5in;
      font-size: 11px;
      line-height: 1.4;
      font-weight: bold;
      max-width: 2.5in;
    }
    .usps-delivery-name {
      font-size: 12px;
      margin-bottom: 2px;
    }
    .usps-delivery-street {
      margin-bottom: 1px;
    }
    .usps-delivery-city-state {
      margin-top: 2px;
    }
    .usps-barcode-section {
      position: absolute;
      bottom: 0.6in;
      left: 0.2in;
      right: 0.2in;
    }
    .usps-barcode-label {
      font-size: 7px;
      margin-bottom: 2px;
      text-align: center;
    }
    .usps-linear-barcode {
      border: 2px solid #000;
      height: 0.5in;
      margin: 2px 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: repeating-linear-gradient(
        90deg,
        #000 0px,
        #000 2px,
        transparent 2px,
        transparent 4px
      );
      background-size: 4px 100%;
    }
    .usps-tracking-number {
      font-family: 'Courier New', monospace;
      font-size: 9px;
      text-align: center;
      margin-top: 2px;
      font-weight: bold;
      letter-spacing: 0.5px;
    }
    .usps-footer {
      position: absolute;
      bottom: 0.1in;
      left: 0.2in;
      right: 0.2in;
      font-size: 7px;
      text-align: center;
      border-top: 1px solid #000;
      padding-top: 2px;
    }
    @media print {
      .page {
        page-break-after: always;
      }
      .label {
        page-break-inside: avoid;
      }
      * {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
  </style>
</head>
<body>
  <!-- Single Pick List for All Orders -->
  <div class="page">
    <div class="label pick-label">
      <div class="pick-label-header">PICK LIST</div>
      <div class="pick-label-content">
        <div style="font-size: 18px; font-weight: bold; text-align: center; margin-bottom: 10px;">
          Total Orders: ${group.totalOrders}
        </div>
        <div style="font-size: 16px; font-weight: bold; text-align: center; margin-bottom: 12px;">
          Total Items: ${totalItems}
        </div>
        ${aggregatedItems.map(item => `
          <div class="pick-list-item">
            <div style="font-weight: bold; font-size: 13px; margin-bottom: 4px;">
              <span style="font-family: monospace;">${item.sku}</span>
            </div>
            <div style="font-size: 11px; margin-bottom: 2px;">
              ${item.name}
            </div>
            <div style="font-size: 10px; margin-bottom: 4px;">
              Size: ${item.size} | Color: ${item.color}
            </div>
            <div style="font-size: 16px; font-weight: bold; text-align: center;">
              Qty: ${item.totalQty}
            </div>
          </div>
        `).join('')}
        <div style="margin-top: auto; border-top: 2px solid #000; padding-top: 6px; font-size: 10px;">
          <strong>Shipping Info:</strong><br>
          ${labelInfo.carrier} ${labelInfo.service} | ${labelInfo.packaging}<br>
          ${labelInfo.weight} lbs | ${labelInfo.dimensions.length}"×${labelInfo.dimensions.width}"×${labelInfo.dimensions.height}"
        </div>
      </div>
    </div>
  </div>
  
  <!-- SAMPLE ORDER Page (Second Page) -->
  <div class="page">
    <div class="label sample-order-label">
      <div class="sample-order-header">SAMPLE ORDER</div>
      <div class="sample-order-items">
        <div style="font-size: 14px; font-weight: bold; margin-bottom: 20px; text-align: center;">
          Items in each order:
        </div>
        ${group.items.map(item => `
          <div class="sample-order-item">
            <div style="font-weight: bold; font-size: 18px; margin-bottom: 8px;">
              <span style="font-family: monospace;">${item.sku}</span>
            </div>
            <div style="font-size: 14px; margin-bottom: 6px;">
              ${item.name}
            </div>
            <div style="font-size: 12px; margin-bottom: 8px;">
              Size: ${item.size} | Color: ${item.color}
            </div>
            <div style="font-size: 24px; font-weight: bold; text-align: center;">
              Qty: ${item.quantity}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  </div>
  
  <!-- Shipping Labels for Each Order -->
  ${group.orders.map((orderData) => {
    const payload = orderData.log.rawPayload as any
    const order = Array.isArray(payload) ? payload[0] : payload
    const shipTo = order?.shipTo || {}
    const billTo = order?.billTo || {}
    const trackingNumber = generateTrackingNumber(orderData.log.orderNumber)
    const serviceIndicator = getServiceIndicator(labelInfo.service)
    
    const senderName = billTo.name || 'Your Company'
    const senderCompany = billTo.company || ''
    const senderStreet = billTo.street1 || '123 Main Street'
    const senderCity = billTo.city || 'City'
    const senderState = billTo.state || 'ST'
    const senderZip = billTo.postalCode || '12345'
    const fromZip = senderZip.slice(0, 5) || '12345'
    
    const recipientName = shipTo.name || 'N/A'
    const recipientCompany = shipTo.company || ''
    const recipientStreet1 = shipTo.street1 || ''
    const recipientStreet2 = shipTo.street2 || ''
    const recipientCity = shipTo.city || ''
    const recipientState = shipTo.state || ''
    const recipientZip = shipTo.postalCode || ''
    
    const currentDate = getCurrentDate()
    const serviceName = getServiceName(labelInfo.service)
    const identifier = orderData.log.orderNumber.padStart(15, '0').slice(-15)
    const approvalNumber = orderData.log.orderNumber.padStart(9, '0').slice(-9)
    
    return `
  <div class="page">
    <div class="label usps-label">
      <div class="usps-top-left">
        <div class="usps-service-indicator-large">${serviceIndicator}</div>
        <div class="usps-date-from">${currentDate}</div>
        <div class="usps-date-from">From ${fromZip}</div>
      </div>
      <div class="usps-top-right">
        <div class="usps-postage-paid">US POSTAGE PAID</div>
        <div>${labelInfo.carrier}</div>
        <div>${labelInfo.packaging}</div>
        <div class="usps-2d-barcode">
          <div>2D<br>BARCODE</div>
        </div>
        <div style="font-family: 'Courier New', monospace; font-size: 7px; margin-top: 2px;">${identifier}</div>
      </div>
      <div class="usps-service-banner">
        ${serviceName}
      </div>
      <div class="usps-sender-address">
        ${senderName}<br>
        ${senderCompany ? senderCompany + '<br>' : ''}${senderStreet}<br>
        ${senderCity} ${senderState} ${senderZip}
      </div>
      <div class="usps-ship-to-label">SHIP TO:</div>
      <div class="usps-delivery-address">
        <div class="usps-delivery-name">${recipientName}</div>
        ${recipientCompany ? `<div class="usps-delivery-street">${recipientCompany}</div>` : ''}
        ${recipientStreet1 ? `<div class="usps-delivery-street">${recipientStreet1}</div>` : ''}
        ${recipientStreet2 ? `<div class="usps-delivery-street">${recipientStreet2}</div>` : ''}
        <div class="usps-delivery-city-state">
          ${recipientCity}${recipientState ? ` ${recipientState}` : ''} ${recipientZip}
        </div>
      </div>
      <div class="usps-barcode-section">
        <div class="usps-barcode-label">ZIP - e/ ${labelInfo.carrier} ${labelInfo.service.toUpperCase()}</div>
        <div class="usps-linear-barcode"></div>
        <div class="usps-tracking-number">${trackingNumber}</div>
      </div>
      <div class="usps-footer">
        Electronic Rate Approved #${approvalNumber} | Order: ${orderData.log.orderNumber} | ${labelInfo.weight} lbs
      </div>
    </div>
  </div>
    `
  }).join('')}
</body>
</html>
    `

    const printWindow = window.open('', '_blank')
    if (printWindow) {
      printWindow.document.write(pickListHTML)
      printWindow.document.close()
      setTimeout(() => {
        printWindow.print()
      }, 250)
    }
  }

  const generatePickListAndLabelsForBatches = (batchLabels: Array<{ batch: BulkOrderBatch; group: BulkOrderGroup; labelInfo: LabelInfo }>) => {
    // Helper functions
    const generateTrackingNumber = (orderNumber: string) => {
      const randomDigits = orderNumber.padStart(22, '0').slice(-22)
      return `420 ${randomDigits.slice(0, 5)} ${randomDigits.slice(5, 9)} ${randomDigits.slice(9, 13)} ${randomDigits.slice(13, 17)} ${randomDigits.slice(17, 21)} ${randomDigits.slice(21, 22)}`
    }

    const getServiceIndicator = (service: string) => {
      if (service.includes('Express')) return 'E'
      if (service.includes('Priority')) return 'P'
      if (service.includes('First Class')) return 'FC'
      return 'P'
    }

    const getServiceName = (service: string) => {
      if (service.includes('Express')) return 'USPS PRIORITY MAIL EXPRESS®'
      if (service.includes('Priority')) return 'USPS PRIORITY MAIL®'
      if (service.includes('First Class')) return 'USPS FIRST-CLASS MAIL®'
      return 'USPS PRIORITY MAIL®'
    }

    const getCurrentDate = () => {
      const now = new Date()
      const month = String(now.getMonth() + 1).padStart(2, '0')
      const day = String(now.getDate()).padStart(2, '0')
      const year = String(now.getFullYear()).slice(-2)
      return `${month}/${day}/${year}`
    }

    // Build HTML for all batches
    let htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <title>Pick List & Shipping Labels - Bulk Auto Process</title>
  <style>
    @page {
      size: 4in 6in;
      margin: 0;
    }
    * {
      color: #000 !important;
    }
    .usps-service-banner {
      background: #000 !important;
      color: #fff !important;
    }
    body { 
      font-family: Arial, Helvetica, sans-serif; 
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .page {
      width: 4in;
      height: 6in;
      padding: 8px;
      box-sizing: border-box;
      page-break-after: always;
      page-break-inside: avoid;
      border: 1px solid #000;
    }
    .label { 
      width: 100%;
      height: 100%;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .pick-label {
      border: 2px solid #000;
      padding: 10px;
    }
    .pick-label-header {
      font-weight: bold;
      font-size: 20px;
      text-align: center;
      border-top: 4px solid #000;
      border-bottom: 4px solid #000;
      padding: 10px 0;
      margin-bottom: 12px;
      background: #f0f0f0;
    }
    .pick-label-content {
      font-size: 11px;
      line-height: 1.4;
      flex: 1;
      display: flex;
      flex-direction: column;
    }
    .pick-list-item {
      margin-bottom: 8px;
      padding-bottom: 6px;
      border-bottom: 1px solid #000;
    }
    .pick-list-item:last-child {
      border-bottom: none;
    }
    .sample-order-label {
      border: 2px solid #000;
      padding: 20px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
    }
    .sample-order-header {
      font-size: 48px;
      font-weight: bold;
      margin-bottom: 30px;
      letter-spacing: 4px;
    }
    .sample-order-items {
      width: 100%;
      margin-top: 20px;
    }
    .sample-order-item {
      margin-bottom: 15px;
      padding-bottom: 15px;
      border-bottom: 2px solid #000;
    }
    .sample-order-item:last-child {
      border-bottom: none;
    }
    .usps-label {
      border: 2px solid #000;
      padding: 0;
      position: relative;
      height: 100%;
      width: 100%;
    }
    .usps-top-left {
      position: absolute;
      top: 6px;
      left: 6px;
      font-size: 9px;
      line-height: 1.2;
    }
    .usps-service-indicator-large {
      font-size: 48px;
      font-weight: bold;
      line-height: 1;
      margin-bottom: 2px;
    }
    .usps-date-from {
      font-size: 8px;
      margin-top: 2px;
    }
    .usps-top-right {
      position: absolute;
      top: 6px;
      right: 6px;
      text-align: right;
      font-size: 8px;
      line-height: 1.3;
      max-width: 1.2in;
    }
    .usps-postage-paid {
      font-weight: bold;
      margin-bottom: 2px;
    }
    .usps-2d-barcode {
      border: 1px solid #000;
      width: 0.8in;
      height: 0.8in;
      margin: 4px auto;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 6px;
      font-family: 'Courier New', monospace;
    }
    .usps-service-banner {
      position: absolute;
      top: 0.5in;
      left: 0;
      right: 0;
      background: #000;
      color: #fff;
      text-align: center;
      font-size: 12px;
      font-weight: bold;
      padding: 3px 0;
      letter-spacing: 0.5px;
    }
    .usps-sender-address {
      position: absolute;
      top: 0.75in;
      left: 0.5in;
      font-size: 9px;
      line-height: 1.3;
      max-width: 2in;
    }
    .usps-ship-to-label {
      position: absolute;
      top: 1.3in;
      left: 0.5in;
      font-size: 8px;
      font-weight: bold;
      margin-bottom: 2px;
    }
    .usps-delivery-address {
      position: absolute;
      top: 1.45in;
      left: 0.5in;
      font-size: 11px;
      line-height: 1.4;
      font-weight: bold;
      max-width: 2.5in;
    }
    .usps-delivery-name {
      font-size: 12px;
      margin-bottom: 2px;
    }
    .usps-delivery-street {
      margin-bottom: 1px;
    }
    .usps-delivery-city-state {
      margin-top: 2px;
    }
    .usps-barcode-section {
      position: absolute;
      bottom: 0.6in;
      left: 0.2in;
      right: 0.2in;
    }
    .usps-barcode-label {
      font-size: 7px;
      margin-bottom: 2px;
      text-align: center;
    }
    .usps-linear-barcode {
      border: 2px solid #000;
      height: 0.5in;
      margin: 2px 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: repeating-linear-gradient(
        90deg,
        #000 0px,
        #000 2px,
        transparent 2px,
        transparent 4px
      );
      background-size: 4px 100%;
    }
    .usps-tracking-number {
      font-family: 'Courier New', monospace;
      font-size: 9px;
      text-align: center;
      margin-top: 2px;
      font-weight: bold;
      letter-spacing: 0.5px;
    }
    .usps-footer {
      position: absolute;
      bottom: 0.1in;
      left: 0.2in;
      right: 0.2in;
      font-size: 7px;
      text-align: center;
      border-top: 1px solid #000;
      padding-top: 2px;
    }
    @media print {
      .page {
        page-break-after: always;
      }
      .label {
        page-break-inside: avoid;
      }
      * {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
  </style>
</head>
<body>
`

    // Process each batch
    batchLabels.forEach(({ batch, group, labelInfo }) => {
      // Aggregate items for pick list
      const itemMap = new Map<string, { sku: string; name: string; totalQty: number; size: string; color: string }>()
      
      group.orders.forEach(orderData => {
        const payload = orderData.log.rawPayload as any
        const order = Array.isArray(payload) ? payload[0] : payload
        const items = order?.items || []
        
        items.forEach((item: any) => {
          if (isShippingInsurance(item.sku || '', item.name || '')) return
          
          const sku = item.sku || 'N/A'
          const existing = itemMap.get(sku)
          const qty = item.quantity || 1
          
          if (existing) {
            existing.totalQty += qty * group.totalOrders
          } else {
            itemMap.set(sku, {
              sku,
              name: item.name || 'N/A',
              totalQty: qty * group.totalOrders,
              size: getSizeFromSku(sku),
              color: getColorFromSku(sku, item.name),
            })
          }
        })
      })
      
      const aggregatedItems = Array.from(itemMap.values())
      const totalItems = aggregatedItems.reduce((sum, item) => sum + item.totalQty, 0)

      // Pick list for this batch (serves as divider)
      htmlContent += `
  <div class="page">
    <div class="label pick-label">
      <div class="pick-label-header">
        <div style="font-size: 24px; margin-bottom: 4px;">════════════════</div>
        <div style="font-size: 22px;">PICK LIST - ${batch.label}</div>
        <div style="font-size: 24px; margin-top: 4px;">════════════════</div>
      </div>
      <div class="pick-label-content">
        <div style="font-size: 18px; font-weight: bold; text-align: center; margin-bottom: 10px;">
          Total Orders: ${group.totalOrders}
        </div>
        <div style="font-size: 16px; font-weight: bold; text-align: center; margin-bottom: 12px;">
          Total Items: ${totalItems}
        </div>
        ${aggregatedItems.map(item => `
          <div class="pick-list-item">
            <div style="font-weight: bold; font-size: 13px; margin-bottom: 4px;">
              <span style="font-family: monospace;">${item.sku}</span>
            </div>
            <div style="font-size: 11px; margin-bottom: 2px;">
              ${item.name}
            </div>
            <div style="font-size: 10px; margin-bottom: 4px;">
              Size: ${item.size} | Color: ${item.color}
            </div>
            <div style="font-size: 16px; font-weight: bold; text-align: center;">
              Qty: ${item.totalQty}
            </div>
          </div>
        `).join('')}
        <div style="margin-top: auto; border-top: 2px solid #000; padding-top: 6px; font-size: 10px;">
          <strong>Shipping Info:</strong><br>
          ${labelInfo.carrier} ${labelInfo.service} | ${labelInfo.packaging}<br>
          ${labelInfo.weight} lbs | ${labelInfo.dimensions.length}"×${labelInfo.dimensions.width}"×${labelInfo.dimensions.height}"
        </div>
      </div>
    </div>
  </div>
  
  <!-- SAMPLE ORDER Page (Second Page) -->
  <div class="page">
    <div class="label sample-order-label">
      <div class="sample-order-header">SAMPLE ORDER</div>
      <div class="sample-order-items">
        <div style="font-size: 14px; font-weight: bold; margin-bottom: 20px; text-align: center;">
          Items in each order:
        </div>
        ${group.items.map(item => `
          <div class="sample-order-item">
            <div style="font-weight: bold; font-size: 18px; margin-bottom: 8px;">
              <span style="font-family: monospace;">${item.sku}</span>
            </div>
            <div style="font-size: 14px; margin-bottom: 6px;">
              ${item.name}
            </div>
            <div style="font-size: 12px; margin-bottom: 8px;">
              Size: ${item.size} | Color: ${item.color}
            </div>
            <div style="font-size: 24px; font-weight: bold; text-align: center;">
              Qty: ${item.quantity}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  </div>
      `

      // Shipping labels for all orders in this batch
      group.orders.forEach((orderData) => {
        const payload = orderData.log.rawPayload as any
        const order = Array.isArray(payload) ? payload[0] : payload
        const shipTo = order?.shipTo || {}
        const billTo = order?.billTo || {}
        const trackingNumber = generateTrackingNumber(orderData.log.orderNumber)
        const serviceIndicator = getServiceIndicator(labelInfo.service)
        
        const senderName = billTo.name || 'John Smith'
        const senderCompany = billTo.company || 'Your Company'
        const senderStreet = billTo.street1 || '123 Main Street'
        const senderCity = billTo.city || 'City'
        const senderState = billTo.state || 'ST'
        const senderZip = billTo.postalCode || '12345'
        const fromZip = senderZip.slice(0, 5) || '12345'
        
        const recipientName = shipTo.name || 'N/A'
        const recipientCompany = shipTo.company || ''
        const recipientStreet1 = shipTo.street1 || ''
        const recipientStreet2 = shipTo.street2 || ''
        const recipientCity = shipTo.city || ''
        const recipientState = shipTo.state || ''
        const recipientZip = shipTo.postalCode || ''
        
        const currentDate = getCurrentDate()
        const serviceName = getServiceName(labelInfo.service)
        const identifier = orderData.log.orderNumber.padStart(15, '0').slice(-15)
        const approvalNumber = orderData.log.orderNumber.padStart(9, '0').slice(-9)
        
        htmlContent += `
  <div class="page">
    <div class="label usps-label">
      <div class="usps-top-left">
        <div class="usps-service-indicator-large">${serviceIndicator}</div>
        <div class="usps-date-from">${currentDate}</div>
        <div class="usps-date-from">From ${fromZip}</div>
      </div>
      
      <div class="usps-top-right">
        <div class="usps-postage-paid">US POSTAGE PAID</div>
        <div>${labelInfo.carrier}</div>
        <div>${labelInfo.packaging}</div>
        <div class="usps-2d-barcode">
          <div>2D<br>BARCODE</div>
        </div>
        <div style="font-family: 'Courier New', monospace; font-size: 7px; margin-top: 2px;">${identifier}</div>
      </div>
      
      <div class="usps-service-banner">
        ${serviceName}
      </div>
      
      <div class="usps-sender-address">
        ${senderName}<br>
        ${senderCompany ? senderCompany + '<br>' : ''}${senderStreet}<br>
        ${senderCity} ${senderState} ${senderZip}
      </div>
      
      <div class="usps-ship-to-label">SHIP TO:</div>
      
      <div class="usps-delivery-address">
        <div class="usps-delivery-name">${recipientName}</div>
        ${recipientCompany ? `<div class="usps-delivery-street">${recipientCompany}</div>` : ''}
        ${recipientStreet1 ? `<div class="usps-delivery-street">${recipientStreet1}</div>` : ''}
        ${recipientStreet2 ? `<div class="usps-delivery-street">${recipientStreet2}</div>` : ''}
        <div class="usps-delivery-city-state">
          ${recipientCity}${recipientState ? ` ${recipientState}` : ''} ${recipientZip}
        </div>
      </div>
      
      <div class="usps-barcode-section">
        <div class="usps-barcode-label">ZIP - e/ ${labelInfo.carrier} ${labelInfo.service.toUpperCase()}</div>
        <div class="usps-linear-barcode"></div>
        <div class="usps-tracking-number">${trackingNumber}</div>
      </div>
      
      <div class="usps-footer">
        Electronic Rate Approved #${approvalNumber} | Order: ${orderData.log.orderNumber} | ${labelInfo.weight} lbs
      </div>
    </div>
  </div>
        `
      })
    })

    htmlContent += `
</body>
</html>
    `

    // Open in new window for printing/saving as PDF
    const printWindow = window.open('', '_blank')
    if (printWindow) {
      printWindow.document.write(htmlContent)
      printWindow.document.close()
      setTimeout(() => {
        printWindow.print()
      }, 250)
    }
  }

  if (bulkGroups.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-12 text-center">
        <p className="text-gray-500 text-lg">No bulk orders found</p>
        <p className="text-gray-400 text-sm mt-2">
          Bulk orders are groups of 2+ orders with identical products
        </p>
      </div>
    )
  }

  const totalBulkOrders = bulkGroups.reduce((sum, group) => sum + group.totalOrders, 0)

  const handleBatchProceed = async (batchPackageInfo: Map<string, PackageInfo>) => {
    const batchLabels: Array<{ batch: BulkOrderBatch; group: BulkOrderGroup; labelInfo: LabelInfo }> = []
    bulkOrderBatches.forEach(batch => {
      const info = batchPackageInfo.get(batch.id)
      const group = filteredBulkGroups.find(g => g.signature === batch.id)
      if (info && group) {
        batchLabels.push({
          batch,
          group,
          labelInfo: {
            carrier: info.carrier,
            service: info.service,
            packaging: info.packaging,
            weight: info.weight,
            dimensions: info.dimensions,
          },
        })
      }
    })
    setSendToQueueError(null)
    setSendToQueueLoading(true)
    try {
      let totalCreated = 0
      for (const { group, labelInfo } of batchLabels) {
        const res = await fetch('/api/bulk-queue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bulkGroupSignature: group.signature,
            orderNumbers: group.orders.map((o) => o.log.orderNumber),
            packageInfo: {
              carrier: labelInfo.carrier,
              service: labelInfo.service,
              packaging: labelInfo.packaging,
              weight: labelInfo.weight,
              dimensions: labelInfo.dimensions,
            },
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to send to queue')
        totalCreated += data.created ?? 0
      }
      setIsBatchPackageInfoDialogOpen(false)
      router.refresh()
      if (typeof window !== 'undefined') window.alert(`Sent to queue: ${totalCreated} packer batch(es) created. Packers can verify and print from Bulk Verification.`)
    } catch (e: any) {
      setSendToQueueError(e?.message || 'Failed to send to queue')
    } finally {
      setSendToQueueLoading(false)
    }
  }

  return (
    <>
      {/* Status filter: Pending shipment / Shipped */}
      <div className="mb-4 bg-white rounded-lg shadow p-4">
        <div className="flex flex-wrap items-center gap-6">
          <span className="text-sm font-medium text-gray-700">Status:</span>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="statusFilter"
              checked={statusFilter === 'pending'}
              onChange={() => setStatusFilter('pending')}
              className="w-4 h-4 text-green-600 focus:ring-green-500"
            />
            <span className="text-sm text-gray-700">Pending shipment</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="statusFilter"
              checked={statusFilter === 'shipped'}
              onChange={() => setStatusFilter('shipped')}
              className="w-4 h-4 text-green-600 focus:ring-green-500"
            />
            <span className="text-sm text-gray-700">Shipped</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="statusFilter"
              checked={statusFilter === 'all'}
              onChange={() => setStatusFilter('all')}
              className="w-4 h-4 text-green-600 focus:ring-green-500"
            />
            <span className="text-sm text-gray-700">All</span>
          </label>
        </div>
      </div>

      {/* Auto Process Section */}
      <div className="mb-4 bg-white rounded-lg shadow p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoProcessEnabled}
                onChange={(e) => setAutoProcessEnabled(e.target.checked)}
                className="w-5 h-5 text-green-600 rounded focus:ring-green-500"
              />
              <span className="text-sm font-medium text-gray-700">Auto Process</span>
            </label>
            {autoProcessEnabled && (
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">Threshold:</label>
                <input
                  type="number"
                  min="2"
                  value={autoProcessThreshold}
                  onChange={(e) => setAutoProcessThreshold(parseInt(e.target.value) || 2)}
                  className="w-20 px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                />
                <span className="text-sm text-gray-600">orders per group</span>
              </div>
            )}
          </div>
          {autoProcessEnabled && bulkOrderBatches.length > 0 && (
            <button
              onClick={() => setIsBatchPackageInfoDialogOpen(true)}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium flex items-center gap-2"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              Process All Groups ({bulkOrderBatches.length})
            </button>
          )}
        </div>
      </div>

      {/* Bulk Order Total */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold text-gray-900">
            Bulk Order Total: {displayGroups.reduce((sum, g) => sum + g.totalOrders, 0)}+
            <span className="ml-2 text-sm font-normal text-gray-500">
              ({displayGroups.length} group{displayGroups.length !== 1 ? 's' : ''} shown)
            </span>
          </h2>
        </div>
        <div className="relative">
          <input
            type="range"
            min="2"
            max="50"
            value={sliderValue}
            onChange={(e) => setSliderValue(parseInt(e.target.value))}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, #16a34a 0%, #16a34a ${((sliderValue - 2) / 48) * 100}%, #e5e7eb ${((sliderValue - 2) / 48) * 100}%, #e5e7eb 100%)`
            }}
          />
          <style jsx>{`
            input[type="range"]::-webkit-slider-thumb {
              appearance: none;
              width: 18px;
              height: 18px;
              border-radius: 50%;
              background: #16a34a;
              cursor: pointer;
              border: 2px solid #fff;
              box-shadow: 0 2px 4px rgba(0,0,0,0.2);
            }
            input[type="range"]::-moz-range-thumb {
              width: 18px;
              height: 18px;
              border-radius: 50%;
              background: #16a34a;
              cursor: pointer;
              border: 2px solid #fff;
              box-shadow: 0 2px 4px rgba(0,0,0,0.2);
            }
            input[type="range"]:hover::-webkit-slider-thumb {
              background: #15803d;
            }
            input[type="range"]:hover::-moz-range-thumb {
              background: #15803d;
            }
          `}</style>
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>2</span>
            <span className="font-medium text-gray-700">Min: {sliderValue}</span>
            <span>50+</span>
          </div>
        </div>
      </div>

      {/* Bulk Orders Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Bulk Order
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Items
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Orders
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Box
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Shipping Service
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {displayGroups.map((group, index) => {
                const rate = shippingRates.get(group.signature)
                const queueStatus = getGroupStatus(group.signature)
                const statusLabel =
                  queueStatus === 'pending'
                    ? 'Ready to process'
                    : queueStatus === 'in_queue'
                      ? 'Processed (in queue)'
                      : 'Shipped'
                const statusBadge =
                  queueStatus === 'pending'
                    ? 'bg-amber-100 text-amber-800'
                    : queueStatus === 'in_queue'
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-gray-100 text-gray-700'
                return (
                  <tr
                    key={group.signature}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => handleRowClick(group)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        Bulk Order {index + 1}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">
                        {group.items.map((item, idx) => (
                          <div key={idx} className="flex items-center gap-2 mb-1">
                            <div className="w-2 h-2 bg-green-500 rounded-full" />
                            <span className="font-mono text-xs">{item.sku}</span>
                            <span className="text-gray-600">× {item.quantity}</span>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          {group.totalOrders} orders
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusBadge}`}>
                        {statusLabel}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {(() => {
                        // Use the first order's cached suggestion (all orders in group have same items)
                        const suggestion = group.orders[0]?.log.suggestedBox
                        if (!suggestion) return <span className="text-sm text-gray-400">—</span>
                        if (!suggestion.boxName) {
                          return <span className="text-sm text-red-600 font-medium">No fit</span>
                        }
                        const colorClass = suggestion.confidence === 'confirmed'
                          ? 'text-green-600'
                          : suggestion.confidence === 'calculated'
                          ? 'text-amber-600'
                          : 'text-red-600'
                        return (
                          <span className={`text-sm font-medium ${colorClass}`}>
                            {suggestion.boxName}
                          </span>
                        )
                      })()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        {rate && rate.service && rate.price ? (
                          <div className="w-3 h-3 bg-green-500 rounded-full" title={rate.service} />
                        ) : (
                          <div className="w-3 h-3 bg-red-500 rounded-full" title="No service set" />
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      {queueStatus === 'pending' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleProcessClick(group)
                          }}
                          className="px-4 py-2 rounded-lg transition-colors bg-green-600 text-white hover:bg-green-700"
                        >
                          Process Orders
                        </button>
                      )}
                      {queueStatus === 'in_queue' && (
                        <span className="text-sm text-blue-600 font-medium">In Bulk Verification</span>
                      )}
                      {queueStatus === 'completed' && (
                        <span className="text-sm text-gray-600">Shipped</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <OrderDialog
        isOpen={isDialogOpen}
        onClose={handleCloseDialog}
        order={selectedOrder}
      />
      <BulkOrderProcessDialog
        isOpen={isBulkProcessDialogOpen}
        onClose={() => {
          setIsBulkProcessDialogOpen(false)
          setSelectedGroup(null)
          setSendToQueueError(null)
        }}
        group={selectedGroup}
        onProceed={handleProceed}
        shippingRate={selectedGroup ? shippingRates.get(selectedGroup.signature) : undefined}
        onSavePackageInfo={handleSavePackageInfo}
        sendToQueueLoading={sendToQueueLoading}
        sendToQueueError={sendToQueueError}
      />

      <BatchPackageInfoDialog
        isOpen={isBatchPackageInfoDialogOpen}
        onClose={() => setIsBatchPackageInfoDialogOpen(false)}
        batches={bulkOrderBatches as any}
        onProceed={handleBatchProceed}
      />
    </>
  )
}

