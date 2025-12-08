'use client'

import { Fragment, useState } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { XMarkIcon } from '@heroicons/react/24/outline'

interface BatchDialogProps {
  isOpen: boolean
  onClose: () => void
  onBatch: (packageInfo: { weight: string; dimensions: { length: string; width: string; height: string } }) => void
  orderCount: number
}

export default function BatchDialog({
  isOpen,
  onClose,
  onBatch,
  orderCount,
}: BatchDialogProps) {
  const [weight, setWeight] = useState('')
  const [dimensions, setDimensions] = useState({
    length: '',
    width: '',
    height: '',
  })
  const [errors, setErrors] = useState<{ [key: string]: string }>({})

  const handleChange = (field: string, value: string) => {
    if (field.startsWith('dimensions.')) {
      const dimField = field.split('.')[1]
      setDimensions((prev) => ({
        ...prev,
        [dimField]: value,
      }))
    } else {
      setWeight(value)
    }
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev }
        delete newErrors[field]
        return newErrors
      })
    }
  }

  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {}

    if (!weight) newErrors.weight = 'Weight is required'
    if (!dimensions.length) newErrors['dimensions.length'] = 'Length is required'
    if (!dimensions.width) newErrors['dimensions.width'] = 'Width is required'
    if (!dimensions.height) newErrors['dimensions.height'] = 'Height is required'

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleBatch = () => {
    if (validateForm()) {
      onBatch({
        weight,
        dimensions,
      })
      handleClose()
    }
  }

  const handleClose = () => {
    setWeight('')
    setDimensions({ length: '', width: '', height: '' })
    setErrors({})
    onClose()
  }

  const isFormValid = !!(
    weight &&
    dimensions.length &&
    dimensions.width &&
    dimensions.height
  )

  return (
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
              <Dialog.Panel className="w-full max-w-2xl transform overflow-hidden rounded-2xl bg-white text-left align-middle shadow-xl transition-all">
                {/* Header */}
                <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4">
                  <div className="flex items-center justify-between">
                    <Dialog.Title as="h3" className="text-xl font-bold text-white">
                      Batch {orderCount} Order{orderCount !== 1 ? 's' : ''}
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
                  <div className="space-y-6">
                    {/* Weight */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Weight (lbs) <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={weight}
                        onChange={(e) => handleChange('weight', e.target.value)}
                        className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          errors.weight ? 'border-red-500' : 'border-gray-300'
                        }`}
                        placeholder="0.0"
                      />
                      {errors.weight && (
                        <p className="mt-1 text-sm text-red-500">{errors.weight}</p>
                      )}
                    </div>

                    {/* Dimensions */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Dimensions (inches) <span className="text-red-500">*</span>
                      </label>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <input
                            type="number"
                            step="0.1"
                            value={dimensions.length}
                            onChange={(e) => handleChange('dimensions.length', e.target.value)}
                            className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                              errors['dimensions.length'] ? 'border-red-500' : 'border-gray-300'
                            }`}
                            placeholder="Length"
                          />
                          {errors['dimensions.length'] && (
                            <p className="mt-1 text-xs text-red-500">Required</p>
                          )}
                        </div>
                        <div>
                          <input
                            type="number"
                            step="0.1"
                            value={dimensions.width}
                            onChange={(e) => handleChange('dimensions.width', e.target.value)}
                            className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                              errors['dimensions.width'] ? 'border-red-500' : 'border-gray-300'
                            }`}
                            placeholder="Width"
                          />
                          {errors['dimensions.width'] && (
                            <p className="mt-1 text-xs text-red-500">Required</p>
                          )}
                        </div>
                        <div>
                          <input
                            type="number"
                            step="0.1"
                            value={dimensions.height}
                            onChange={(e) => handleChange('dimensions.height', e.target.value)}
                            className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                              errors['dimensions.height'] ? 'border-red-500' : 'border-gray-300'
                            }`}
                            placeholder="Height"
                          />
                          {errors['dimensions.height'] && (
                            <p className="mt-1 text-xs text-red-500">Required</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
                  <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-sm text-gray-700">
                      When you batch this order, the orders will be created in ShipStation and barcodes will be on the packing slips we can scan and ship in ShipStation. We will set the weight, package size and orders will come in as Rate Shopper unless specified.
                    </p>
                  </div>
                  <div className="flex justify-end gap-3">
                    <button
                      onClick={handleClose}
                      className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleBatch}
                      disabled={!isFormValid}
                      className={`px-4 py-2 rounded-lg transition-colors ${
                        isFormValid
                          ? 'bg-blue-600 text-white hover:bg-blue-700'
                          : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      }`}
                    >
                      Batch Orders
                    </button>
                  </div>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}

