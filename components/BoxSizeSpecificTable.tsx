'use client'

import { useState, useMemo, useEffect } from 'react'
import OrderDialog from './OrderDialog'
import BatchDialog from './BatchDialog'
import BoxConfirmDialog from './BoxConfirmDialog'
import { useExpeditedFilter, isOrderExpedited, isOrderPersonalized } from '@/context/ExpeditedFilterContext'
import { getColorFromSku, getSizeFromSku } from '@/lib/order-utils'

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

interface Box {
  id: string
  name: string
  lengthInches: number
  widthInches: number
  heightInches: number
  weightLbs: number
  priority: number
  active: boolean
  singleCupOnly: boolean
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
    color: string
    size: string
  }>
  totalQty: number
  boxName: string | null
  customerName: string
  orderDate: string
}

export default function BoxSizeSpecificTable({ orders }: BoxSizeSpecificTableProps) {
  const { expeditedFilter, personalizedFilter } = useExpeditedFilter()
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null)
  const [selectedRawPayload, setSelectedRawPayload] = useState<any | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isBatchDialogOpen, setIsBatchDialogOpen] = useState(false)
  const [selectedBoxFilter, setSelectedBoxFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [boxes, setBoxes] = useState<Box[]>([])
  const [loadingBoxes, setLoadingBoxes] = useState(true)

  // Box confirm dialog state
  const [isBoxConfirmOpen, setIsBoxConfirmOpen] = useState(false)
  const [boxConfirmOrder, setBoxConfirmOrder] = useState<ProcessedOrder | null>(null)

  // Fetch boxes from API
  useEffect(() => {
    async function fetchBoxes() {
      try {
        const res = await fetch('/api/box-config')
        if (res.ok) {
          const data = await res.json()
          setBoxes(data.boxes || [])
        }
      } catch (e) {
        console.error('Failed to fetch boxes:', e)
      } finally {
        setLoadingBoxes(false)
      }
    }
    fetchBoxes()
  }, [])

  // Process orders to extract items
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

        const processedItems: Array<{ sku: string; name: string; quantity: number; color: string; size: string }> = nonInsuranceItems.map((item: any) => ({
          sku: item.sku || 'N/A',
          name: item.name || 'Unknown',
          quantity: item.quantity || 1,
          color: getColorFromSku(item.sku || '', item.name, item.color),
          size: getSizeFromSku(item.sku || ''),
        }))

        const totalQty = processedItems.reduce((sum, item) => sum + item.quantity, 0)
        const customerName = order?.shipTo?.name || order?.billTo?.name || 'Unknown'
        const orderDate = order?.orderDate || log.createdAt

        // Get box name from suggestedBox (already calculated during ingest)
        const boxName = log.suggestedBox?.boxName || null

        const processedOrder: ProcessedOrder = {
          log,
          order,
          items: processedItems,
          totalQty,
          boxName,
          customerName,
          orderDate: typeof orderDate === 'string' ? orderDate : orderDate.toISOString(),
        }

        return processedOrder
      })
      .filter((order): order is ProcessedOrder => order !== null)
  }, [orders])

  // Get unique box names from orders for filter options
  const boxNamesInOrders = useMemo(() => {
    const names = new Set<string>()
    processedOrders.forEach(order => {
      if (order.boxName) {
        names.add(order.boxName)
      }
    })
    // Sort by box priority
    return Array.from(names).sort((a, b) => {
      const boxA = boxes.find(box => box.name === a)
      const boxB = boxes.find(box => box.name === b)
      return (boxA?.priority || 999) - (boxB?.priority || 999)
    })
  }, [processedOrders, boxes])

  // Filter orders
  const filteredOrders = useMemo(() => {
    let filtered = processedOrders

    // Personalized filter (3-state)
    if (personalizedFilter === 'only') {
      filtered = filtered.filter(order => isOrderPersonalized(order.log.rawPayload))
    } else if (personalizedFilter === 'hide') {
      filtered = filtered.filter(order => !isOrderPersonalized(order.log.rawPayload))
    }

    // Expedited filter (3-state)
    if (expeditedFilter === 'only') {
      filtered = filtered.filter(order => {
        const customerReachedOut = (order.log as any).customerReachedOut || false
        return isOrderExpedited(order.log.rawPayload, customerReachedOut)
      })
    } else if (expeditedFilter === 'hide') {
      filtered = filtered.filter(order => {
        const customerReachedOut = (order.log as any).customerReachedOut || false
        return !isOrderExpedited(order.log.rawPayload, customerReachedOut)
      })
    }

    // Box filter
    if (selectedBoxFilter !== 'all') {
      if (selectedBoxFilter === 'unknown') {
        // Show orders with no box assigned
        filtered = filtered.filter(order => !order.boxName)
      } else {
        filtered = filtered.filter(order => order.boxName === selectedBoxFilter)
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
  }, [processedOrders, selectedBoxFilter, searchQuery, expeditedFilter, personalizedFilter])

  // Count orders per box
  const orderCountsByBox = useMemo(() => {
    const counts: Record<string, number> = { all: processedOrders.length, unknown: 0 }
    processedOrders.forEach(order => {
      if (order.boxName) {
        counts[order.boxName] = (counts[order.boxName] || 0) + 1
      } else {
        counts.unknown++
      }
    })
    return counts
  }, [processedOrders])

  // Get current box info for the selected filter
  const currentBoxInfo = useMemo(() => {
    if (selectedBoxFilter === 'all' || selectedBoxFilter === 'unknown') return null
    const box = boxes.find(b => b.name === selectedBoxFilter)
    if (!box) return null
    return {
      boxId: box.id,
      boxName: box.name,
      lengthInches: box.lengthInches,
      widthInches: box.widthInches,
      heightInches: box.heightInches,
      weightLbs: box.weightLbs,
    }
  }, [selectedBoxFilter, boxes])

  const handleRowClick = (order: ProcessedOrder) => {
    setSelectedOrder({
      orderNumber: order.log.orderNumber,
      orderKey: order.log.orderNumber,
      ...order.order,
    })
    setSelectedRawPayload(order.log.rawPayload)
    setIsDialogOpen(true)
  }

  const handleCloseDialog = () => {
    setIsDialogOpen(false)
    setSelectedOrder(null)
    setSelectedRawPayload(null)
  }

  const handleConfidenceClick = (order: ProcessedOrder, e: React.MouseEvent) => {
    e.stopPropagation() // Prevent row click from opening order dialog
    setBoxConfirmOrder(order)
    setIsBoxConfirmOpen(true)
  }

  const handleBoxConfirmClose = () => {
    setIsBoxConfirmOpen(false)
    setBoxConfirmOrder(null)
  }

  const handleBoxFeedbackSaved = () => {
    // Refresh the page to get updated box assignments
    window.location.reload()
  }

  const handleBatch = (packageInfo: { weight: string; dimensions: { length: string; width: string; height: string } }) => {
    generatePackingSlips(filteredOrders, packageInfo)
  }

  const generatePackingSlips = (orders: ProcessedOrder[], packageInfo: { weight: string; dimensions: { length: string; width: string; height: string } }) => {
    const generateBarcode = (orderNumber: string) => {
      return orderNumber.padStart(12, '0')
    }

    const packingSlipsHTML = `
<!DOCTYPE html>
<html>
<head>
  <title>Packing Slips</title>
  <style>
    @page { size: letter; margin: 0.5in; }
    body { font-family: Arial, Helvetica, sans-serif; margin: 0; padding: 0; }
    .packing-slip { width: 100%; min-height: 10in; border: 2px solid #000; padding: 0.5in; margin-bottom: 0.5in; page-break-after: always; box-sizing: border-box; }
    .packing-slip:last-child { page-break-after: auto; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; border-bottom: 2px solid #000; padding-bottom: 10px; }
    .order-info { flex: 1; }
    .order-number { font-size: 24px; font-weight: bold; margin-bottom: 5px; }
    .barcode-section { text-align: right; }
    .barcode { font-family: 'Courier New', monospace; font-size: 36px; font-weight: bold; letter-spacing: 3px; margin-bottom: 5px; }
    .barcode-lines { height: 60px; background: repeating-linear-gradient(90deg, #000 0px, #000 2px, transparent 2px, transparent 4px); background-size: 4px 100%; margin-top: 5px; }
    .content { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-bottom: 20px; }
    .section { margin-bottom: 15px; }
    .section-title { font-weight: bold; font-size: 14px; margin-bottom: 5px; border-bottom: 1px solid #000; padding-bottom: 3px; }
    .section-content { font-size: 12px; line-height: 1.6; }
    .items-table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    .items-table th, .items-table td { border: 1px solid #000; padding: 8px; text-align: left; }
    .items-table th { background-color: #f0f0f0; font-weight: bold; font-size: 11px; }
    .items-table td { font-size: 11px; }
    .package-info { margin-top: 20px; padding-top: 15px; border-top: 2px solid #000; font-size: 11px; }
    @media print { .packing-slip { page-break-inside: avoid; } }
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
        <div style="font-size: 14px; font-weight: bold; color: #333; margin-top: 5px;">Box: ${orderData.boxName || 'TBD'}</div>
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
        <p className="text-gray-500 text-lg">No orders found</p>
      </div>
    )
  }

  return (
    <>
      {/* Box Filter - Dynamic based on actual boxes */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Box</label>
        <div className="flex flex-wrap gap-2">
          {/* All button */}
          <button
            onClick={() => setSelectedBoxFilter('all')}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors flex items-center gap-2 ${
              selectedBoxFilter === 'all'
                ? 'bg-green-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            All ({orderCountsByBox.all})
          </button>

          {/* Dynamic box buttons */}
          {boxNamesInOrders.map((boxName) => {
            const box = boxes.find(b => b.name === boxName)
            const count = orderCountsByBox[boxName] || 0

            return (
              <button
                key={boxName}
                onClick={() => setSelectedBoxFilter(boxName)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors flex items-center gap-2 ${
                  selectedBoxFilter === boxName
                    ? 'bg-green-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
                }`}
              >
                {box?.singleCupOnly && (
                  <span className="w-2 h-2 rounded-full bg-purple-400"></span>
                )}
                {boxName} ({count})
              </button>
            )
          })}

          {/* Unknown/No Box button - only show if there are orders without boxes */}
          {orderCountsByBox.unknown > 0 && (
            <button
              onClick={() => setSelectedBoxFilter('unknown')}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors flex items-center gap-2 ${
                selectedBoxFilter === 'unknown'
                  ? 'bg-red-600 text-white'
                  : 'bg-white text-red-600 hover:bg-red-50 border border-red-300'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              No Box ({orderCountsByBox.unknown})
            </button>
          )}
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Orders by Box Size</h2>
            <p className="text-sm text-gray-500 mt-1">Orders organized by suggested box assignment</p>
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
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  ORDER ID
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  CUSTOMER
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  ITEMS
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  COLORS
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  BOX
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  CONFIDENCE
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  TOTAL QTY
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
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
                const suggestion = order.log.suggestedBox

                return (
                  <tr
                    key={order.log.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => handleRowClick(order)}
                  >
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                      #{order.log.orderNumber}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {order.customerName}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
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
                    <td className="px-4 py-3 text-sm text-gray-900">
                      <div className="space-y-1">
                        {displayedItems.map((item, idx) => (
                          <div key={idx} className="text-xs">
                            {item.color}
                          </div>
                        ))}
                        {remainingCount > 0 && (
                          <div className="text-xs text-gray-500">...</div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {order.boxName ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {order.boxName}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          No fit
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      {suggestion ? (
                        suggestion.confidence === 'confirmed' ? (
                          <span className="font-medium text-green-600">
                            ✓ Confirmed
                          </span>
                        ) : (
                          <button
                            onClick={(e) => handleConfidenceClick(order, e)}
                            className={`font-medium px-2 py-1 rounded hover:bg-gray-100 transition-colors ${
                              suggestion.confidence === 'calculated' ? 'text-amber-600 hover:text-amber-700' :
                              'text-red-600 hover:text-red-700'
                            }`}
                            title="Click to confirm or change box"
                          >
                            {suggestion.confidence === 'calculated' ? '○ Calculated' : '? Unknown'}
                            <span className="ml-1 text-xs">→</span>
                          </button>
                        )
                      ) : (
                        <button
                          onClick={(e) => handleConfidenceClick(order, e)}
                          className="text-gray-400 hover:text-gray-600 px-2 py-1 rounded hover:bg-gray-100 transition-colors"
                          title="Click to set box"
                        >
                          — Set box
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-center">
                      {order.totalQty}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
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
        rawPayload={selectedRawPayload}
      />
      <BatchDialog
        isOpen={isBatchDialogOpen}
        onClose={() => setIsBatchDialogOpen(false)}
        onBatch={handleBatch}
        orderCount={filteredOrders.length}
        suggestedBox={currentBoxInfo}
      />
      {boxConfirmOrder && (
        <BoxConfirmDialog
          isOpen={isBoxConfirmOpen}
          onClose={handleBoxConfirmClose}
          orderNumber={boxConfirmOrder.log.orderNumber}
          items={boxConfirmOrder.items}
          currentBoxName={boxConfirmOrder.boxName}
          currentConfidence={boxConfirmOrder.log.suggestedBox?.confidence || 'unknown'}
          onFeedbackSaved={handleBoxFeedbackSaved}
        />
      )}
    </>
  )
}
