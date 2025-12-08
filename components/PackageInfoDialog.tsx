'use client'

import { Fragment, useState } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { XMarkIcon } from '@heroicons/react/24/outline'

interface PackageInfoDialogProps {
  isOpen: boolean
  onClose: () => void
  onSave: (packageInfo: PackageInfo) => void
}

export interface PackageInfo {
  weight: string
  dimensions: {
    length: string
    width: string
    height: string
  }
  carrier: string
  service: string
  packaging: string
}

interface Preset {
  name: string
  packageInfo: PackageInfo
}

const PRESETS: Preset[] = [
  {
    name: 'Single 10oz',
    packageInfo: {
      weight: '0.5',
      dimensions: {
        length: '7',
        width: '7',
        height: '2',
      },
      carrier: 'USPS',
      service: 'First Class',
      packaging: 'Package',
    },
  },
  {
    name: 'Single 16oz',
    packageInfo: {
      weight: '0.7',
      dimensions: {
        length: '7',
        width: '7',
        height: '2.5',
      },
      carrier: 'USPS',
      service: 'First Class',
      packaging: 'Package',
    },
  },
  {
    name: 'Single 26oz',
    packageInfo: {
      weight: '1.0',
      dimensions: {
        length: '7',
        width: '7',
        height: '3',
      },
      carrier: 'USPS',
      service: 'Priority Mail',
      packaging: 'Package',
    },
  },
]

export default function PackageInfoDialog({
  isOpen,
  onClose,
  onSave,
}: PackageInfoDialogProps) {
  const [formData, setFormData] = useState<PackageInfo>({
    weight: '',
    dimensions: {
      length: '',
      width: '',
      height: '',
    },
    carrier: '',
    service: '',
    packaging: '',
  })

  const [errors, setErrors] = useState<{ [key: string]: string }>({})
  const [selectedPreset, setSelectedPreset] = useState<string>('')

  const handlePresetChange = (presetName: string) => {
    setSelectedPreset(presetName)
    if (presetName) {
      const preset = PRESETS.find((p) => p.name === presetName)
      if (preset) {
        setFormData(preset.packageInfo)
        setErrors({}) // Clear any errors since preset fills all required fields
      }
    }
  }

  const handleChange = (field: string, value: string) => {
    // Clear preset selection on manual change
    if (selectedPreset) {
      setSelectedPreset('')
    }
    if (field.startsWith('dimensions.')) {
      const dimField = field.split('.')[1]
      setFormData((prev) => ({
        ...prev,
        dimensions: {
          ...prev.dimensions,
          [dimField]: value,
        },
      }))
    } else {
      setFormData((prev) => ({
        ...prev,
        [field]: value,
      }))
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

  const isRateShopping = formData.carrier === 'Rate Shopper - Cheapest' || formData.carrier === 'Rate Shopper - Fastest'

  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {}

    if (!formData.weight) newErrors.weight = 'Weight is required'
    if (!formData.dimensions.length) newErrors['dimensions.length'] = 'Length is required'
    if (!formData.dimensions.width) newErrors['dimensions.width'] = 'Width is required'
    if (!formData.dimensions.height) newErrors['dimensions.height'] = 'Height is required'
    if (!formData.carrier) newErrors.carrier = 'Carrier is required'
    // Service is not required for rate shopping
    if (!isRateShopping && !formData.service) newErrors.service = 'Service is required'
    if (!formData.packaging) newErrors.packaging = 'Packaging is required'

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const isFormValid = (): boolean => {
    return !!(
      formData.weight &&
      formData.dimensions.length &&
      formData.dimensions.width &&
      formData.dimensions.height &&
      formData.carrier &&
      (isRateShopping || formData.service) &&
      formData.packaging
    )
  }

  const handleSave = () => {
    if (validateForm()) {
      onSave(formData)
      handleClose()
    }
  }

  const handleClose = () => {
    setFormData({
      weight: '',
      dimensions: {
        length: '',
        width: '',
        height: '',
      },
      carrier: '',
      service: '',
      packaging: '',
    })
    setErrors({})
    onClose()
  }

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
                      Set Package Information
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
                    {/* Presets */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Presets
                      </label>
                      <select
                        value={selectedPreset}
                        onChange={(e) => handlePresetChange(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Select a preset...</option>
                        {PRESETS.map((preset) => (
                          <option key={preset.name} value={preset.name}>
                            {preset.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Weight */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Weight (lbs) <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={formData.weight}
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
                            value={formData.dimensions.length}
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
                            value={formData.dimensions.width}
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
                            value={formData.dimensions.height}
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

                    {/* Carrier */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Carrier <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={formData.carrier}
                        onChange={(e) => handleChange('carrier', e.target.value)}
                        className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          errors.carrier ? 'border-red-500' : 'border-gray-300'
                        }`}
                      >
                        <option value="">Select Carrier</option>
                        <option value="USPS">USPS</option>
                        <option value="UPS">UPS</option>
                        <option value="FedEx">FedEx</option>
                        <option value="DHL">DHL</option>
                        <option value="Rate Shopper - Cheapest">Rate Shopper - Cheapest</option>
                        <option value="Rate Shopper - Fastest">Rate Shopper - Fastest</option>
                      </select>
                      {errors.carrier && (
                        <p className="mt-1 text-sm text-red-500">{errors.carrier}</p>
                      )}
                    </div>

                    {/* Service */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Service {!isRateShopping && <span className="text-red-500">*</span>}
                      </label>
                      <select
                        value={formData.service}
                        onChange={(e) => handleChange('service', e.target.value)}
                        className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          errors.service ? 'border-red-500' : 'border-gray-300'
                        }`}
                        disabled={!formData.carrier || isRateShopping}
                      >
                        <option value="">Select Service</option>
                        {formData.carrier === 'USPS' && (
                          <>
                            <option value="First Class">First Class</option>
                            <option value="Priority Mail">Priority Mail</option>
                            <option value="Priority Mail Express">Priority Mail Express</option>
                            <option value="Parcel Select">Parcel Select</option>
                          </>
                        )}
                        {formData.carrier === 'UPS' && (
                          <>
                            <option value="Ground">Ground</option>
                            <option value="2nd Day Air">2nd Day Air</option>
                            <option value="Next Day Air">Next Day Air</option>
                            <option value="3 Day Select">3 Day Select</option>
                          </>
                        )}
                        {formData.carrier === 'FedEx' && (
                          <>
                            <option value="Ground">Ground</option>
                            <option value="2Day">2Day</option>
                            <option value="Overnight">Overnight</option>
                            <option value="Express Saver">Express Saver</option>
                          </>
                        )}
                        {formData.carrier === 'DHL' && (
                          <>
                            <option value="Express">Express</option>
                            <option value="Ground">Ground</option>
                            <option value="Express 12:00">Express 12:00</option>
                          </>
                        )}
                      </select>
                      {errors.service && (
                        <p className="mt-1 text-sm text-red-500">{errors.service}</p>
                      )}
                    </div>

                    {/* Packaging */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Packaging <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={formData.packaging}
                        onChange={(e) => handleChange('packaging', e.target.value)}
                        className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          errors.packaging ? 'border-red-500' : 'border-gray-300'
                        }`}
                      >
                        <option value="">Select Packaging</option>
                        <option value="Package">Package</option>
                        <option value="Envelope">Envelope</option>
                        <option value="Flat Rate Box">Flat Rate Box</option>
                        <option value="Flat Rate Envelope">Flat Rate Envelope</option>
                        <option value="Padded Envelope">Padded Envelope</option>
                      </select>
                      {errors.packaging && (
                        <p className="mt-1 text-sm text-red-500">{errors.packaging}</p>
                      )}
                    </div>
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
                    onClick={handleSave}
                    disabled={!isFormValid()}
                    className={`px-4 py-2 rounded-lg transition-colors ${
                      isFormValid()
                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    }`}
                  >
                    Save Package Info
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

