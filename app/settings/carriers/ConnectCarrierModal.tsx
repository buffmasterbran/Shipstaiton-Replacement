'use client'

import { useState } from 'react'

// ---------------------------------------------------------------------------
// Carrier definitions — each carrier has its own required fields
// ---------------------------------------------------------------------------

interface FieldDef {
  name: string
  label: string
  type: 'text' | 'email' | 'tel' | 'checkbox'
  placeholder?: string
  required?: boolean
  half?: boolean
  section?: string
  helpText?: string
}

interface CarrierDef {
  code: string
  name: string
  icon: string
  color: string
  description: string
  fields: FieldDef[]
  legalNote?: string
}

const CARRIERS: CarrierDef[] = [
  {
    code: 'ups',
    name: 'UPS',
    icon: '🟤',
    color: 'bg-amber-700',
    description: 'Connect your own UPS account with your negotiated rates',
    legalNote: 'By connecting, you agree to UPS Technology Agreement.',
    fields: [
      { name: 'nickname', label: 'Nickname', type: 'text', placeholder: 'e.g. My UPS Account', required: true },
      { name: 'account_number', label: 'UPS Account Number', type: 'text', placeholder: '0V2R99', required: true, half: true },
      { name: 'account_country_code', label: 'Account Country', type: 'text', placeholder: 'US', required: true, half: true },
      { name: 'account_postal_code', label: 'Account ZIP Code', type: 'text', placeholder: '78756', required: true, half: true },
      { name: 'company', label: 'Company Name', type: 'text', placeholder: 'Pirani Life', required: true, half: true },
      { name: 'first_name', label: 'First Name', type: 'text', required: true, half: true, section: 'Contact' },
      { name: 'last_name', label: 'Last Name', type: 'text', required: true, half: true },
      { name: 'title', label: 'Title', type: 'text', placeholder: 'Shipping Manager', half: true },
      { name: 'email', label: 'Email', type: 'email', required: true, half: true },
      { name: 'phone', label: 'Phone', type: 'tel', placeholder: '512-555-1234', required: true, half: true },
      { name: 'address1', label: 'Address', type: 'text', required: true, section: 'Address' },
      { name: 'city', label: 'City', type: 'text', required: true, half: true },
      { name: 'state', label: 'State', type: 'text', placeholder: 'TX', required: true, half: true },
      { name: 'postal_code', label: 'ZIP Code', type: 'text', required: true, half: true },
      { name: 'country_code', label: 'Country', type: 'text', placeholder: 'US', required: true, half: true },
      { name: 'invoice.invoice_number', label: 'Invoice Number', type: 'text', required: true, section: 'UPS Invoice Verification', helpText: 'From a recent UPS invoice. Required to verify account ownership.' },
      { name: 'invoice.invoice_date', label: 'Invoice Date', type: 'text', placeholder: 'YYYY-MM-DD', required: true, half: true },
      { name: 'invoice.invoice_amount', label: 'Invoice Amount', type: 'text', placeholder: '123.45', required: true, half: true },
      { name: 'invoice.control_id', label: 'Control ID', type: 'text', required: true, helpText: 'Found in the upper-right of your UPS invoice' },
      { name: 'agree_to_technology_agreement', label: 'I agree to the UPS Technology Agreement', type: 'checkbox', required: true },
    ],
  },
  {
    code: 'fedex',
    name: 'FedEx',
    icon: '🟣',
    color: 'bg-purple-600',
    description: 'Connect your FedEx account for US & Canada shipping',
    legalNote: 'By connecting, you agree to the FedEx End User License Agreement.',
    fields: [
      { name: 'nickname', label: 'Nickname', type: 'text', placeholder: 'e.g. My FedEx Account', required: true },
      { name: 'account_number', label: 'FedEx Account Number', type: 'text', placeholder: '123456789', required: true, half: true },
      { name: 'company', label: 'Company Name', type: 'text', placeholder: 'Pirani Life', half: true },
      { name: 'first_name', label: 'First Name', type: 'text', required: true, half: true, section: 'Contact' },
      { name: 'last_name', label: 'Last Name', type: 'text', required: true, half: true },
      { name: 'email', label: 'Email', type: 'email', required: true, half: true },
      { name: 'phone', label: 'Phone', type: 'tel', placeholder: '512-555-1234', required: true, half: true },
      { name: 'address1', label: 'Address', type: 'text', required: true, section: 'Address' },
      { name: 'city', label: 'City', type: 'text', required: true, half: true },
      { name: 'state', label: 'State', type: 'text', placeholder: 'TX', required: true, half: true },
      { name: 'postal_code', label: 'ZIP Code', type: 'text', required: true, half: true },
      { name: 'country_code', label: 'Country', type: 'text', placeholder: 'US', required: true, half: true },
      { name: 'agree_to_eula', label: 'I agree to the FedEx End User License Agreement', type: 'checkbox', required: true },
    ],
  },
  {
    code: 'dhl_express',
    name: 'DHL Express',
    icon: '🟡',
    color: 'bg-yellow-500',
    description: 'Connect your DHL Express account for international shipping',
    fields: [
      { name: 'nickname', label: 'Nickname', type: 'text', placeholder: 'e.g. My DHL Account', required: true },
      { name: 'account_number', label: 'DHL Account Number', type: 'text', placeholder: '123456789', required: true },
      { name: 'country_code', label: 'Country', type: 'text', placeholder: 'US', half: true },
    ],
  },
  {
    code: 'canada_post',
    name: 'Canada Post',
    icon: '🍁',
    color: 'bg-red-600',
    description: 'Connect your Canada Post account',
    fields: [
      { name: 'nickname', label: 'Nickname', type: 'text', placeholder: 'e.g. My Canada Post', required: true },
      { name: 'api_key', label: 'API Key', type: 'text', required: true },
      { name: 'api_secret', label: 'API Secret', type: 'text', required: true },
      { name: 'contract_id', label: 'Contract ID', type: 'text', required: true, half: true },
      { name: 'customer_number', label: 'Customer Number', type: 'text', required: true, half: true },
    ],
  },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const setNestedValue = (obj: Record<string, unknown>, path: string, value: unknown) => {
  const keys = path.split('.')
  let current = obj
  for (let i = 0; i < keys.length - 1; i++) {
    if (!current[keys[i]] || typeof current[keys[i]] !== 'object') {
      current[keys[i]] = {}
    }
    current = current[keys[i]] as Record<string, unknown>
  }
  current[keys[keys.length - 1]] = value
}

const getNestedValue = (obj: Record<string, unknown>, path: string): unknown => {
  const keys = path.split('.')
  let current: unknown = obj
  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

// ---------------------------------------------------------------------------
// Modal Component
// ---------------------------------------------------------------------------

interface Props {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

export default function ConnectCarrierModal({ open, onClose, onSuccess }: Props) {
  const [step, setStep] = useState<'select' | 'form' | 'success'>('select')
  const [selectedCarrier, setSelectedCarrier] = useState<CarrierDef | null>(null)
  const [formData, setFormData] = useState<Record<string, unknown>>({})
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newCarrierId, setNewCarrierId] = useState<string | null>(null)

  if (!open) return null

  const handleSelectCarrier = (carrier: CarrierDef) => {
    setSelectedCarrier(carrier)
    setFormData({})
    setError(null)
    setStep('form')
  }

  const handleBack = () => {
    setStep('select')
    setSelectedCarrier(null)
    setFormData({})
    setError(null)
  }

  const handleFieldChange = (fieldName: string, value: string | boolean) => {
    setFormData((prev) => {
      const next = { ...prev }
      setNestedValue(next, fieldName, value)
      return next
    })
  }

  const handleConnect = async () => {
    if (!selectedCarrier) return

    // Validate required fields
    for (const field of selectedCarrier.fields) {
      if (!field.required) continue
      const val = getNestedValue(formData, field.name)
      if (field.type === 'checkbox' && val !== true) {
        setError(`Please agree to the required terms`)
        return
      }
      if (field.type !== 'checkbox' && (!val || (typeof val === 'string' && !val.trim()))) {
        setError(`${field.label} is required`)
        return
      }
    }

    try {
      setConnecting(true)
      setError(null)

      // Build the payload — convert invoice amounts to numbers
      const payload: Record<string, unknown> = { carrier_name: selectedCarrier.code }
      for (const field of selectedCarrier.fields) {
        const val = getNestedValue(formData, field.name)
        if (val !== undefined && val !== '') {
          if (field.name === 'invoice.invoice_amount') {
            setNestedValue(payload, field.name, parseFloat(val as string) || 0)
          } else {
            setNestedValue(payload, field.name, val)
          }
        }
      }

      const response = await fetch('/api/shipengine/carriers/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Connection failed')

      setNewCarrierId(data.carrier_id)
      setStep('success')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to connect carrier'
      setError(message)
    } finally {
      setConnecting(false)
    }
  }

  const handleDone = () => {
    setStep('select')
    setSelectedCarrier(null)
    setFormData({})
    setError(null)
    setNewCarrierId(null)
    onSuccess()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity" onClick={onClose}>
          <div className="absolute inset-0 bg-gray-500 opacity-75" />
        </div>

        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
          {/* Header */}
          <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {step === 'form' && (
                <button
                  onClick={handleBack}
                  className="text-gray-400 hover:text-gray-600 -ml-1"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
              )}
              <h2 className="text-lg font-semibold text-gray-900">
                {step === 'select' && 'Connect a Carrier Account'}
                {step === 'form' && `Connect ${selectedCarrier?.name}`}
                {step === 'success' && 'Carrier Connected!'}
              </h2>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-5 max-h-[70vh] overflow-y-auto">
            {/* Step 1: Carrier Selection */}
            {step === 'select' && (
              <div>
                <p className="text-sm text-gray-600 mb-5">
                  Connect your own carrier account to ship with your negotiated rates.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {CARRIERS.map((carrier) => (
                    <button
                      key={carrier.code}
                      onClick={() => handleSelectCarrier(carrier)}
                      className="flex items-start gap-4 p-4 border-2 border-gray-200 rounded-lg hover:border-blue-400 hover:bg-blue-50/50 transition-all text-left group"
                    >
                      <span className="text-3xl">{carrier.icon}</span>
                      <div className="min-w-0">
                        <div className="font-semibold text-gray-900 group-hover:text-blue-700">
                          {carrier.name}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                          {carrier.description}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
                <div className="mt-5 pt-4 border-t border-gray-200">
                  <p className="text-xs text-gray-500">
                    Need a carrier not listed here?{' '}
                    <a
                      href="https://app.shipengine.com/#/connections"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 font-medium"
                    >
                      Connect via ShipEngine Dashboard →
                    </a>
                  </p>
                </div>
              </div>
            )}

            {/* Step 2: Connection Form */}
            {step === 'form' && selectedCarrier && (
              <div>
                {error && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-800">{error}</p>
                  </div>
                )}

                <CarrierForm
                  carrier={selectedCarrier}
                  formData={formData}
                  onChange={handleFieldChange}
                />
              </div>
            )}

            {/* Step 3: Success */}
            {step === 'success' && (
              <div className="text-center py-6">
                <div className="w-16 h-16 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
                  <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  {selectedCarrier?.name} Connected Successfully
                </h3>
                <p className="text-gray-600 mb-2">
                  Your carrier account has been connected and is ready to use.
                </p>
                {newCarrierId && (
                  <p className="text-sm text-gray-500 font-mono">{newCarrierId}</p>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex items-center justify-between">
            {step === 'select' && (
              <>
                <span />
                <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
                  Cancel
                </button>
              </>
            )}
            {step === 'form' && (
              <>
                <button onClick={handleBack} className="text-sm text-gray-600 hover:text-gray-800">
                  Back
                </button>
                <button
                  onClick={handleConnect}
                  disabled={connecting}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium text-sm"
                >
                  {connecting ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Connecting...
                    </span>
                  ) : (
                    'Connect Account'
                  )}
                </button>
              </>
            )}
            {step === 'success' && (
              <>
                <span />
                <button
                  onClick={handleDone}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm"
                >
                  Done
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Form renderer
// ---------------------------------------------------------------------------

const CarrierForm = ({
  carrier,
  formData,
  onChange,
}: {
  carrier: CarrierDef
  formData: Record<string, unknown>
  onChange: (name: string, value: string | boolean) => void
}) => {
  let currentSection: string | undefined

  return (
    <div className="space-y-4">
      {carrier.fields.map((field, idx) => {
        const showSectionHeader = field.section && field.section !== currentSection
        if (field.section) currentSection = field.section

        // Pair half-width fields together
        const nextField = carrier.fields[idx + 1]
        const prevField = idx > 0 ? carrier.fields[idx - 1] : null
        const isFirstHalf = field.half && nextField?.half && !prevField?.half
        const isSecondHalf = field.half && prevField?.half

        if (isSecondHalf) return null // rendered with its pair

        return (
          <div key={field.name}>
            {showSectionHeader && (
              <div className="pt-3 pb-1 border-t border-gray-200 mt-2">
                <h4 className="text-sm font-semibold text-gray-700">{field.section}</h4>
              </div>
            )}
            {field.type === 'checkbox' ? (
              <label className="flex items-start gap-3 cursor-pointer py-1">
                <input
                  type="checkbox"
                  checked={(getNestedValue(formData, field.name) as boolean) || false}
                  onChange={(e) => onChange(field.name, e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 mt-0.5"
                />
                <div>
                  <span className="text-sm text-gray-700">{field.label}</span>
                  {field.required && <span className="text-red-500 ml-0.5">*</span>}
                </div>
              </label>
            ) : isFirstHalf && nextField ? (
              <div className="grid grid-cols-2 gap-3">
                <FieldInput field={field} formData={formData} onChange={onChange} />
                <FieldInput field={nextField} formData={formData} onChange={onChange} />
              </div>
            ) : (
              <FieldInput field={field} formData={formData} onChange={onChange} />
            )}
          </div>
        )
      })}

      {carrier.legalNote && (
        <p className="text-xs text-gray-500 pt-2 border-t border-gray-200">
          {carrier.legalNote}
        </p>
      )}
    </div>
  )
}

const FieldInput = ({
  field,
  formData,
  onChange,
}: {
  field: FieldDef
  formData: Record<string, unknown>
  onChange: (name: string, value: string) => void
}) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1">
      {field.label}
      {field.required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
    <input
      type={field.type}
      value={(getNestedValue(formData, field.name) as string) || ''}
      onChange={(e) => onChange(field.name, e.target.value)}
      placeholder={field.placeholder}
      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
    />
    {field.helpText && (
      <p className="text-xs text-gray-500 mt-1">{field.helpText}</p>
    )}
  </div>
)
