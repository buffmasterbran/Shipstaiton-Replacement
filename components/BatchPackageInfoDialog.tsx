'use client'

import { Fragment, useState } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { XMarkIcon, ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline'
import { formatWeight } from '@/lib/weight-utils'
import PackageInfoDialog, { PackageInfo } from './PackageInfoDialog'

interface ProcessedOrder {
  log: any
  order: any
  mainItem: any
  size: string
  color: string
  customerName: string
  customerId?: string
  orderDate: string
  status: string
}

interface OrderBatch {
  id: string
  orders: ProcessedOrder[]
  size: string
  color: string
  label: string
}

interface BatchPackageInfoDialogProps {
  isOpen: boolean
  onClose: () => void
  batches: OrderBatch[]
  onProceed: (batchPackageInfo: Map<string, PackageInfo>) => void
}

export default function BatchPackageInfoDialog({
  isOpen,
  onClose,
  batches,
  onProceed,
}: BatchPackageInfoDialogProps) {
  const [batchPackageInfo, setBatchPackageInfo] = useState<Map<string, PackageInfo>>(new Map())
  const [editingBatchId, setEditingBatchId] = useState<string | null>(null)
  const [isPackageInfoDialogOpen, setIsPackageInfoDialogOpen] = useState(false)
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set())
  const [isSettingAllBatches, setIsSettingAllBatches] = useState(false)

  const handleEditBatch = (batchId: string) => {
    setEditingBatchId(batchId)
    setIsSettingAllBatches(false)
    setIsPackageInfoDialogOpen(true)
  }

  const handleSetAllBatches = () => {
    setIsSettingAllBatches(true)
    setEditingBatchId(null)
    setIsPackageInfoDialogOpen(true)
  }

  const handlePackageInfoSave = (info: PackageInfo) => {
    const newMap = new Map(batchPackageInfo)
    
    if (isSettingAllBatches) {
      // Apply to all batches
      batches.forEach(batch => {
        newMap.set(batch.id, info)
      })
      setIsSettingAllBatches(false)
    } else if (editingBatchId) {
      // Apply to single batch
      newMap.set(editingBatchId, info)
      setEditingBatchId(null)
    }
    
    setBatchPackageInfo(newMap)
    setIsPackageInfoDialogOpen(false)
  }

  const handleProceed = () => {
    // Check if all batches have package info
    const allBatchesHaveInfo = batches.every(batch => batchPackageInfo.has(batch.id))
    if (allBatchesHaveInfo) {
      onProceed(batchPackageInfo)
      handleClose()
    }
  }

  const handleClose = () => {
    setBatchPackageInfo(new Map())
    setEditingBatchId(null)
    setIsPackageInfoDialogOpen(false)
    onClose()
  }

  const allBatchesHaveInfo = batches.every(batch => batchPackageInfo.has(batch.id))

  const toggleBatchExpansion = (batchId: string) => {
    setExpandedBatches(prev => {
      const newSet = new Set(prev)
      if (newSet.has(batchId)) {
        newSet.delete(batchId)
      } else {
        newSet.add(batchId)
      }
      return newSet
    })
  }

  // Aggregate items for preview
  const getBatchPreview = (batch: OrderBatch) => {
    const itemMap = new Map<string, { sku: string; name: string; totalQty: number }>()
    
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
        })
      }
    })
    
    return Array.from(itemMap.values())
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
                        Auto Process: Set Package Info for Each Batch
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
                    <div className="mb-4 flex items-center justify-between">
                      <div className="text-sm text-gray-600">
                        {batches.length} batch{batches.length !== 1 ? 'es' : ''} will be processed. Set package information for each batch below.
                      </div>
                      <button
                        onClick={handleSetAllBatches}
                        className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium flex items-center gap-2"
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
                            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                          />
                        </svg>
                        Set All Batches
                      </button>
                    </div>
                    
                    <div className="space-y-4">
                      {batches.map((batch) => {
                        const preview = getBatchPreview(batch)
                        const packageInfo = batchPackageInfo.get(batch.id)
                        
                        return (
                          <div
                            key={batch.id}
                            className="border border-gray-200 rounded-lg p-4 hover:border-green-500 transition-colors"
                          >
                            <div className="flex items-start justify-between mb-3">
                              <div>
                                <h4 className="text-lg font-semibold text-gray-900 mb-1">
                                  {batch.label}
                                </h4>
                                <p className="text-sm text-gray-600">
                                  {batch.orders.length} order{batch.orders.length !== 1 ? 's' : ''}
                                </p>
                              </div>
                              <button
                                onClick={() => handleEditBatch(batch.id)}
                                className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                                  packageInfo
                                    ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                    : 'bg-blue-600 text-white hover:bg-blue-700'
                                }`}
                              >
                                {packageInfo ? 'Edit Package Info' : 'Set Package Info'}
                              </button>
                            </div>
                            
                            {packageInfo && (
                              <div className="mt-3 p-3 bg-gray-50 rounded-lg text-sm">
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <span className="font-medium">Carrier:</span> {packageInfo.carrier}
                                  </div>
                                  <div>
                                    <span className="font-medium">Service:</span> {packageInfo.service}
                                  </div>
                                  <div>
                                    <span className="font-medium">Weight:</span> {formatWeight(parseFloat(packageInfo.weight) || 0)}
                                  </div>
                                  <div>
                                    <span className="font-medium">Dimensions:</span> {packageInfo.dimensions.length}"×{packageInfo.dimensions.width}"×{packageInfo.dimensions.height}"
                                  </div>
                                  <div>
                                    <span className="font-medium">Packaging:</span> {packageInfo.packaging}
                                  </div>
                                </div>
                              </div>
                            )}
                            
                            {/* Preview */}
                            <div className="mt-3">
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-xs font-medium text-gray-500">Items in this batch:</p>
                                <button
                                  onClick={() => toggleBatchExpansion(batch.id)}
                                  className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                                >
                                  {expandedBatches.has(batch.id) ? (
                                    <>
                                      <ChevronUpIcon className="w-4 h-4" />
                                      Hide Orders
                                    </>
                                  ) : (
                                    <>
                                      <ChevronDownIcon className="w-4 h-4" />
                                      Show Orders ({batch.orders.length})
                                    </>
                                  )}
                                </button>
                              </div>
                              <div className="space-y-1">
                                {preview.map((item) => (
                                  <div key={item.sku} className="text-xs text-gray-600 flex justify-between">
                                    <span className="font-mono">{item.sku}</span>
                                    <span className="ml-2">Qty: {item.totalQty}</span>
                                  </div>
                                ))}
                              </div>
                              
                              {/* Expanded Orders List */}
                              {expandedBatches.has(batch.id) && (
                                <div className="mt-3 pt-3 border-t border-gray-200">
                                  <p className="text-xs font-medium text-gray-500 mb-2">Orders in this batch:</p>
                                  <div className="max-h-60 overflow-y-auto">
                                    <table className="w-full text-xs">
                                      <thead className="bg-gray-50 sticky top-0">
                                        <tr>
                                          <th className="px-2 py-1.5 text-left font-medium text-gray-700">Order #</th>
                                          <th className="px-2 py-1.5 text-left font-medium text-gray-700">Customer</th>
                                          <th className="px-2 py-1.5 text-left font-medium text-gray-700">SKU</th>
                                          <th className="px-2 py-1.5 text-left font-medium text-gray-700">Qty</th>
                                          <th className="px-2 py-1.5 text-left font-medium text-gray-700">Date</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-gray-100">
                                        {batch.orders.map((order, idx) => (
                                          <tr key={idx} className="hover:bg-gray-50">
                                            <td className="px-2 py-1.5 text-gray-900 font-mono">
                                              #{order.log.orderNumber}
                                            </td>
                                            <td className="px-2 py-1.5 text-gray-600">
                                              {order.customerName}
                                            </td>
                                            <td className="px-2 py-1.5 text-gray-600 font-mono">
                                              {order.mainItem.sku || 'N/A'}
                                            </td>
                                            <td className="px-2 py-1.5 text-gray-600">
                                              {order.mainItem.quantity || 1}
                                            </td>
                                            <td className="px-2 py-1.5 text-gray-500">
                                              {new Date(order.orderDate).toLocaleDateString()}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
                    <button
                      onClick={handleClose}
                      className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleProceed}
                      disabled={!allBatchesHaveInfo}
                      className={`px-4 py-2 rounded-lg transition-colors ${
                        allBatchesHaveInfo
                          ? 'bg-green-600 text-white hover:bg-green-700'
                          : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      }`}
                    >
                      Process All Batches ({batches.length})
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
        onClose={() => {
          setIsPackageInfoDialogOpen(false)
          setEditingBatchId(null)
          setIsSettingAllBatches(false)
        }}
        onSave={handlePackageInfoSave}
      />
    </>
  )
}

