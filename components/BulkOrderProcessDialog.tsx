'use client'

import { Fragment, useState, useEffect } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import PackageInfoDialog, { PackageInfo } from './PackageInfoDialog'
import ProcessDialog from './ProcessDialog'

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
    log: {
      id: string
      orderNumber: string
      status: string
      rawPayload: any
      createdAt: Date
      updatedAt: Date
    }
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

interface BulkOrderProcessDialogProps {
  isOpen: boolean
  onClose: () => void
  group: BulkOrderGroup | null
  onProceed: () => void
  shippingRate?: ShippingRate
  onSavePackageInfo: (info: PackageInfo) => void
}

export default function BulkOrderProcessDialog({
  isOpen,
  onClose,
  group,
  onProceed,
  shippingRate,
  onSavePackageInfo,
}: BulkOrderProcessDialogProps) {
  const [isPackageInfoDialogOpen, setIsPackageInfoDialogOpen] = useState(false)
  const [isProcessDialogOpen, setIsProcessDialogOpen] = useState(false)

  if (!group) return null

  const handleClose = () => {
    setIsPackageInfoDialogOpen(false)
    setIsProcessDialogOpen(false)
    onClose()
  }

  const handlePackageInfoClick = () => {
    setIsPackageInfoDialogOpen(true)
  }

  const handleProcessOrdersClick = () => {
    if (shippingRate && shippingRate.price && shippingRate.service) {
      setIsProcessDialogOpen(true)
    } else {
      // If no rates, open package info first
      setIsPackageInfoDialogOpen(true)
    }
  }

  const handlePackageInfoSave = (info: PackageInfo) => {
    onSavePackageInfo(info)
    setIsPackageInfoDialogOpen(false)
  }

  const handleProcessProceed = () => {
    setIsProcessDialogOpen(false)
    onProceed()
  }

  return (
    <>
      <Transition appear show={isOpen} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={handleClose}>
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
                  <div className="bg-gradient-to-r from-green-600 to-green-700 px-6 py-4">
                    <div className="flex items-center justify-between">
                      <Dialog.Title as="h3" className="text-xl font-bold text-white">
                        Bulk Order
                      </Dialog.Title>
                      <button
                        onClick={handleClose}
                        className="rounded-full p-1 text-white hover:bg-white/20 transition-colors"
                      >
                        <XMarkIcon className="h-6 w-6" />
                      </button>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="max-h-[calc(100vh-300px)] overflow-y-auto p-6">
                    {/* Summary and Package Info Section - Side by Side */}
                    <div className="mb-6 border-b border-gray-200 pb-6">
                      <div className="grid grid-cols-2 gap-6">
                        {/* Summary Section */}
                        <div>
                          <h4 className="text-lg font-semibold text-gray-900 mb-2">
                            {group.totalOrders} Identical Orders
                          </h4>
                          <div>
                            <h5 className="text-sm font-medium text-gray-700 mb-2">Items in each order:</h5>
                            <ul className="list-disc list-inside space-y-1">
                              {group.items.map((item, idx) => (
                                <li key={idx} className="text-sm text-gray-900">
                                  <span className="font-mono">{item.sku}</span> × {item.quantity}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>

                        {/* Package Info Section */}
                        <div>
                          <h5 className="text-sm font-medium text-gray-700 mb-3">Package Information</h5>
                          <button
                            onClick={handlePackageInfoClick}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                          >
                            Set Package Info
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Orders Table */}
                    <div className="mb-6">
                      <h5 className="text-sm font-medium text-gray-700 mb-3">Orders:</h5>
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
                                ORDERED DATE
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                SERVICE
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                RATE
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {group.orders.map((orderData, idx) => {
                              const orderDate = orderData.orderDate
                                ? new Date(orderData.orderDate).toLocaleDateString('en-US', {
                                    month: '2-digit',
                                    day: '2-digit',
                                    year: 'numeric',
                                  })
                                : 'N/A'
                              
                              return (
                                <tr key={idx} className="hover:bg-gray-50">
                                  <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                                    #{orderData.log.orderNumber}
                                  </td>
                                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                    {orderData.customerName}
                                  </td>
                                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                    {orderDate}
                                  </td>
                                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                    {shippingRate?.service || '-'}
                                  </td>
                                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                    {shippingRate?.price || '-'}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
                    <button
                      onClick={handleClose}
                      className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors"
                    >
                      Close
                    </button>
                    <button
                      onClick={handleProcessOrdersClick}
                      disabled={!shippingRate || !shippingRate.price || !shippingRate.service}
                      className={`px-4 py-2 rounded-lg transition-colors ${
                        shippingRate && shippingRate.price && shippingRate.service
                          ? 'bg-green-600 text-white hover:bg-green-700'
                          : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      }`}
                    >
                      Process Orders
                    </button>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>

      {/* Package Info Dialog */}
      <PackageInfoDialog
        isOpen={isPackageInfoDialogOpen}
        onClose={() => setIsPackageInfoDialogOpen(false)}
        onSave={handlePackageInfoSave}
      />

      {/* Process Confirmation Dialog */}
      <ProcessDialog
        isOpen={isProcessDialogOpen}
        onClose={() => setIsProcessDialogOpen(false)}
        orderCount={group.totalOrders}
        onProceed={handleProcessProceed}
      />
    </>
  )
}

