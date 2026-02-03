'use client'

import { useState, useMemo, useEffect } from 'react'
import OrderDialog from './OrderDialog'
import ProcessDialog from './ProcessDialog'
import BatchPackageInfoDialog from './BatchPackageInfoDialog'
import { getSizeFromSku, getColorFromSku, isShippingInsurance } from '@/lib/order-utils'
import { useExpeditedFilter, isOrderExpedited, isOrderPersonalized } from '@/context/ExpeditedFilterContext'
import { useOrders } from '@/context/OrdersContext'

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
  // Rate shopping fields (assigned at ingestion for singles)
  orderType?: string | null
  shippedWeight?: number | null
  preShoppedRate?: {
    carrierId: string
    carrierCode: string
    carrier: string
    serviceCode: string
    serviceName: string
    price: number
    currency: string
    deliveryDays: number | null
    rateId?: string
  } | null
  rateShopStatus?: string | null
  rateShopError?: string | null
  createdAt: Date | string
  updatedAt: Date | string
}

interface SinglesOrdersTableProps {
  orders: OrderLog[]
}

interface ProcessedOrder {
  log: OrderLog
  order: any
  mainItem: any
  size: string
  color: string
  customerName: string
  customerId?: string
  orderDate: string
  status: string
}

function formatCurrency(amount: number | string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(amount))
}

// LabelInfo interface for PDF generation
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

interface CarrierService {
  carrierId: string
  carrierCode: string
  carrierName: string
  serviceCode: string
  serviceName: string
}

export default function SinglesOrdersTable({ orders }: SinglesOrdersTableProps) {
  const { expeditedFilter, personalizedFilter } = useExpeditedFilter()
  const { updateOrdersInPlace } = useOrders()
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null)
  const [selectedRawPayload, setSelectedRawPayload] = useState<any | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isProcessDialogOpen, setIsProcessDialogOpen] = useState(false)
  const [selectedSize, setSelectedSize] = useState<string>('all')
  const [selectedColor, setSelectedColor] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [autoProcessEnabled, setAutoProcessEnabled] = useState(false)
  const [autoProcessThreshold, setAutoProcessThreshold] = useState<number>(10)
  const [isBatchPackageInfoDialogOpen, setIsBatchPackageInfoDialogOpen] = useState(false)
  const [fetchingMissingRates, setFetchingMissingRates] = useState(false)
  const [fetchRatesMessage, setFetchRatesMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [fetchProgress, setFetchProgress] = useState<{ current: number; total: number } | null>(null)
  const [abortController, setAbortController] = useState<AbortController | null>(null)
  const [availableServices, setAvailableServices] = useState<CarrierService[]>([])
  const [selectedService, setSelectedService] = useState<string>('')
  const [defaultServiceKey, setDefaultServiceKey] = useState<string>('')
  const [boxes, setBoxes] = useState<Array<{
    id: string
    name: string
    lengthInches: number
    widthInches: number
    heightInches: number
    weightLbs: number
  }>>([])

  // Fetch boxes and available services from API
  useEffect(() => {
    const fetchBoxes = async () => {
      try {
        const res = await fetch('/api/box-config')
        if (res.ok) {
          const data = await res.json()
          setBoxes(data.boxes || [])
        }
      } catch (error) {
        console.error('Failed to fetch boxes:', error)
      }
    }
    
    const fetchServices = async () => {
      try {
        // First get the default singles carrier from settings
        const settingsRes = await fetch('/api/settings')
        if (settingsRes.ok) {
          const settingsData = await settingsRes.json()
          if (settingsData.singles_carrier) {
            const sc = settingsData.singles_carrier
            const key = `${sc.carrierId}:${sc.serviceCode}`
            setDefaultServiceKey(key)
            setSelectedService(key)
          }
        }
        
        // Then get all available services
        const res = await fetch('/api/shipengine/carriers?includeServices=true')
        if (res.ok) {
          const data = await res.json()
          const services: CarrierService[] = []
          for (const carrier of data.carriers || []) {
            for (const service of carrier.services || []) {
              services.push({
                carrierId: carrier.carrier_id,
                carrierCode: carrier.carrier_code,
                carrierName: carrier.friendly_name,
                serviceCode: service.service_code,
                serviceName: service.name,
              })
            }
          }
          setAvailableServices(services)
        }
      } catch (error) {
        console.error('Failed to fetch services:', error)
      }
    }
    
    fetchBoxes()
    fetchServices()
  }, [])

  // Process orders to extract main item, size, and color
  const processedOrders = useMemo(() => {
    return orders
      .map((log) => {
        const payload = log.rawPayload as any
        const order = Array.isArray(payload) ? payload[0] : payload
        const items = order?.items || []
        
        // Find the main item (non-insurance item)
        const mainItem = items.find(
          (item: any) => !isShippingInsurance(item.sku || '', item.name || '')
        )
        
        if (!mainItem) return null
        
        const size = getSizeFromSku(mainItem.sku || '')
        // Use color from payload if available (sent from NetSuite), otherwise parse from SKU
        const color = getColorFromSku(mainItem.sku || '', mainItem.name, mainItem.color)
        const customerName = order?.shipTo?.name || order?.billTo?.name || 'Unknown'
        const customerId = order?.shipTo?.name ? order?.shipTo?.name.split(' ')[0] : undefined
        
        return {
          log,
          order,
          mainItem,
          size,
          color,
          customerName,
          customerId,
          orderDate: order?.orderDate || log.createdAt,
          status: log.status,
        } as ProcessedOrder
      })
      .filter((o): o is ProcessedOrder => o !== null)
  }, [orders])

  // Get unique colors with counts (filtered by selected size)
  const colorCounts = useMemo(() => {
    const counts: { [key: string]: number } = {}
    processedOrders.forEach((order) => {
      // If a size is selected, only count colors for that size
      if (selectedSize !== 'all' && order.size !== selectedSize) {
        return
      }
      counts[order.color] = (counts[order.color] || 0) + 1
    })
    return counts
  }, [processedOrders, selectedSize])

  // Get unique sizes
  const sizes = ['All Cup Sizes', '10oz', '16oz', '26oz', 'Accessories']
  const colors = ['All Colors', ...Object.keys(colorCounts).sort()]

  // Filter orders
  const filteredOrders = useMemo(() => {
    return processedOrders.filter((order) => {
      const isPersonalized = isOrderPersonalized(order.log.rawPayload)
      const customerReachedOut = (order.log as any).customerReachedOut || false
      const isExpedited = isOrderExpedited(order.log.rawPayload, customerReachedOut)

      // Personalized filter (3-state)
      if (personalizedFilter === 'only' && !isPersonalized) return false
      if (personalizedFilter === 'hide' && isPersonalized) return false

      // Expedited filter (3-state)
      if (expeditedFilter === 'only' && !isExpedited) return false
      if (expeditedFilter === 'hide' && isExpedited) return false

      // Size filter
      if (selectedSize !== 'all' && order.size !== selectedSize) {
        return false
      }
      
      // Color filter
      if (selectedColor !== 'all' && order.color !== selectedColor) {
        return false
      }
      
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        const orderNumber = order.log.orderNumber.toLowerCase()
        const customerName = order.customerName.toLowerCase()
        const sku = order.mainItem.sku?.toLowerCase() || ''
        
        if (
          !orderNumber.includes(query) &&
          !customerName.includes(query) &&
          !sku.includes(query)
        ) {
          return false
        }
      }
      
      return true
    })
  }, [processedOrders, selectedSize, selectedColor, searchQuery, personalizedFilter, expeditedFilter])

  // Count orders without rates (price = 0 or null)
  const ordersWithoutRates = useMemo(() => {
    return filteredOrders.filter(order => {
      const preShoppedRate = (order.log as any).preShoppedRate
      return !preShoppedRate || !preShoppedRate.price || preShoppedRate.price === 0
    })
  }, [filteredOrders])

  // Group orders for auto-processing
  interface OrderBatch {
    id: string
    orders: ProcessedOrder[]
    size: string
    color: string
    label: string
  }

  const orderBatches = useMemo(() => {
    if (!autoProcessEnabled) return []
    
    // Disable if both size and color are selected, or if both are "all"
    if ((selectedSize !== 'all' && selectedColor !== 'all') || (selectedSize === 'all' && selectedColor === 'all')) {
      return []
    }

    const batches: OrderBatch[] = []
    const batchMap = new Map<string, ProcessedOrder[]>()

    // Group orders based on filter selection
    if (selectedSize !== 'all' && selectedColor === 'all') {
      // Size selected, group by color
      filteredOrders.forEach(order => {
        const key = order.color
        if (!batchMap.has(key)) {
          batchMap.set(key, [])
        }
        batchMap.get(key)!.push(order)
      })
    } else if (selectedSize === 'all' && selectedColor !== 'all') {
      // Color selected, group by size
      filteredOrders.forEach(order => {
        const key = order.size
        if (!batchMap.has(key)) {
          batchMap.set(key, [])
        }
        batchMap.get(key)!.push(order)
      })
    }

    // Convert to batches and filter by threshold
    batchMap.forEach((orders, key) => {
      if (orders.length > autoProcessThreshold) {
        let size: string, color: string, label: string
        
        if (selectedSize !== 'all' && selectedColor === 'all') {
          // Grouped by color, size is the selected size
          size = selectedSize
          color = key
          label = `${size} ${color}`
        } else if (selectedSize === 'all' && selectedColor !== 'all') {
          // Grouped by size, color is the selected color
          size = key
          color = selectedColor
          label = `${size} ${color}`
        } else {
          // Fallback (shouldn't happen)
          size = orders[0]?.size || 'Unknown'
          color = orders[0]?.color || 'Unknown'
          label = `${size} ${color}`
        }
        
        batches.push({
          id: key,
          orders,
          size,
          color,
          label,
        })
      }
    })

    // Sort batches: by size first, then by color
    batches.sort((a, b) => {
      const sizeOrder = ['10oz', '16oz', '26oz', 'Accessories']
      const aSizeIndex = sizeOrder.indexOf(a.size) !== -1 ? sizeOrder.indexOf(a.size) : 999
      const bSizeIndex = sizeOrder.indexOf(b.size) !== -1 ? sizeOrder.indexOf(b.size) : 999
      if (aSizeIndex !== bSizeIndex) {
        return aSizeIndex - bSizeIndex
      }
      return a.color.localeCompare(b.color)
    })

    return batches
  }, [filteredOrders, autoProcessEnabled, selectedSize, selectedColor, autoProcessThreshold])

  // Check if all filtered orders have pre-assigned shipping rates (from ingestion)
  const allOrdersHaveRates = useMemo(() => {
    if (filteredOrders.length === 0) return false
    // Singles orders have rates pre-assigned at ingestion - check if they have preShoppedRate
    return filteredOrders.every(order => {
      const preShoppedRate = (order.log as any).preShoppedRate
      return preShoppedRate && preShoppedRate.price
    })
  }, [filteredOrders])

  // Notify header about process button availability
  useEffect(() => {
    const event = new CustomEvent('processButtonAvailability', {
      detail: { canProcess: allOrdersHaveRates }
    })
    window.dispatchEvent(event)
  }, [allOrdersHaveRates])

  // Listen for custom event from header button
  useEffect(() => {
    const handleOpenProcessDialog = () => {
      if (filteredOrders.length > 0 && allOrdersHaveRates) {
        if (autoProcessEnabled && orderBatches.length > 0) {
          // Open batch package info dialog for auto-process
          setIsBatchPackageInfoDialogOpen(true)
        } else {
          // Regular process dialog
          setIsProcessDialogOpen(true)
        }
      }
    }

    window.addEventListener('openProcessDialog', handleOpenProcessDialog)
    return () => {
      window.removeEventListener('openProcessDialog', handleOpenProcessDialog)
    }
  }, [filteredOrders.length, allOrdersHaveRates, autoProcessEnabled, orderBatches.length])

  const handleRowClick = (processedOrder: ProcessedOrder) => {
    setSelectedOrder(processedOrder.order)
    setSelectedRawPayload(processedOrder.log.rawPayload)
    setIsDialogOpen(true)
  }

  const handleCloseDialog = () => {
    setIsDialogOpen(false)
    setSelectedOrder(null)
    setSelectedRawPayload(null)
  }

  const handleFetchMissingRates = async (
    action: 'set-service' | 'get-rates' = 'set-service',
    options?: { missingOnly?: boolean; serviceOverride?: CarrierService }
  ) => {
    const missingOnly = options?.missingOnly || false
    const serviceOverride = options?.serviceOverride
    
    // Collect order IDs from the visible/filtered orders (or only missing if specified)
    const targetOrders = missingOnly ? ordersWithoutRates : filteredOrders
    const orderIds = targetOrders.map(order => order.log.id)
    
    if (orderIds.length === 0) {
      setFetchRatesMessage({
        type: 'error',
        text: missingOnly ? 'No orders missing rates' : 'No orders to process',
      })
      return
    }

    console.log(`[UI] ${action} for ${orderIds.length} orders${missingOnly ? ' (missing only)' : ''}`)
    setFetchingMissingRates(true)
    setFetchRatesMessage(null)
    setFetchProgress({ current: 0, total: orderIds.length })
    
    // Create abort controller for cancellation
    const controller = new AbortController()
    setAbortController(controller)
    
    // Process in batches for better progress tracking
    const BATCH_SIZE = action === 'get-rates' ? 5 : 20 // Smaller batches for rate fetching
    let processed = 0
    let totalUpdated = 0
    let cancelled = false
    
    try {
      for (let i = 0; i < orderIds.length; i += BATCH_SIZE) {
        // Check if cancelled
        if (controller.signal.aborted) {
          cancelled = true
          break
        }
        
        const batchIds = orderIds.slice(i, i + BATCH_SIZE)
        
        // Build request body with optional service override
        const requestBody: any = { action, orderIds: batchIds }
        if (serviceOverride) {
          requestBody.serviceOverride = {
            carrierId: serviceOverride.carrierId,
            carrierCode: serviceOverride.carrierCode,
            carrier: serviceOverride.carrierName,
            serviceCode: serviceOverride.serviceCode,
            serviceName: serviceOverride.serviceName,
          }
        }
        
        const res = await fetch('/api/orders/fetch-missing-rates', { 
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        })
        
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Failed to process orders')
        }
        
        const data = await res.json()
        totalUpdated += data.updated || 0
        processed += batchIds.length
        setFetchProgress({ current: processed, total: orderIds.length })
        
        // Update orders in real-time as each batch completes
        if (data.updatedOrders && data.updatedOrders.length > 0) {
          updateOrdersInPlace(data.updatedOrders)
        }
      }
      
      if (cancelled) {
        setFetchRatesMessage({
          type: 'success',
          text: `Cancelled after ${totalUpdated} orders`,
        })
      } else {
        setFetchRatesMessage({
          type: 'success',
          text: action === 'get-rates' 
            ? `Fetched rates for ${totalUpdated} orders` 
            : `Set service for ${totalUpdated} orders`,
        })
      }
      // No page reload needed - orders are updated in real-time
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setFetchRatesMessage({
          type: 'success',
          text: `Cancelled after ${totalUpdated} orders`,
        })
        // No page reload needed - orders already updated in real-time
      } else {
        setFetchRatesMessage({
          type: 'error',
          text: err.message || 'Failed to process orders',
        })
      }
    } finally {
      setFetchingMissingRates(false)
      setFetchProgress(null)
      setAbortController(null)
    }
  }

  const handleCancelFetch = () => {
    if (abortController) {
      abortController.abort()
    }
  }

  const handleProceed = () => {
    // Use pre-shopped rate info from the first order for label generation
    const firstOrder = filteredOrders[0]
    const preShoppedRate = (firstOrder?.log as any)?.preShoppedRate

    // Build label info from pre-shopped rate
    const labelInfo: LabelInfo = preShoppedRate
      ? {
          carrier: preShoppedRate.carrier || 'USPS',
          service: preShoppedRate.serviceName || 'First Class',
          packaging: 'Package',
          weight: ((firstOrder?.log as any)?.shippedWeight || 0.5).toString(),
          dimensions: { length: '7', width: '7', height: '2' },
        }
      : {
          carrier: 'USPS',
          service: 'First Class',
          packaging: 'Package',
          weight: '0.5',
          dimensions: { length: '7', width: '7', height: '2' },
        }

    generatePickListAndLabels(filteredOrders, labelInfo)
  }

  const handleBatchProceed = (batchPackageInfo: Map<string, { carrier: string; service: string; packaging: string; weight: string; dimensions: { length: string; width: string; height: string } }>) => {
    // Process all batches with their respective package info
    const allOrders: ProcessedOrder[] = []
    const batchLabels: Array<{ batch: OrderBatch; labelInfo: LabelInfo }> = []
    
    orderBatches.forEach(batch => {
      const info = batchPackageInfo.get(batch.id)
      if (info) {
        const labelInfo: LabelInfo = {
          carrier: info.carrier,
          service: info.service,
          packaging: info.packaging,
          weight: info.weight,
          dimensions: info.dimensions,
        }
        batchLabels.push({ batch, labelInfo })
        allOrders.push(...batch.orders)
      }
    })
    
    generatePickListAndLabelsWithBatches(batchLabels)
  }

  const generatePickListAndLabels = (orders: ProcessedOrder[], labelInfo: LabelInfo) => {
    // Aggregate items by SKU for the pick list
    const itemMap = new Map<string, { sku: string; name: string; totalQty: number; size: string; color: string }>()
    
    orders.forEach(order => {
      const sku = order.mainItem.sku || 'N/A'
      const existing = itemMap.get(sku)
      const qty = order.mainItem.quantity || 1
      
      if (existing) {
        existing.totalQty += qty
      } else {
        itemMap.set(sku, {
          sku,
          name: order.mainItem.name || 'N/A',
          totalQty: qty,
          size: order.size,
          color: order.color,
        })
      }
    })
    
    const aggregatedItems = Array.from(itemMap.values())
    const totalItems = aggregatedItems.reduce((sum, item) => sum + item.totalQty, 0)
    
    // Generate tracking number (mock) - USPS format: 420 94085 9121 1288 8230 0525 2393 22
    const generateTrackingNumber = (orderNumber: string) => {
      // Generate a mock USPS tracking number format
      const randomDigits = orderNumber.padStart(22, '0').slice(-22)
      return `420 ${randomDigits.slice(0, 5)} ${randomDigits.slice(5, 9)} ${randomDigits.slice(9, 13)} ${randomDigits.slice(13, 17)} ${randomDigits.slice(17, 21)} ${randomDigits.slice(21, 22)}`
    }

    // Get service indicator (P for Priority, E for Express, etc.)
    const getServiceIndicator = (service: string) => {
      if (service.includes('Express')) return 'E'
      if (service.includes('Priority')) return 'P'
      if (service.includes('First Class')) return 'FC'
      return 'P'
    }

    // Get service name for banner
    const getServiceName = (service: string) => {
      if (service.includes('Express')) return 'USPS PRIORITY MAIL EXPRESS®'
      if (service.includes('Priority')) return 'USPS PRIORITY MAIL®'
      if (service.includes('First Class')) return 'USPS FIRST-CLASS MAIL®'
      return 'USPS PRIORITY MAIL®'
    }

    // Get current date in MM/DD/YY format
    const getCurrentDate = () => {
      const now = new Date()
      const month = String(now.getMonth() + 1).padStart(2, '0')
      const day = String(now.getDate()).padStart(2, '0')
      const year = String(now.getFullYear()).slice(-2)
      return `${month}/${day}/${year}`
    }

    // Create a simple HTML document that can be printed as PDF
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
    /* USPS Shipping Label Styles - Matching Official Format */
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
  <!-- Single Pick List for All Orders -->
  <div class="page">
    <div class="label pick-label">
      <div class="pick-label-header">PICK LIST</div>
      <div class="pick-label-content">
        <div style="font-size: 18px; font-weight: bold; text-align: center; margin-bottom: 10px;">
          Total Orders: ${orders.length}
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
  
  <!-- Shipping Labels for Each Order (one per page) -->
  ${orders
    .map((order) => {
      const payload = order.log.rawPayload as any
      const orderData = Array.isArray(payload) ? payload[0] : payload
      const shipTo = orderData?.shipTo || {}
      const billTo = orderData?.billTo || {}
      const trackingNumber = generateTrackingNumber(order.log.orderNumber)
      const serviceIndicator = getServiceIndicator(labelInfo.service)
      
      // Format sender address (use billTo or a default)
      const senderName = billTo.name || 'John Smith'
      const senderCompany = billTo.company || 'Your Company'
      const senderStreet = billTo.street1 || '123 Main Street'
      const senderCity = billTo.city || 'City'
      const senderState = billTo.state || 'ST'
      const senderZip = billTo.postalCode || '12345'
      const fromZip = senderZip.slice(0, 5) || '12345'
      
      // Format recipient address
      const recipientName = shipTo.name || 'N/A'
      const recipientCompany = shipTo.company || ''
      const recipientStreet1 = shipTo.street1 || ''
      const recipientStreet2 = shipTo.street2 || ''
      const recipientCity = shipTo.city || ''
      const recipientState = shipTo.state || ''
      const recipientZip = shipTo.postalCode || ''
      
      const currentDate = getCurrentDate()
      const serviceName = getServiceName(labelInfo.service)
      const identifier = order.log.orderNumber.padStart(15, '0').slice(-15)
      const approvalNumber = order.log.orderNumber.padStart(9, '0').slice(-9)
      
      // Create USPS-style shipping label matching official format
      return `
  <div class="page">
    <div class="label usps-label">
      <!-- Top Left: Service Indicator, Date, From ZIP -->
      <div class="usps-top-left">
        <div class="usps-service-indicator-large">${serviceIndicator}</div>
        <div class="usps-date-from">${currentDate}</div>
        <div class="usps-date-from">From ${fromZip}</div>
      </div>
      
      <!-- Top Right: Postage Paid, Provider, Packaging, 2D Barcode -->
      <div class="usps-top-right">
        <div class="usps-postage-paid">US POSTAGE PAID</div>
        <div>${labelInfo.carrier}</div>
        <div>${labelInfo.packaging}</div>
        <div class="usps-2d-barcode">
          <div>2D<br>BARCODE</div>
        </div>
        <div style="font-family: 'Courier New', monospace; font-size: 7px; margin-top: 2px;">${identifier}</div>
      </div>
      
      <!-- Service Banner -->
      <div class="usps-service-banner">
        ${serviceName}
      </div>
      
      <!-- Sender Address (top middle) -->
      <div class="usps-sender-address">
        ${senderName}<br>
        ${senderCompany}<br>
        ${senderStreet}<br>
        ${senderCity} ${senderState} ${senderZip}
      </div>
      
      <!-- Ship To Label -->
      <div class="usps-ship-to-label">SHIP TO:</div>
      
      <!-- Delivery Address -->
      <div class="usps-delivery-address">
        <div class="usps-delivery-name">${recipientName}</div>
        ${recipientCompany ? `<div class="usps-delivery-street">${recipientCompany}</div>` : ''}
        ${recipientStreet1 ? `<div class="usps-delivery-street">${recipientStreet1}</div>` : ''}
        ${recipientStreet2 ? `<div class="usps-delivery-street">${recipientStreet2}</div>` : ''}
        <div class="usps-delivery-city-state">
          ${recipientCity}${recipientState ? ` ${recipientState}` : ''} ${recipientZip}
        </div>
      </div>
      
      <!-- Barcode Section (bottom) -->
      <div class="usps-barcode-section">
        <div class="usps-barcode-label">ZIP - e/ ${labelInfo.carrier} ${labelInfo.service.toUpperCase()}</div>
        <div class="usps-linear-barcode"></div>
        <div class="usps-tracking-number">${trackingNumber}</div>
      </div>
      
      <!-- Footer -->
      <div class="usps-footer">
        Electronic Rate Approved #${approvalNumber} | Order: ${order.log.orderNumber} | Item: ${order.mainItem.sku || 'N/A'} | Qty: ${order.mainItem.quantity || 1} | ${labelInfo.weight} lbs
      </div>
    </div>
  </div>
      `
    })
    .join('')}
</body>
</html>
    `

    // Open in new window for printing/saving as PDF
    const printWindow = window.open('', '_blank')
    if (printWindow) {
      printWindow.document.write(pickListHTML)
      printWindow.document.close()
      // Wait for content to load, then trigger print dialog
      setTimeout(() => {
        printWindow.print()
      }, 250)
    }
  }

  const generatePickListAndLabelsWithBatches = (batchLabels: Array<{ batch: OrderBatch; labelInfo: LabelInfo }>) => {
    // Helper functions (same as above)
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
  <title>Pick List & Shipping Labels - Auto Process</title>
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
    batchLabels.forEach(({ batch, labelInfo }, batchIndex) => {
      // Aggregate items for pick list
      const itemMap = new Map<string, { sku: string; name: string; totalQty: number; size: string; color: string }>()
      
      batch.orders.forEach(order => {
        const sku = order.mainItem.sku || 'N/A'
        const existing = itemMap.get(sku)
        const qty = order.mainItem.quantity || 1
        
        if (existing) {
          existing.totalQty += qty
        } else {
          itemMap.set(sku, {
            sku,
            name: order.mainItem.name || 'N/A',
            totalQty: qty,
            size: order.size,
            color: order.color,
          })
        }
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
          Total Orders: ${batch.orders.length}
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
      `

      // Shipping labels for this batch
      batch.orders.forEach((order) => {
        const payload = order.log.rawPayload as any
        const orderData = Array.isArray(payload) ? payload[0] : payload
        const shipTo = orderData?.shipTo || {}
        const billTo = orderData?.billTo || {}
        const trackingNumber = generateTrackingNumber(order.log.orderNumber)
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
        const identifier = order.log.orderNumber.padStart(15, '0').slice(-15)
        const approvalNumber = order.log.orderNumber.padStart(9, '0').slice(-9)
        
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
        ${senderCompany}<br>
        ${senderStreet}<br>
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
        Electronic Rate Approved #${approvalNumber} | Order: ${order.log.orderNumber} | Item: ${order.mainItem.sku || 'N/A'} | Qty: ${order.mainItem.quantity || 1} | ${labelInfo.weight} lbs
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

  if (orders.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-12 text-center">
        <p className="text-gray-500 text-lg">No single item orders found</p>
      </div>
    )
  }

  return (
    <>
      {/* Size Filter */}
      <div className="mb-4">
        <div className="flex flex-wrap gap-2">
          {sizes.map((size) => (
            <button
              key={size}
              onClick={() => setSelectedSize(size === 'All Cup Sizes' ? 'all' : size)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                (size === 'All Cup Sizes' && selectedSize === 'all') ||
                (size !== 'All Cup Sizes' && selectedSize === size)
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {size}
            </button>
          ))}
        </div>
      </div>

      {/* Color Filter */}
      <div className="mb-6">
        <div className="flex flex-wrap gap-2">
          {colors.map((color) => (
            <button
              key={color}
              onClick={() => setSelectedColor(color === 'All Colors' ? 'all' : color)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                (color === 'All Colors' && selectedColor === 'all') ||
                (color !== 'All Colors' && selectedColor === color)
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {color}
              {color !== 'All Colors' && colorCounts[color] !== undefined && (
                <span className="ml-1">({colorCounts[color]})</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Auto Process Section */}
      <div className="mb-4 bg-white rounded-lg shadow p-4">
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={autoProcessEnabled}
              onChange={(e) => setAutoProcessEnabled(e.target.checked)}
              disabled={(selectedSize !== 'all' && selectedColor !== 'all') || (selectedSize === 'all' && selectedColor === 'all')}
              className="w-5 h-5 text-green-600 rounded focus:ring-green-500"
            />
            <span className="text-sm font-medium text-gray-700">Auto Process</span>
          </label>
          {autoProcessEnabled && (
            <>
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">Threshold:</label>
                <input
                  type="number"
                  min="1"
                  value={autoProcessThreshold}
                  onChange={(e) => setAutoProcessThreshold(parseInt(e.target.value) || 1)}
                  className="w-20 px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                />
                <span className="text-sm text-gray-600">orders</span>
              </div>
              {((selectedSize !== 'all' && selectedColor !== 'all') || (selectedSize === 'all' && selectedColor === 'all')) && (
                <span className="text-sm text-yellow-600">
                  Auto Process disabled: Select either size OR color (not both/all)
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {/* Single Item Orders Section */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold text-gray-900">Single Item Orders</h2>
            <div className="flex items-center gap-2">
              {fetchingMissingRates ? (
                <>
                  {/* Progress indicator */}
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-lg">
                    <svg className="animate-spin h-4 w-4 text-amber-500" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span className="text-sm font-medium text-gray-700">
                      {fetchProgress ? `${fetchProgress.current} / ${fetchProgress.total}` : 'Processing...'}
                    </span>
                  </div>
                  {/* Cancel button */}
                  <button
                    onClick={handleCancelFetch}
                    className="px-3 py-1.5 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  {/* Service dropdown + Set Service button */}
                  <div className="flex items-center gap-1">
                    <select
                      value={selectedService}
                      onChange={(e) => setSelectedService(e.target.value)}
                      className="px-2 py-1.5 text-sm border border-gray-300 rounded-l-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white max-w-[200px]"
                      disabled={selectedSize === 'all' || filteredOrders.length === 0}
                    >
                      {availableServices.map((service) => {
                        const key = `${service.carrierId}:${service.serviceCode}`
                        const isDefault = key === defaultServiceKey
                        return (
                          <option key={key} value={key}>
                            {service.carrierName} - {service.serviceName}{isDefault ? ' (default)' : ''}
                          </option>
                        )
                      })}
                    </select>
                    <button
                      onClick={() => {
                        const service = availableServices.find(
                          s => `${s.carrierId}:${s.serviceCode}` === selectedService
                        )
                        handleFetchMissingRates('set-service', { serviceOverride: service })
                      }}
                      disabled={selectedSize === 'all' || filteredOrders.length === 0 || !selectedService}
                      className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded-r-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                      title={selectedSize === 'all' ? 'Select a size first' : `Assign service to ${filteredOrders.length} visible orders (no price lookup)`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Set ({filteredOrders.length})
                    </button>
                  </div>
                  
                  {/* Get Rates buttons */}
                  <div className="flex items-center gap-2">
                    {/* Get Missing Rates - only orders without price */}
                    <button
                      onClick={() => handleFetchMissingRates('get-rates', { missingOnly: true })}
                      disabled={selectedSize === 'all' || ordersWithoutRates.length === 0}
                      className="px-3 py-1.5 text-sm bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                      title={selectedSize === 'all' ? 'Select a size first' : `Fetch prices for ${ordersWithoutRates.length} orders missing rates`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Get Missing ({ordersWithoutRates.length})
                    </button>
                    {/* Get All Rates - refetch all visible */}
                    <button
                      onClick={() => handleFetchMissingRates('get-rates')}
                      disabled={selectedSize === 'all' || filteredOrders.length === 0}
                      className="px-3 py-1.5 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                      title={selectedSize === 'all' ? 'Select a size first' : `Fetch prices for ALL ${filteredOrders.length} visible orders`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Refresh All ({filteredOrders.length})
                    </button>
                  </div>
                </>
              )}
            </div>
            {fetchRatesMessage && (
              <span className={`text-sm ${fetchRatesMessage.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                {fetchRatesMessage.text}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">Found {filteredOrders.length} orders</span>
            <div className="relative">
              <input
                type="text"
                placeholder="Search orders..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <svg
                className="absolute left-3 top-2.5 w-5 h-5 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Order ID
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Customer
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Item SKU
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Size
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Color
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Box
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Quantity
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Ordered Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Shipping Price
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Shipping Service
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  View Order
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-6 py-8 text-center text-gray-500">
                    No orders found matching your filters
                  </td>
                </tr>
              ) : (
                filteredOrders.map((processedOrder) => (
                  <tr
                    key={processedOrder.log.id}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-sm font-semibold text-gray-900">
                        #{processedOrder.log.orderNumber}
                      </div>
                      {processedOrder.order?.orderKey && (
                        <div className="text-xs text-gray-500">
                          {processedOrder.order.orderKey}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {processedOrder.customerId && (
                          <span className="font-medium">{processedOrder.customerId} </span>
                        )}
                        {processedOrder.customerName}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-sm font-mono text-gray-900">
                        {processedOrder.mainItem.sku || 'N/A'}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{processedOrder.size}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{processedOrder.color}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {(() => {
                        const suggestion = processedOrder.log.suggestedBox
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
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {processedOrder.mainItem.quantity || 1}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                      {new Date(processedOrder.orderDate).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                      {(() => {
                        const preShoppedRate = (processedOrder.log as any).preShoppedRate
                        if (preShoppedRate?.price) {
                          return <span className="text-green-600 font-medium">${preShoppedRate.price.toFixed(2)}</span>
                        }
                        return <span className="text-gray-400">—</span>
                      })()}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                      {(() => {
                        const preShoppedRate = (processedOrder.log as any).preShoppedRate
                        if (preShoppedRate?.carrier && preShoppedRate?.serviceName) {
                          return `${preShoppedRate.carrier} ${preShoppedRate.serviceName}`
                        }
                        return <span className="text-gray-400">—</span>
                      })()}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRowClick(processedOrder)
                        }}
                        className="text-blue-600 hover:text-blue-800 transition-colors"
                        title="View Order"
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
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                          />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <OrderDialog
        isOpen={isDialogOpen}
        onClose={handleCloseDialog}
        order={selectedOrder}
        rawPayload={selectedRawPayload}
      />

      <ProcessDialog
        isOpen={isProcessDialogOpen}
        onClose={() => setIsProcessDialogOpen(false)}
        orderCount={filteredOrders.length}
        onProceed={handleProceed}
      />

      <BatchPackageInfoDialog
        isOpen={isBatchPackageInfoDialogOpen}
        onClose={() => setIsBatchPackageInfoDialogOpen(false)}
        batches={orderBatches}
        onProceed={handleBatchProceed}
      />
    </>
  )
}

