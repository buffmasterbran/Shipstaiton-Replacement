'use client'

import { useState } from 'react'

interface PackingSlipOrder {
  orderNumber: string
  customerName: string
  shipTo: {
    name: string
    address1?: string
    city?: string
    state?: string
    zip?: string
    country?: string
  }
  items: Array<{
    sku: string
    name: string
    quantity: number
  }>
}

interface PackingSlipButtonProps {
  /** Function that returns order data for the packing slips */
  getOrders: () => PackingSlipOrder[]
  /** Button label */
  label?: string
  /** Disabled state */
  disabled?: boolean
  /** Optional class name overrides */
  className?: string
}

/**
 * Fallback button that generates printable packing slips
 * when the main batch queue system fails.
 */
export default function PackingSlipButton({
  getOrders,
  label = 'Print Packing Slips (Fallback)',
  disabled = false,
  className,
}: PackingSlipButtonProps) {
  const [generating, setGenerating] = useState(false)

  const handlePrint = async () => {
    setGenerating(true)
    try {
      const orders = getOrders()
      if (orders.length === 0) {
        alert('No orders to print packing slips for.')
        return
      }

      const today = new Date().toLocaleDateString()

      const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Packing Slips</title>
  <style>
    @page { size: letter; margin: 0.5in; }
    body { font-family: Arial, sans-serif; margin: 0; padding: 0; }
    .slip {
      page-break-after: always;
      padding: 0.5in;
      max-width: 7.5in;
    }
    .slip:last-child { page-break-after: auto; }
    .header {
      display: flex;
      justify-content: space-between;
      border-bottom: 2px solid #000;
      padding-bottom: 10px;
      margin-bottom: 20px;
    }
    .order-number { font-size: 24px; font-weight: bold; }
    .date { font-size: 14px; color: #666; }
    .ship-to {
      margin-bottom: 20px;
      padding: 10px;
      background: #f5f5f5;
      border-radius: 4px;
    }
    .ship-to h3 { margin: 0 0 5px 0; font-size: 14px; color: #666; }
    .ship-to p { margin: 2px 0; font-size: 16px; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 10px;
    }
    th {
      text-align: left;
      padding: 8px 4px;
      border-bottom: 2px solid #000;
      font-size: 12px;
      text-transform: uppercase;
      color: #666;
    }
    td {
      padding: 8px 4px;
      border-bottom: 1px solid #ddd;
      font-size: 14px;
    }
    .sku { font-family: monospace; font-size: 13px; }
    .qty { text-align: center; font-weight: bold; font-size: 16px; }
    .footer {
      margin-top: 30px;
      padding-top: 10px;
      border-top: 1px solid #ddd;
      font-size: 11px;
      color: #999;
      text-align: center;
    }
  </style>
</head>
<body>
${orders.map((order, idx) => `
  <div class="slip">
    <div class="header">
      <div>
        <div class="order-number">Order #${order.orderNumber}</div>
        <div class="date">${today}</div>
      </div>
      <div style="text-align: right; font-size: 14px; color: #666;">
        Slip ${idx + 1} of ${orders.length}
      </div>
    </div>
    <div class="ship-to">
      <h3>Ship To:</h3>
      <p><strong>${order.shipTo.name || order.customerName}</strong></p>
      ${order.shipTo.address1 ? `<p>${order.shipTo.address1}</p>` : ''}
      ${order.shipTo.city ? `<p>${order.shipTo.city}, ${order.shipTo.state || ''} ${order.shipTo.zip || ''}</p>` : ''}
      ${order.shipTo.country && order.shipTo.country !== 'US' ? `<p>${order.shipTo.country}</p>` : ''}
    </div>
    <table>
      <thead>
        <tr>
          <th style="width:30%">SKU</th>
          <th style="width:50%">Item</th>
          <th style="width:20%; text-align: center">Qty</th>
        </tr>
      </thead>
      <tbody>
        ${order.items.map(item => `
          <tr>
            <td class="sku">${item.sku}</td>
            <td>${item.name}</td>
            <td class="qty">${item.quantity}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <div class="footer">
      Packing slip generated ${today} — FALLBACK MODE
    </div>
  </div>
`).join('')}
</body>
</html>`

      // Open in new window for printing
      const printWindow = window.open('', '_blank')
      if (printWindow) {
        printWindow.document.write(html)
        printWindow.document.close()
        printWindow.focus()
        printWindow.print()
      }
    } finally {
      setGenerating(false)
    }
  }

  return (
    <button
      onClick={handlePrint}
      disabled={disabled || generating}
      className={className || 'px-3 py-1.5 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50'}
    >
      {generating ? 'Generating...' : label}
    </button>
  )
}
