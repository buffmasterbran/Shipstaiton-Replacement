'use client'

import { Fragment } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { XMarkIcon } from '@heroicons/react/24/outline'

interface ProcessDialogProps {
  isOpen: boolean
  onClose: () => void
  orderCount: number
  onProceed: () => void
  /** When set, this is a "Send to queue" confirmation for bulk (shows chunk message) */
  bulkChunkCount?: number
}

export default function ProcessDialog({
  isOpen,
  onClose,
  orderCount,
  onProceed,
  bulkChunkCount,
}: ProcessDialogProps) {
  const handleProceed = () => {
    onProceed()
    onClose()
  }

  const isSendToQueue = bulkChunkCount != null

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
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white text-left align-middle shadow-xl transition-all">
                {/* Header */}
                <div className="bg-gradient-to-r from-green-600 to-green-700 px-6 py-4">
                  <div className="flex items-center justify-between">
                    <Dialog.Title as="h3" className="text-xl font-bold text-white">
                      {isSendToQueue ? 'Send to queue' : `Process ${orderCount} Order${orderCount !== 1 ? 's' : ''}`}
                    </Dialog.Title>
                    <button
                      onClick={onClose}
                      className="rounded-full p-1 text-white hover:bg-white/20 transition-colors"
                    >
                      <XMarkIcon className="h-6 w-6" />
                    </button>
                  </div>
                </div>

                {/* Content */}
                <div className="p-6">
                  <div className="mb-6">
                    {isSendToQueue ? (
                      <p className="text-gray-700 text-base leading-relaxed">
                        This will send this bulk ({orderCount} orders) to the queue as <strong>{bulkChunkCount} packer batch(es)</strong> (max 24 orders each). Packers will verify items and print labels from <strong>Bulk Verification</strong>.
                      </p>
                    ) : (
                      <p className="text-gray-700 text-base leading-relaxed">
                        By proceeding with this process, you will create labels in ShipEngine and set item fulfillment in NetSuite to shipped.
                      </p>
                    )}
                  </div>
                </div>

                {/* Footer */}
                <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
                  <button
                    onClick={onClose}
                    className="px-6 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleProceed}
                    className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    {isSendToQueue ? 'Send to queue' : 'Proceed'}
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
