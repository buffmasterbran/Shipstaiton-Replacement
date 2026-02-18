import { ShipEngineCarrier, ClassifiedCarriers } from './types'

const MANAGED_CARRIER_CODES = new Set(['fedex_walleted', 'globalpost'])
const MANAGED_NICKNAME_KEYWORDS = ['shipstation', 'one balance']

export const isShipEngineManaged = (carrier: ShipEngineCarrier): boolean => {
  if (MANAGED_CARRIER_CODES.has(carrier.carrier_code)) return true

  if (carrier.requires_funded_amount && carrier.funding_source_id) return true

  if (carrier.nickname) {
    const lower = carrier.nickname.toLowerCase()
    if (MANAGED_NICKNAME_KEYWORDS.some((kw) => lower.includes(kw))) return true
  }

  return false
}

export const classifyCarriers = (carriers: ShipEngineCarrier[]): ClassifiedCarriers => {
  const own: ShipEngineCarrier[] = []
  const managed: ShipEngineCarrier[] = []

  for (const carrier of carriers) {
    if (isShipEngineManaged(carrier)) {
      managed.push(carrier)
    } else {
      own.push(carrier)
    }
  }

  return { own, managed }
}

export const getServiceBreakdown = (
  services: ShipEngineCarrier['services']
): { domestic: number; international: number; total: number } => {
  if (!services) return { domestic: 0, international: 0, total: 0 }
  return {
    domestic: services.filter((s) => s.domestic).length,
    international: services.filter((s) => s.international).length,
    total: services.length,
  }
}

export const getBillingLabel = (carrier: ShipEngineCarrier): string => {
  if (carrier.requires_funded_amount) return 'Wallet-Funded'
  return 'Direct Account'
}

export const getCarrierIcon = (carrierCode: string): string => {
  if (carrierCode.startsWith('ups')) return '🟤'
  if (carrierCode.startsWith('usps') || carrierCode === 'stamps_com') return '🔵'
  if (carrierCode.startsWith('fedex')) return '🟣'
  if (carrierCode === 'globalpost') return '🌐'
  return '📦'
}
