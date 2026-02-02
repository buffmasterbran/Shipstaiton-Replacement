'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import OrderDialog from './OrderDialog'
import ProcessDialog from './ProcessDialog'
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

interface ShippingRate {
  orderId: string
  price: string
  service: string
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

export default function SinglesOrdersTable({ orders }: SinglesOrdersTableProps) {
  const { expeditedFilter, personalizedFilter } = useExpeditedFilter()
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null)
  const [selectedRawPayload, setSelectedRawPayload] = useState<any | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isProcessDialogOpen, setIsProcessDialogOpen] = useState(false)
  const [isPackageInfoDialogOpen, setIsPackageInfoDialogOpen] = useState(false)
  const [selectedSize, setSelectedSize] = useState<string>('all')
  const [selectedColor, setSelectedColor] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [packageInfo, setPackageInfo] = useState<PackageInfo | null>(null)
  const [shippingRates, setShippingRates] = useState<Map<string, ShippingRate>>(new Map())
  const [rateShoppingActive, setRateShoppingActive] = useState(false)
  const rateShoppingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const isFetchingRatesRef = useRef<boolean>(false)
  const [autoProcessEnabled, setAutoProcessEnabled] = useState(false)
  const [autoProcessThreshold, setAutoProcessThreshold] = useState<number>(10)
  const [isBatchPackageInfoDialogOpen, setIsBatchPackageInfoDialogOpen] = useState(false)
  const [boxes, setBoxes] = useState<Array<{
    id: string
    name: string
    lengthInches: number
    widthInches: number
    heightInches: number
    weightLbs: number
  }>>([])

  // Fetch boxes from API
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
    fetchBoxes()
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

  // Check if all filtered orders have shipping rates with both price and service
  const allOrdersHaveRates = useMemo(() => {
    if (filteredOrders.length === 0) return false
    if (!rateShoppingActive) return false // If not fetching rates, don't allow processing
    return filteredOrders.every(order => {
      const rate = shippingRates.get(order.log.id)
      return rate && rate.price && rate.service
    })
  }, [filteredOrders, shippingRates, rateShoppingActive])

  // Determine suggested box for the filtered orders
  // If all filtered orders have the same suggested box, use that; otherwise null
  const suggestedBoxForDialog = useMemo(() => {
    if (filteredOrders.length === 0) return null

    const firstSuggestion = filteredOrders[0]?.log.suggestedBox
    if (!firstSuggestion?.boxId) return null

    // Check if all orders have the same suggested box
    const allSame = filteredOrders.every(order =>
      order.log.suggestedBox?.boxId === firstSuggestion.boxId
    )

    if (!allSame) return null

    // Find the box details from our boxes array
    const box = boxes.find(b => b.id === firstSuggestion.boxId)
    if (!box) return null

    return {
      boxId: box.id,
      boxName: box.name,
      lengthInches: box.lengthInches,
      widthInches: box.widthInches,
      heightInches: box.heightInches,
      weightLbs: box.weightLbs,
    }
  }, [filteredOrders, boxes])

  // Notify header about process button availability
  useEffect(() => {
    const event = new CustomEvent('processButtonAvailability', {
      detail: { canProcess: allOrdersHaveRates || !rateShoppingActive }
    })
    window.dispatchEvent(event)
  }, [allOrdersHaveRates, rateShoppingActive])

  // Listen for custom event from header button
  useEffect(() => {
    const handleOpenProcessDialog = () => {
      if (filteredOrders.length > 0 && (allOrdersHaveRates || !rateShoppingActive)) {
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
  }, [filteredOrders.length, allOrdersHaveRates, rateShoppingActive, autoProcessEnabled, orderBatches.length])

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

  // Mock function to simulate rate shopping API call
  const fetchShippingRate = async (order: ProcessedOrder, packageInfo: PackageInfo): Promise<ShippingRate> => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000))
    
    const payload = order.log.rawPayload as any
    const orderData = Array.isArray(payload) ? payload[0] : payload
    const shipTo = orderData?.shipTo || {}
    
    // Check if rate shopping mode is selected
    const isRateShoppingCheapest = packageInfo.carrier === 'Rate Shopper - Cheapest'
    const isRateShoppingFastest = packageInfo.carrier === 'Rate Shopper - Fastest'
    
    // Mock rate data - in real implementation, this would call an actual rate shopping API
    const mockRates = [
      { carrier: 'USPS', service: 'First Class', price: (4.50 + Math.random() * 2).toFixed(2), days: 3 },
      { carrier: 'USPS', service: 'Priority Mail', price: (7.50 + Math.random() * 3).toFixed(2), days: 2 },
      { carrier: 'UPS', service: 'Ground', price: (8.00 + Math.random() * 4).toFixed(2), days: 5 },
      { carrier: 'UPS', service: '2nd Day Air', price: (15.00 + Math.random() * 5).toFixed(2), days: 2 },
      { carrier: 'FedEx', service: 'Ground', price: (9.00 + Math.random() * 4).toFixed(2), days: 4 },
      { carrier: 'FedEx', service: '2Day', price: (18.00 + Math.random() * 6).toFixed(2), days: 2 },
    ]
    
    let selectedRate
    
    if (isRateShoppingCheapest) {
      // Find cheapest rate
      selectedRate = mockRates.reduce((min, rate) => 
        parseFloat(rate.price) < parseFloat(min.price) ? rate : min
      )
    } else if (isRateShoppingFastest) {
      // Find fastest rate
      selectedRate = mockRates.reduce((fastest, rate) => 
        rate.days < fastest.days ? rate : fastest
      )
    } else {
      // Use the selected carrier and service, or find a matching rate
      const matchingRate = mockRates.find(
        rate => rate.carrier === packageInfo.carrier && rate.service === packageInfo.service
      )
      
      if (matchingRate) {
        // Add some variation to the price
        selectedRate = {
          ...matchingRate,
          price: (parseFloat(matchingRate.price) + (Math.random() * 0.5 - 0.25)).toFixed(2)
        }
      } else {
        // Fallback: use first matching carrier or default
        const carrierRate = mockRates.find(rate => rate.carrier === packageInfo.carrier) || mockRates[0]
        selectedRate = {
          ...carrierRate,
          service: packageInfo.service || carrierRate.service,
          price: (parseFloat(carrierRate.price) + (Math.random() * 0.5 - 0.25)).toFixed(2)
        }
      }
    }
    
    return {
      orderId: order.log.id,
      price: `$${selectedRate.price}`,
      service: `${selectedRate.carrier} ${selectedRate.service}`,
    }
  }

  const handleSavePackageInfo = (info: PackageInfo) => {
    setPackageInfo(info)
    
    // Start fetching rates for any carrier/service selection
    // Clear any existing interval first
    if (rateShoppingIntervalRef.current) {
      clearInterval(rateShoppingIntervalRef.current)
      rateShoppingIntervalRef.current = null
    }
    
    // Only start rate fetching if carrier is selected
    if (info.carrier) {
      setRateShoppingActive(true)
      
      // Clear existing rates
      setShippingRates(new Map())
      
      // Start fetching rates for all filtered orders, one at a time
      const fetchRatesForOrders = async () => {
        // Prevent multiple concurrent fetches
        if (isFetchingRatesRef.current) {
          return
        }
        
        isFetchingRatesRef.current = true
        
        try {
          // Fetch rates one at a time, updating the UI as each rate comes in
          for (let i = 0; i < filteredOrders.length; i++) {
            const order = filteredOrders[i]
            const rate = await fetchShippingRate(order, info)
            
            // Update state using functional update to avoid stale closures
            setShippingRates((prevRates) => {
              const updatedRates = new Map(prevRates)
              updatedRates.set(rate.orderId, rate)
              return updatedRates
            })
            
            // Small delay between requests to simulate real API behavior
            if (i < filteredOrders.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 300))
            }
          }
        } finally {
          isFetchingRatesRef.current = false
        }
      }
      
      // Start initial fetch
      fetchRatesForOrders()
      
      // Set up interval to refresh rates every few seconds
      rateShoppingIntervalRef.current = setInterval(() => {
        fetchRatesForOrders()
      }, 3000) // Refresh every 3 seconds
    } else {
      setRateShoppingActive(false)
      isFetchingRatesRef.current = false
    }
    
    console.log('Package info saved:', info)
  }
  
  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (rateShoppingIntervalRef.current) {
        clearInterval(rateShoppingIntervalRef.current)
        rateShoppingIntervalRef.current = null
      }
    }
  }, [])

  const handleProceed = () => {
    // Use packageInfo if available, otherwise create a default LabelInfo
    if (packageInfo) {
      const labelInfo: LabelInfo = {
        carrier: packageInfo.carrier,
        service: packageInfo.service,
        packaging: packageInfo.packaging,
        weight: packageInfo.weight,
        dimensions: packageInfo.dimensions,
      }
      generatePickListAndLabels(filteredOrders, labelInfo)
    } else {
      // Fallback if no package info is set
      const defaultLabelInfo: LabelInfo = {
        carrier: 'USPS',
        service: 'First Class',
        packaging: 'Package',
        weight: '0.5',
        dimensions: { length: '7', width: '7', height: '2' },
      }
      generatePickListAndLabels(filteredOrders, defaultLabelInfo)
    }
  }

  const handleBatchProceed = (batchPackageInfo: Map<string, PackageInfo>) => {
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
          <h2 className="text-lg font-semibold text-gray-900">Single Item Orders</h2>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">Found {filteredOrders.length} orders</span>
            <button
              onClick={() => setIsPackageInfoDialogOpen(true)}
              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
              title="Set package information"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                />
              </svg>
              Package Info
            </button>
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
                      {shippingRates.get(processedOrder.log.id)?.price || ''}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                      {shippingRates.get(processedOrder.log.id)?.service || ''}
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

      <PackageInfoDialog
        isOpen={isPackageInfoDialogOpen}
        onClose={() => setIsPackageInfoDialogOpen(false)}
        onSave={handleSavePackageInfo}
        suggestedBox={suggestedBoxForDialog}
        boxes={boxes}
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

