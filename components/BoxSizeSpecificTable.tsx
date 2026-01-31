'use client'

import { useState, useMemo } from 'react'
import OrderDialog from './OrderDialog'
import BatchDialog from './BatchDialog'
import packConfig from '@/pack-config.json'
import { useExpeditedFilter, isOrderExpedited } from '@/context/ExpeditedFilterContext'

interface OrderLog {
  id: string
  orderNumber: string
  status: string
  rawPayload: any
  createdAt: Date
  updatedAt: Date
}

interface BoxSizeSpecificTableProps {
  orders: OrderLog[]
}

interface ProcessedOrder {
  log: OrderLog
  order: any
  items: Array<{
    sku: string
    name: string
    quantity: number
  }>
  totalQty: number
  packSize: string
  compatiblePacks: string[]
  customerName: string
  orderDate: string
}

function getProductSizeFromSku(sku: string): string | null {
  if (!sku) return null
  const upperSku = sku.toUpperCase()
  if (upperSku.startsWith('DPT10') || upperSku.startsWith('PT10')) return 'DPT10'
  if (upperSku.startsWith('DPT16') || upperSku.startsWith('PT16')) return 'DPT16'
  if (upperSku.startsWith('DPT26') || upperSku.startsWith('PT26')) return 'DPT26'
  return null
}

function canOrderFitInPackSize(order: ProcessedOrder, packSizeKey: string): boolean {
  const packConfigData = packConfig.packSizes[packSizeKey as keyof typeof packConfig.packSizes]
  if (!packConfigData) return false

  const totalQuantity = order.totalQty

  // Single pack - only orders with exactly 1 item
  if (packSizeKey === 'single') {
    return totalQuantity === 1
  }

  // For multi-pack sizes, total quantity must match the pack size
  if (totalQuantity !== packConfigData.maxItems) {
    return false
  }

  // Build product sizes array
  const productSizes: string[] = []
  order.items.forEach(item => {
    const size = getProductSizeFromSku(item.sku)
    if (size) {
      for (let i = 0; i < item.quantity; i++) {
        productSizes.push(size)
      }
    }
  })

  if (productSizes.length === 0) return false

  // Check if the order items match any combination in the pack config
  const sortedSizes = [...productSizes].sort().join(',')
  
  return packConfigData.combinations.some(combination => {
    const sortedCombination = [...combination].sort().join(',')
    return sortedSizes === sortedCombination
  })
}

function getOptimalPackSize(order: ProcessedOrder): string {
  const totalQty = order.totalQty

  if (totalQty === 1) return 'Single'

  // Check each pack size
  for (const [key, config] of Object.entries(packConfig.packSizes)) {
    if (canOrderFitInPackSize(order, key)) {
      return config.name
    }
  }

  return 'Custom'
}

function getCompatiblePacks(order: ProcessedOrder): string[] {
  const compatible: string[] = []
  
  for (const [key, config] of Object.entries(packConfig.packSizes)) {
    if (canOrderFitInPackSize(order, key)) {
      compatible.push(config.name)
    }
  }

  return compatible.length > 0 ? compatible : ['Custom']
}

export default function BoxSizeSpecificTable({ orders }: BoxSizeSpecificTableProps) {
  const { expeditedOnly } = useExpeditedFilter()
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isBatchDialogOpen, setIsBatchDialogOpen] = useState(false)
  const [selectedSize, setSelectedSize] = useState<string>('all')
  const [selectedPackSize, setSelectedPackSize] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Process orders to extract items and determine pack sizes
  const processedOrders = useMemo(() => {
    return orders
      .map((log) => {
        const payload = log.rawPayload as any
        const order = Array.isArray(payload) ? payload[0] : payload
        const items = order?.items || []

        // Filter out shipping insurance items
        const nonInsuranceItems = items.filter(
          (item: any) => !(item.sku || '').toUpperCase().includes('INSURANCE') &&
                         !(item.sku || '').toUpperCase().includes('SHIPPING') &&
                         !(item.name || '').toUpperCase().includes('INSURANCE')
        )

        if (nonInsuranceItems.length === 0) return null

        const processedItems = nonInsuranceItems.map((item: any) => ({
          sku: item.sku || 'N/A',
          name: item.name || 'Unknown',
          quantity: item.quantity || 1,
        }))

        const totalQty = processedItems.reduce((sum: number, item: { sku: string; name: string; quantity: number }) => sum + item.quantity, 0)
        const customerName = order?.shipTo?.name || order?.billTo?.name || 'Unknown'
        const orderDate = order?.orderDate || log.createdAt

        const processedOrder: ProcessedOrder = {
          log,
          order,
          items: processedItems,
          totalQty,
          packSize: '',
          compatiblePacks: [],
          customerName,
          orderDate: typeof orderDate === 'string' ? orderDate : orderDate.toISOString(),
        }

        // Determine pack size and compatible packs
        processedOrder.packSize = getOptimalPackSize(processedOrder)
        processedOrder.compatiblePacks = getCompatiblePacks(processedOrder)

        return processedOrder
      })
      .filter((order): order is ProcessedOrder => order !== null)
  }, [orders])

  // Filter orders based on size and pack size
  const filteredOrders = useMemo(() => {
    let filtered = processedOrders

    // Global expedited filter
    if (expeditedOnly) {
      filtered = filtered.filter(order => {
        const customerReachedOut = (order.log as any).customerReachedOut || false
        return isOrderExpedited(order.log.rawPayload, customerReachedOut)
      })
    }

    // Size filter
    if (selectedSize !== 'all') {
      filtered = filtered.filter(order => {
        return order.items.some(item => {
          const sku = item.sku.toUpperCase()
          if (selectedSize === '10oz') return sku.startsWith('DPT10') || sku.startsWith('PT10')
          if (selectedSize === '16oz') return sku.startsWith('DPT16') || sku.startsWith('PT16')
          if (selectedSize === '26oz') return sku.startsWith('DPT26') || sku.startsWith('PT26')
          if (selectedSize === 'Accessories') {
            return !sku.startsWith('DPT10') && !sku.startsWith('DPT16') && 
                   !sku.startsWith('DPT26') && !sku.startsWith('PT10') && 
                   !sku.startsWith('PT16') && !sku.startsWith('PT26')
          }
          return false
        })
      })
    }

    // Pack size filter
    if (selectedPackSize !== 'all') {
      // Map UI pack size names to pack-config.json keys
      const packSizeMap: { [key: string]: string } = {
        '2/4 Pack': '4pack',  // Maps to 4 Pack in config
        '4/5 Pack': '5pack',  // Maps to 5 Pack in config
        '6/10 Pack': '8pack', // Maps to 8 Pack in config
        'Custom': 'custom',
      }

      const packKey = packSizeMap[selectedPackSize]
      
      if (packKey === 'custom') {
        // Custom = orders that don't fit any standard pack
        filtered = filtered.filter(order => {
          const fitsAnyPack = Object.keys(packConfig.packSizes).some(key => 
            canOrderFitInPackSize(order, key)
          )
          return !fitsAnyPack
        })
      } else if (packKey) {
        // Filter orders that match the selected pack size from pack-config.json
        filtered = filtered.filter(order => canOrderFitInPackSize(order, packKey))
      }
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(order => {
        return (
          order.log.orderNumber.toLowerCase().includes(query) ||
          order.customerName.toLowerCase().includes(query) ||
          order.items.some(item => 
            item.sku.toLowerCase().includes(query) || 
            item.name.toLowerCase().includes(query)
          )
        )
      })
    }

    return filtered
  }, [processedOrders, selectedSize, selectedPackSize, searchQuery, expeditedOnly])

  const handleRowClick = (order: ProcessedOrder) => {
    setSelectedOrder({
      orderNumber: order.log.orderNumber,
      orderKey: order.log.orderNumber,
      ...order.order,
    })
    setIsDialogOpen(true)
  }

  const handleCloseDialog = () => {
    setIsDialogOpen(false)
    setSelectedOrder(null)
  }

  const handleBatch = (packageInfo: { weight: string; dimensions: { length: string; width: string; height: string } }) => {
    generatePackingSlips(filteredOrders, packageInfo)
  }

  const generatePackingSlips = (orders: ProcessedOrder[], packageInfo: { weight: string; dimensions: { length: string; width: string; height: string } }) => {
    // Generate barcode helper (simple representation)
    const generateBarcode = (orderNumber: string) => {
      // Simple barcode representation - in production, use a barcode library
      return orderNumber.padStart(12, '0')
    }

    const packingSlipsHTML = `
<!DOCTYPE html>
<html>
<head>
  <title>Packing Slips</title>
  <style>
    @page {
      size: letter;
      margin: 0.5in;
    }
    body {
      font-family: Arial, Helvetica, sans-serif;
      margin: 0;
      padding: 0;
    }
    .packing-slip {
      width: 100%;
      min-height: 10in;
      border: 2px solid #000;
      padding: 0.5in;
      margin-bottom: 0.5in;
      page-break-after: always;
      box-sizing: border-box;
    }
    .packing-slip:last-child {
      page-break-after: auto;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 20px;
      border-bottom: 2px solid #000;
      padding-bottom: 10px;
    }
    .order-info {
      flex: 1;
    }
    .order-number {
      font-size: 24px;
      font-weight: bold;
      margin-bottom: 5px;
    }
    .barcode-section {
      text-align: right;
    }
    .barcode {
      font-family: 'Courier New', monospace;
      font-size: 36px;
      font-weight: bold;
      letter-spacing: 3px;
      margin-bottom: 5px;
    }
    .barcode-lines {
      height: 60px;
      background: repeating-linear-gradient(
        90deg,
        #000 0px,
        #000 2px,
        transparent 2px,
        transparent 4px
      );
      background-size: 4px 100%;
      margin-top: 5px;
    }
    .content {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 30px;
      margin-bottom: 20px;
    }
    .section {
      margin-bottom: 15px;
    }
    .section-title {
      font-weight: bold;
      font-size: 14px;
      margin-bottom: 5px;
      border-bottom: 1px solid #000;
      padding-bottom: 3px;
    }
    .section-content {
      font-size: 12px;
      line-height: 1.6;
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
    }
    .items-table th,
    .items-table td {
      border: 1px solid #000;
      padding: 8px;
      text-align: left;
    }
    .items-table th {
      background-color: #f0f0f0;
      font-weight: bold;
      font-size: 11px;
    }
    .items-table td {
      font-size: 11px;
    }
    .package-info {
      margin-top: 20px;
      padding-top: 15px;
      border-top: 2px solid #000;
      font-size: 11px;
    }
    @media print {
      .packing-slip {
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  ${orders.map((orderData) => {
    const payload = orderData.log.rawPayload as any
    const order = Array.isArray(payload) ? payload[0] : payload
    const shipTo = order?.shipTo || {}
    const billTo = order?.billTo || {}
    const barcode = generateBarcode(orderData.log.orderNumber)

    return `
  <div class="packing-slip">
    <div class="header">
      <div class="order-info">
        <div class="order-number">Order #${orderData.log.orderNumber}</div>
        <div style="font-size: 12px; color: #666;">Date: ${new Date(orderData.orderDate).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })}</div>
      </div>
      <div class="barcode-section">
        <div class="barcode">${barcode}</div>
        <div class="barcode-lines"></div>
        <div style="font-size: 10px; text-align: center; margin-top: 5px;">SCAN TO SHIP</div>
      </div>
    </div>

    <div class="content">
      <div>
        <div class="section">
          <div class="section-title">SHIP TO:</div>
          <div class="section-content">
            ${shipTo.name || 'N/A'}<br>
            ${shipTo.company ? shipTo.company + '<br>' : ''}
            ${shipTo.street1 || ''}<br>
            ${shipTo.street2 ? shipTo.street2 + '<br>' : ''}
            ${shipTo.city || ''}, ${shipTo.state || ''} ${shipTo.postalCode || ''}<br>
            ${shipTo.country || 'US'}
            ${shipTo.phone ? '<br><br>Phone: ' + shipTo.phone : ''}
          </div>
        </div>
      </div>

      <div>
        <div class="section">
          <div class="section-title">BILL TO:</div>
          <div class="section-content">
            ${billTo.name || 'N/A'}<br>
            ${billTo.company ? billTo.company + '<br>' : ''}
            ${billTo.street1 || ''}<br>
            ${billTo.street2 ? billTo.street2 + '<br>' : ''}
            ${billTo.city || ''}, ${billTo.state || ''} ${billTo.postalCode || ''}<br>
            ${billTo.country || 'US'}
          </div>
        </div>
      </div>
    </div>

    <table class="items-table">
      <thead>
        <tr>
          <th>SKU</th>
          <th>Item Description</th>
          <th style="text-align: center;">Qty</th>
        </tr>
      </thead>
      <tbody>
        ${orderData.items.map((item: any) => `
          <tr>
            <td style="font-family: monospace;">${item.sku}</td>
            <td>${item.name}</td>
            <td style="text-align: center;">${item.quantity}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <div class="package-info">
      <strong>Package Information:</strong><br>
      Weight: ${packageInfo.weight} lbs<br>
      Dimensions: ${packageInfo.dimensions.length}" × ${packageInfo.dimensions.width}" × ${packageInfo.dimensions.height}"<br>
      <strong>Shipping Service:</strong> Rate Shopper
    </div>
  </div>
    `
  }).join('')}
</body>
</html>
    `

    const printWindow = window.open('', '_blank')
    if (printWindow) {
      printWindow.document.write(packingSlipsHTML)
      printWindow.document.close()
      setTimeout(() => {
        printWindow.print()
      }, 250)
    }
  }

  if (processedOrders.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-12 text-center">
        <p className="text-gray-500 text-lg">No box size specific orders found</p>
      </div>
    )
  }

  return (
    <>
      {/* Size Filter */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">Size Filter</label>
        <div className="flex flex-wrap gap-2">
          {['all', '10oz', '16oz', '26oz', 'Accessories'].map((size) => (
            <button
              key={size}
              onClick={() => setSelectedSize(size)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                selectedSize === size
                  ? 'bg-green-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
              }`}
            >
              {size === 'all' ? 'All' : size}
            </button>
          ))}
        </div>
      </div>

      {/* Pack Sizes Filter */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">Pack Sizes</label>
        <div className="flex flex-wrap gap-2">
          {['All Packs', '2/4 Pack', '4/5 Pack', '6/10 Pack', 'Custom'].map((pack) => (
            <button
              key={pack}
              onClick={() => setSelectedPackSize(pack === 'All Packs' ? 'all' : pack)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors flex items-center gap-2 ${
                selectedPackSize === (pack === 'All Packs' ? 'all' : pack)
                  ? 'bg-green-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
              }`}
            >
              {pack === 'All Packs' && (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              )}
              {pack === '2/4 Pack' && (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              )}
              {pack === '4/5 Pack' && (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              )}
              {pack === '6/10 Pack' && (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              )}
              {pack === 'Custom' && (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              )}
              {pack}
            </button>
          ))}
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Box Size Specific Orders</h2>
            <p className="text-sm text-gray-500 mt-1">Orders organized by box size requirements and pack compatibility</p>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">Found {filteredOrders.length} orders</span>
            {filteredOrders.length > 0 && (
              <button
                onClick={() => setIsBatchDialogOpen(true)}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
                Batch
              </button>
            )}
            <div className="relative">
              <input
                type="text"
                placeholder="Search orders..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <svg
                className="absolute left-3 top-2.5 h-5 w-5 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  ORDER ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  CUSTOMER
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  ITEMS
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  PACK SIZE
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  COMPATIBLE PACKS
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  TOTAL QTY
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  ORDERED DATE
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredOrders.map((order) => {
                const orderDate = order.orderDate
                  ? new Date(order.orderDate).toLocaleDateString('en-US', {
                      month: '2-digit',
                      day: '2-digit',
                      year: 'numeric',
                    })
                  : 'N/A'

                const displayedItems = order.items.slice(0, 2)
                const remainingCount = order.items.length - 2

                return (
                  <tr
                    key={order.log.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => handleRowClick(order)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      #{order.log.orderNumber}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {order.customerName}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      <div className="space-y-1">
                        {displayedItems.map((item, idx) => (
                          <div key={idx} className="font-mono text-xs">
                            {item.sku} ({item.quantity})
                          </div>
                        ))}
                        {remainingCount > 0 && (
                          <div className="text-xs text-gray-500">+{remainingCount} more</div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {order.packSize}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      <div className="flex flex-wrap gap-1">
                        {order.compatiblePacks.slice(0, 2).map((pack, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800"
                          >
                            {pack}
                          </span>
                        ))}
                        {order.compatiblePacks.length > 2 && (
                          <span className="text-xs text-gray-500">+{order.compatiblePacks.length - 2}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                      {order.totalQty}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {orderDate}
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
      <BatchDialog
        isOpen={isBatchDialogOpen}
        onClose={() => setIsBatchDialogOpen(false)}
        onBatch={handleBatch}
        orderCount={filteredOrders.length}
      />
    </>
  )
}

