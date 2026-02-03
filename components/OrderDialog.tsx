'use client'

import { Fragment, useState } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { XMarkIcon, CodeBracketIcon } from '@heroicons/react/24/outline'

interface OrderItem {
  sku?: string
  name?: string
  color?: string
  quantity?: number
  unitPrice?: number
  weight?: {
    value?: number
    units?: string
  }
}

interface Order {
  orderNumber?: string
  orderKey?: string
  orderDate?: string
  orderStatus?: string
  customerName?: string
  shipTo?: {
    name?: string
    company?: string
    street1?: string
    street2?: string
    city?: string
    state?: string
    postalCode?: string
    country?: string
    phone?: string
    residential?: boolean
  }
  billTo?: {
    name?: string
    street1?: string
    street2?: string
    city?: string
    state?: string
    postalCode?: string
    country?: string
    phone?: string
  }
  items?: OrderItem[]
  amountPaid?: number
  taxAmount?: number
  shippingAmount?: number
  weight?: {
    value?: number
    units?: string
  }
  dimensions?: {
    length?: number
    width?: number
    height?: number
    units?: string
  }
  requestedShippingService?: string
  paymentMethod?: string
  advancedOptions?: {
    customField1?: string
  }
}

interface OrderDialogProps {
  isOpen: boolean
  onClose: () => void
  order: Order | null
  rawPayload?: any // Full JSON payload for debugging
  onGetRates?: () => void // Callback to open rate test dialog
}

function formatAddress(address: any) {
  if (!address) return 'N/A'
  const parts = [
    address.street1,
    address.street2,
    `${address.city}, ${address.state} ${address.postalCode}`,
    address.country,
  ].filter(Boolean)
  return parts.join('\n')
}

function formatCurrency(amount: number | string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(amount))
}

export default function OrderDialog({ isOpen, onClose, order, rawPayload, onGetRates }: OrderDialogProps) {
  const [showJson, setShowJson] = useState(false)

  if (!order) return null

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-25" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-4xl transform overflow-hidden rounded-2xl bg-white text-left align-middle shadow-xl transition-all">
                {/* Header */}
                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4">
                  <div className="flex items-center justify-between">
                    <Dialog.Title as="h3" className="text-xl font-bold text-white">
                      Order #{order.orderNumber || 'N/A'}
                    </Dialog.Title>
                    <button
                      onClick={onClose}
                      className="rounded-full p-1 text-white hover:bg-white/20 transition-colors"
                    >
                      <XMarkIcon className="h-6 w-6" />
                    </button>
                  </div>
                  {order.orderKey && (
                    <p className="text-sm text-blue-100 mt-1">
                      NetSuite ID: {order.orderKey}
                    </p>
                  )}
                </div>

                {/* Content */}
                <div className="max-h-[calc(100vh-200px)] overflow-y-auto p-6">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                    {/* Order Information */}
                    <div className="bg-gray-50 rounded-lg p-4">
                      <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">
                        Order Information
                      </h3>
                      <div className="space-y-2 text-sm">
                        <div>
                          <span className="font-medium text-gray-600">Order Date:</span>{' '}
                          <span className="text-gray-900">
                            {order.orderDate
                              ? new Date(order.orderDate).toLocaleDateString()
                              : 'N/A'}
                          </span>
                        </div>
                        <div>
                          <span className="font-medium text-gray-600">Status:</span>{' '}
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            {order.orderStatus || 'Awaiting Shipment'}
                          </span>
                        </div>
                        {order.requestedShippingService && (
                          <div>
                            <span className="font-medium text-gray-600">Shipping Method:</span>{' '}
                            <span className="text-gray-900">{order.requestedShippingService}</span>
                          </div>
                        )}
                        {order.paymentMethod && (
                          <div>
                            <span className="font-medium text-gray-600">Payment:</span>{' '}
                            <span className="text-gray-900">{order.paymentMethod}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Package Information */}
                    <div className="bg-gray-50 rounded-lg p-4">
                      <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">
                        Package Details
                      </h3>
                      <div className="space-y-2 text-sm">
                        {order.dimensions && (
                          <div>
                            <span className="font-medium text-gray-600">Dimensions:</span>{' '}
                            <span className="text-gray-900">
                              {order.dimensions.length}" × {order.dimensions.width}" ×{' '}
                              {order.dimensions.height}" ({order.dimensions.units || 'inches'})
                            </span>
                          </div>
                        )}
                        {order.weight && (
                          <div>
                            <span className="font-medium text-gray-600">Weight:</span>{' '}
                            <span className="text-gray-900">
                              {order.weight.value} {order.weight.units || 'lbs'}
                            </span>
                          </div>
                        )}
                        {order.amountPaid !== undefined && (
                          <div>
                            <span className="font-medium text-gray-600">Amount Paid:</span>{' '}
                            <span className="text-gray-900 font-semibold">
                              {formatCurrency(order.amountPaid)}
                            </span>
                          </div>
                        )}
                        {order.shippingAmount !== undefined && (
                          <div>
                            <span className="font-medium text-gray-600">Shipping Cost:</span>{' '}
                            <span className="text-gray-900">
                              {formatCurrency(order.shippingAmount)}
                            </span>
                          </div>
                        )}
                        {order.taxAmount !== undefined && order.taxAmount > 0 && (
                          <div>
                            <span className="font-medium text-gray-600">Tax:</span>{' '}
                            <span className="text-gray-900">{formatCurrency(order.taxAmount)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Shipping Address */}
                  {order.shipTo && (
                    <div className="bg-gray-50 rounded-lg p-4 mb-6">
                      <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">
                        Shipping Address
                      </h3>
                      <div className="text-sm text-gray-900 whitespace-pre-line">
                        <div className="font-medium">{order.shipTo.name}</div>
                        {order.shipTo.company && (
                          <div className="text-gray-600">{order.shipTo.company}</div>
                        )}
                        <div className="mt-2">{formatAddress(order.shipTo)}</div>
                        {order.shipTo.phone && (
                          <div className="mt-2 text-gray-600">📞 {order.shipTo.phone}</div>
                        )}
                        {order.shipTo.residential !== undefined && (
                          <div className="mt-2 text-xs text-gray-500">
                            {order.shipTo.residential ? 'Residential' : 'Commercial'}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Billing Address */}
                  {order.billTo && (
                    <div className="bg-gray-50 rounded-lg p-4 mb-6">
                      <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">
                        Billing Address
                      </h3>
                      <div className="text-sm text-gray-900 whitespace-pre-line">
                        <div className="font-medium">{order.billTo.name}</div>
                        <div className="mt-2">{formatAddress(order.billTo)}</div>
                        {order.billTo.phone && (
                          <div className="mt-2 text-gray-600">📞 {order.billTo.phone}</div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Order Items */}
                  {order.items && order.items.length > 0 && (
                    <div className="mb-6">
                      <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">
                        Order Items ({order.items.length})
                      </h3>
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                SKU
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Item
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Color
                              </th>
                              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Qty
                              </th>
                              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Price
                              </th>
                              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Weight
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {order.items.map((item: OrderItem, idx: number) => (
                              <tr key={idx} className="hover:bg-gray-50">
                                <td className="px-4 py-3 whitespace-nowrap text-sm font-mono text-gray-900">
                                  {item.sku || 'N/A'}
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-900">
                                  <div className="font-medium">{item.name || 'Unnamed Item'}</div>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                  {item.color || '—'}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-right">
                                  {item.quantity || 0}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-right">
                                  {item.unitPrice
                                    ? formatCurrency(item.unitPrice)
                                    : '$0.00'}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 text-right">
                                  {item.weight?.value
                                    ? `${item.weight.value} ${item.weight.units || 'lbs'}`
                                    : 'N/A'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  {order.advancedOptions?.customField1 && (
                    <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
                      <h3 className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wide">
                        Notes
                      </h3>
                      <p className="text-sm text-gray-900">{order.advancedOptions.customField1}</p>
                    </div>
                  )}
                </div>

                {/* Raw JSON (when toggled) */}
                {showJson && rawPayload && (
                  <div className="px-6 pb-4">
                    <div className="bg-gray-900 rounded-lg p-4 max-h-96 overflow-auto">
                      <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap">
                        {JSON.stringify(rawPayload, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}

                {/* Footer */}
                <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex justify-between">
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowJson(!showJson)}
                      className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded-lg transition-colors"
                    >
                      <CodeBracketIcon className="h-4 w-4" />
                      {showJson ? 'Hide JSON' : 'Show JSON'}
                    </button>
                    {onGetRates && (
                      <button
                        onClick={onGetRates}
                        className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                      >
                        🚚 Get Rates (Test)
                      </button>
                    )}
                  </div>
                  <button
                    onClick={onClose}
                    className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                  >
                    Close
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}

