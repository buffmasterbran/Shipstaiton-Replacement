'use client'

import { useState, useEffect } from 'react'
import { ShipEngineCarrier } from './types'

// ---------------------------------------------------------------------------
// Carrier-specific setting definitions
// ---------------------------------------------------------------------------

interface SettingDef {
  key: string
  label: string
  description: string
  type: 'toggle' | 'select' | 'text'
  options?: { value: string; label: string }[]
  warning?: string
}

const UPS_SETTINGS: SettingDef[] = [
  {
    key: 'nickname',
    label: 'Account Nickname',
    description: 'Display name for this carrier account',
    type: 'text',
  },
  {
    key: 'use_negotiated_rates',
    label: 'Use Negotiated Rates',
    description: 'Use your contracted negotiated rates instead of list rates. Once enabled, this cannot be disabled.',
    type: 'toggle',
    warning: 'Once enabled, negotiated rates cannot be turned off.',
  },
  {
    key: 'use_consolidation_services',
    label: 'Enable Consolidation Services',
    description: 'Enables UPS Ground Saver® and UPS Mail Innovations® services.',
    type: 'toggle',
  },
  {
    key: 'pickup_type',
    label: 'Pickup Type',
    description: 'How UPS picks up your packages',
    type: 'select',
    options: [
      { value: 'daily_pickup', label: 'Daily Pickup' },
      { value: 'occasional_pickup', label: 'Occasional Pickup' },
      { value: 'customer_counter', label: 'Customer Counter' },
    ],
  },
  {
    key: 'is_primary_account',
    label: 'Primary Account',
    description: 'Set as the default UPS account',
    type: 'toggle',
  },
  {
    key: 'use_carbon_neutral_shipping_program',
    label: 'Carbon Neutral Shipping',
    description: 'Adds a fee to purchase carbon offset credits for shipments',
    type: 'toggle',
  },
  {
    key: 'use_ground_freight_pricing',
    label: 'Ground Freight Pricing',
    description: 'Enable UPS Ground Freight pricing for eligible services',
    type: 'toggle',
  },
  {
    key: 'mail_innovations_cost_center',
    label: 'Mail Innovations Cost Center',
    description: 'Cost center for MI services (from your UPS rep)',
    type: 'text',
  },
  {
    key: 'mail_innovations_customer_id',
    label: 'Mail Innovations Customer ID',
    description: 'Your UPS MI account number (required for MI rates)',
    type: 'text',
  },
  {
    key: 'mail_innovations_customer_guid',
    label: 'Mail Innovations Rate Key (GUID)',
    description: 'Your MI rate key (required for MI rates)',
    type: 'text',
  },
  {
    key: 'mail_innovations_endorsement',
    label: 'Mail Innovations Endorsement',
    description: 'Endorsement type for MI labels',
    type: 'select',
    options: [
      { value: '', label: 'None' },
      { value: 'return_service_requested', label: 'Return Service Requested' },
      { value: 'forwarding_service_requested', label: 'Forwarding Service Requested' },
      { value: 'address_service_requested', label: 'Address Service Requested' },
      { value: 'change_service_requested', label: 'Change Service Requested' },
      { value: 'leave_if_no_response', label: 'Leave If No Response' },
    ],
  },
]

const FEDEX_SETTINGS: SettingDef[] = [
  {
    key: 'nickname',
    label: 'Account Nickname',
    description: 'Display name for this carrier account',
    type: 'text',
  },
  {
    key: 'is_primary_account',
    label: 'Primary Account',
    description: 'Set as the default FedEx account',
    type: 'toggle',
  },
  {
    key: 'pickup_type',
    label: 'Pickup Type',
    description: 'How FedEx picks up your packages',
    type: 'select',
    options: [
      { value: 'none', label: 'Not Specified' },
      { value: 'regular_pickup', label: 'Regular Pickup (scheduled daily)' },
      { value: 'request_courier', label: 'Request Courier' },
      { value: 'drop_box', label: 'Drop Box' },
      { value: 'business_service_center', label: 'Business Service Center' },
      { value: 'station', label: 'FedEx Station' },
    ],
  },
  {
    key: 'smart_post_hub',
    label: 'SmartPost Hub',
    description: 'FedEx Ground Economy hub for SmartPost shipments',
    type: 'select',
    options: [
      { value: 'none', label: 'None' },
      { value: 'allentown_pa', label: 'Allentown, PA' },
      { value: 'atlanta_ga', label: 'Atlanta, GA' },
      { value: 'charlotte_nc', label: 'Charlotte, NC' },
      { value: 'chino_ca', label: 'Chino, CA' },
      { value: 'dallas_tx', label: 'Dallas, TX' },
      { value: 'denver_co', label: 'Denver, CO' },
      { value: 'detroit_mi', label: 'Detroit, MI' },
      { value: 'houston_tx', label: 'Houston, TX' },
      { value: 'indianapolis_in', label: 'Indianapolis, IN' },
      { value: 'kansas_city_ks', label: 'Kansas City, KS' },
      { value: 'los_angeles_ca', label: 'Los Angeles, CA' },
      { value: 'memphis_tn', label: 'Memphis, TN' },
      { value: 'minneapolis_mn', label: 'Minneapolis, MN' },
      { value: 'new_berlin_wi', label: 'New Berlin, WI' },
      { value: 'orlando_fl', label: 'Orlando, FL' },
      { value: 'phoenix_az', label: 'Phoenix, AZ' },
      { value: 'pittsburgh_pa', label: 'Pittsburgh, PA' },
      { value: 'salt_lake_city_ut', label: 'Salt Lake City, UT' },
      { value: 'seattle_wa', label: 'Seattle, WA' },
      { value: 'st_louis_mo', label: 'St. Louis, MO' },
    ],
  },
]

const GENERIC_SETTINGS: SettingDef[] = [
  {
    key: 'nickname',
    label: 'Account Nickname',
    description: 'Display name for this carrier account',
    type: 'text',
  },
]

const getSettingsForCarrier = (carrierCode: string): SettingDef[] => {
  if (carrierCode === 'ups') return UPS_SETTINGS
  if (carrierCode === 'fedex') return FEDEX_SETTINGS
  return GENERIC_SETTINGS
}

// ---------------------------------------------------------------------------
// Modal Component
// ---------------------------------------------------------------------------

interface Props {
  carrier: ShipEngineCarrier | null
  onClose: () => void
  onSaved: () => void
}

export default function CarrierSettingsModal({ carrier, onClose, onSaved }: Props) {
  const [settings, setSettings] = useState<Record<string, unknown>>({})
  const [originalSettings, setOriginalSettings] = useState<Record<string, unknown>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [supported, setSupported] = useState(true)

  useEffect(() => {
    if (!carrier) return
    fetchSettings()
  }, [carrier])

  if (!carrier) return null

  const settingDefs = getSettingsForCarrier(carrier.carrier_code)
  const hasChanges = JSON.stringify(settings) !== JSON.stringify(originalSettings)

  async function fetchSettings() {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch(
        `/api/shipengine/carriers/settings?carrier_name=${carrier!.carrier_code}&carrier_id=${carrier!.carrier_id}`
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to fetch settings')
      setSettings(data.settings || {})
      setOriginalSettings(data.settings || {})
      setSupported(data.supported !== false)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load settings'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    try {
      setSaving(true)
      setError(null)
      setSuccessMsg(null)

      const payload: Record<string, unknown> = {
        carrier_name: carrier!.carrier_code,
        carrier_id: carrier!.carrier_id,
      }

      // Only send fields that changed
      for (const def of settingDefs) {
        const current = settings[def.key]
        const original = originalSettings[def.key]
        if (current !== original && current !== undefined) {
          payload[def.key] = current
        }
      }

      const res = await fetch('/api/shipengine/carriers/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save settings')

      setOriginalSettings({ ...settings })
      setSuccessMsg('Settings saved successfully')
      onSaved()

      setTimeout(() => setSuccessMsg(null), 3000)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save settings'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  const updateSetting = (key: string, value: unknown) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
    setError(null)
    setSuccessMsg(null)
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity" onClick={onClose}>
          <div className="absolute inset-0 bg-gray-500 opacity-75" />
        </div>

        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-xl sm:w-full">
          {/* Header */}
          <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {carrier.friendly_name} Settings
              </h2>
              <p className="text-xs text-gray-500 font-mono mt-0.5">{carrier.carrier_id}</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-5 max-h-[70vh] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-gray-500 text-sm">Loading carrier settings...</div>
              </div>
            ) : !supported ? (
              <div className="py-8 text-center">
                <p className="text-gray-500">
                  This carrier does not support settings modification via API.
                </p>
                <p className="text-sm text-gray-400 mt-2">
                  You may be able to change settings in the{' '}
                  <a
                    href="https://app.shipengine.com/#/connections"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800"
                  >
                    ShipEngine Dashboard
                  </a>
                  .
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-800">{error}</p>
                  </div>
                )}
                {successMsg && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-sm text-green-800">{successMsg}</p>
                  </div>
                )}

                {settingDefs.map((def) => (
                  <SettingRow
                    key={def.key}
                    def={def}
                    value={settings[def.key]}
                    onChange={(val) => updateSetting(def.key, val)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex items-center justify-between">
            <button onClick={onClose} className="text-sm text-gray-600 hover:text-gray-800">
              {hasChanges ? 'Cancel' : 'Close'}
            </button>
            {supported && !loading && (
              <button
                onClick={handleSave}
                disabled={saving || !hasChanges}
                className={`px-6 py-2 rounded-lg font-medium text-sm transition-colors ${
                  hasChanges
                    ? 'bg-green-600 text-white hover:bg-green-700'
                    : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                } disabled:opacity-50`}
              >
                {saving ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Saving...
                  </span>
                ) : (
                  'Save Settings'
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Individual setting row
// ---------------------------------------------------------------------------

const SettingRow = ({
  def,
  value,
  onChange,
}: {
  def: SettingDef
  value: unknown
  onChange: (value: unknown) => void
}) => {
  if (def.type === 'toggle') {
    const checked = value === true || value === 'true'
    return (
      <div className="flex items-start justify-between gap-4 py-1">
        <div className="min-w-0">
          <div className="text-sm font-medium text-gray-900">{def.label}</div>
          <div className="text-xs text-gray-500 mt-0.5">{def.description}</div>
          {def.warning && checked && (
            <div className="text-xs text-amber-600 mt-1 flex items-center gap-1">
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              {def.warning}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => onChange(!checked)}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
            checked ? 'bg-green-500' : 'bg-gray-300'
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${
              checked ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>
    )
  }

  if (def.type === 'select') {
    return (
      <div>
        <label className="block text-sm font-medium text-gray-900 mb-0.5">{def.label}</label>
        <p className="text-xs text-gray-500 mb-1.5">{def.description}</p>
        <select
          value={(value as string) || ''}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          {def.options?.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    )
  }

  // text
  return (
    <div>
      <label className="block text-sm font-medium text-gray-900 mb-0.5">{def.label}</label>
      <p className="text-xs text-gray-500 mb-1.5">{def.description}</p>
      <input
        type="text"
        value={(value as string) || ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      />
    </div>
  )
}
