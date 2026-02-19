'use client'

import type { CarrierService } from '@/hooks/useReferenceData'

export const RATE_SHOP_VALUE = '__RATE_SHOP__'
export const GLOBAL_E_VALUE = '__GLOBAL_E__'

interface ServiceSelectProps {
  value: string
  onChange: (value: string) => void
  carrierServices: CarrierService[]
  disabled?: boolean
  className?: string
  placeholder?: string
  showRateShop?: boolean
  showGlobalE?: boolean
}

interface AccountGroup {
  carrierId: string
  label: string
  services: CarrierService[]
}

function buildGroups(services: CarrierService[]): AccountGroup[] {
  const byAccount = new Map<string, CarrierService[]>()
  const order: string[] = []

  for (const svc of services) {
    let list = byAccount.get(svc.carrierId)
    if (!list) {
      list = []
      byAccount.set(svc.carrierId, list)
      order.push(svc.carrierId)
    }
    list.push(svc)
  }

  // Determine if any carrier code has multiple accounts
  const codeCount = new Map<string, number>()
  for (const svc of services) {
    const key = svc.carrierCode
    if (!codeCount.has(key)) {
      const uniqueIds = new Set(services.filter(s => s.carrierCode === key).map(s => s.carrierId))
      codeCount.set(key, uniqueIds.size)
    }
  }

  return order.map(carrierId => {
    const svcs = byAccount.get(carrierId)!
    const first = svcs[0]
    const multipleAccounts = (codeCount.get(first.carrierCode) || 1) > 1

    let label: string
    if (first.accountNickname) {
      label = first.accountNickname
    } else if (multipleAccounts) {
      label = `${first.carrierName} [${carrierId.slice(-6)}]`
    } else {
      label = first.carrierName
    }

    return { carrierId, label, services: svcs }
  })
}

export default function ServiceSelect({
  value,
  onChange,
  carrierServices,
  disabled = false,
  className = '',
  placeholder = 'Select service...',
  showRateShop = true,
  showGlobalE = false,
}: ServiceSelectProps) {
  const groups = buildGroups(carrierServices)

  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      className={className}
    >
      <option value="">{disabled && carrierServices.length === 0 ? 'Loading...' : placeholder}</option>
      {showGlobalE && (
        <option value={GLOBAL_E_VALUE}>🌐 Global-E (international label)</option>
      )}
      {showRateShop && (
        <option value={RATE_SHOP_VALUE}>⚡ Rate Shopping (auto-select best rate)</option>
      )}
      {groups.map(group => (
        <optgroup key={group.carrierId} label={group.label}>
          {group.services.map(svc => (
            <option key={`${svc.carrierId}:${svc.serviceCode}`} value={svc.serviceCode}>
              {svc.serviceName}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}
