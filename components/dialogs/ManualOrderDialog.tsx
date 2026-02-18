'use client'

import { useState, useEffect } from 'react'
import { useReferenceData } from '@/hooks/useReferenceData'
import ServiceSelect from '@/components/ui/ServiceSelect'

interface ManualOrderDialogProps {
  isOpen: boolean
  onClose: () => void
  onCreated: (order: any) => void
}

export default function ManualOrderDialog({ isOpen, onClose, onCreated }: ManualOrderDialogProps) {
  const { boxes, carrierServices, loaded } = useReferenceData()

  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [street1, setStreet1] = useState('')
  const [street2, setStreet2] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [country, setCountry] = useState('US')
  const [phone, setPhone] = useState('')

  const [selectedBoxId, setSelectedBoxId] = useState('')
  const [weight, setWeight] = useState('')
  const [selectedServiceCode, setSelectedServiceCode] = useState('')

  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isOpen) {
      setName(''); setCompany(''); setStreet1(''); setStreet2('')
      setCity(''); setState(''); setPostalCode(''); setCountry('US'); setPhone('')
      setSelectedBoxId(''); setWeight(''); setSelectedServiceCode('')
      setCreating(false); setError('')
    }
  }, [isOpen])

  if (!isOpen) return null

  const activeBoxes = boxes.filter(b => b.active)
  const selectedBox = activeBoxes.find(b => b.id === selectedBoxId)
  const selectedService = carrierServices.find(s => s.serviceCode === selectedServiceCode)

  const canSubmit = name.trim() && street1.trim() && city.trim() && state.trim() && postalCode.trim()

  const handleSubmit = async () => {
    if (!canSubmit) return
    setCreating(true)
    setError('')

    try {
      const res = await fetch('/api/orders/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shipTo: { name, company, street1, street2, city, state, postalCode, country, phone },
          box: selectedBox ? { boxId: selectedBox.id, boxName: selectedBox.name, lengthInches: selectedBox.lengthInches, widthInches: selectedBox.widthInches, heightInches: selectedBox.heightInches, weightLbs: selectedBox.weightLbs } : null,
          weight: weight || null,
          carrier: selectedService ? { carrierId: selectedService.carrierId, carrierCode: selectedService.carrierCode, serviceCode: selectedService.serviceCode, serviceName: selectedService.serviceName } : null,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create order')
      onCreated(data.order)
      onClose()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setCreating(false)
    }
  }

  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none'
  const labelCls = 'block text-xs font-medium text-gray-600 mb-1'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between rounded-t-xl z-10">
          <h2 className="text-lg font-semibold text-gray-900">Create Manual Order</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Ship To */}
          <div>
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Ship To</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Name *</label>
                  <input value={name} onChange={e => setName(e.target.value)} className={inputCls} placeholder="John Smith" />
                </div>
                <div>
                  <label className={labelCls}>Company</label>
                  <input value={company} onChange={e => setCompany(e.target.value)} className={inputCls} placeholder="Optional" />
                </div>
              </div>
              <div>
                <label className={labelCls}>Street 1 *</label>
                <input value={street1} onChange={e => setStreet1(e.target.value)} className={inputCls} placeholder="123 Main St" />
              </div>
              <div>
                <label className={labelCls}>Street 2</label>
                <input value={street2} onChange={e => setStreet2(e.target.value)} className={inputCls} placeholder="Apt, Suite, etc." />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>City *</label>
                  <input value={city} onChange={e => setCity(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>State *</label>
                  <input value={state} onChange={e => setState(e.target.value)} className={inputCls} placeholder="CA" maxLength={2} />
                </div>
                <div>
                  <label className={labelCls}>Zip *</label>
                  <input value={postalCode} onChange={e => setPostalCode(e.target.value)} className={inputCls} placeholder="90210" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Country</label>
                  <input value={country} onChange={e => setCountry(e.target.value)} className={inputCls} placeholder="US" maxLength={2} />
                </div>
                <div>
                  <label className={labelCls}>Phone</label>
                  <input value={phone} onChange={e => setPhone(e.target.value)} className={inputCls} placeholder="Optional" />
                </div>
              </div>
            </div>
          </div>

          {/* Package */}
          <div>
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Package</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Box</label>
                <select value={selectedBoxId} onChange={e => setSelectedBoxId(e.target.value)} className={inputCls}>
                  <option value="">-- None --</option>
                  {activeBoxes.map(b => (
                    <option key={b.id} value={b.id}>{b.name} ({b.lengthInches}x{b.widthInches}x{b.heightInches})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Weight (lbs)</label>
                <input type="number" step="0.01" min="0" value={weight} onChange={e => setWeight(e.target.value)} className={inputCls} placeholder="0.00" />
              </div>
            </div>
          </div>

          {/* Service */}
          <div>
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Carrier / Service</h3>
            <ServiceSelect
              value={selectedServiceCode}
              onChange={setSelectedServiceCode}
              carrierServices={carrierServices}
              className={inputCls}
              placeholder="-- None --"
              showRateShop={false}
            />
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        </div>

        <div className="sticky bottom-0 bg-white border-t px-6 py-4 flex justify-end gap-3 rounded-b-xl">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || creating || !loaded}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {creating ? 'Creating...' : 'Create Order'}
          </button>
        </div>
      </div>
    </div>
  )
}
