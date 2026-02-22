import { Carrier, WeightRuleLocal } from './types'

interface SavedService {
  carrierId: string
  carrierCode: string
  carrierName: string
  serviceCode: string
  serviceName: string
  accountNickname?: string | null
  domestic?: boolean
  international?: boolean
}

/**
 * Build Carrier[] directly from saved selected_services.
 * This handles both Direct and ShipEngine services uniformly,
 * avoiding the old pattern of cross-referencing against ShipEngine carriers
 * which breaks for Direct connection services.
 */
export function buildCarriersFromSelectedServices(settings: Array<{ key: string; value: any }>): Carrier[] {
  const selected = settings.find(s => s.key === 'selected_services')
  const services: SavedService[] = selected?.value?.services || []
  if (services.length === 0) return []

  const byCarrier = new Map<string, { carrier: Omit<Carrier, 'services'>; services: NonNullable<Carrier['services']> }>()

  for (const svc of services) {
    let entry = byCarrier.get(svc.carrierId)
    if (!entry) {
      entry = {
        carrier: {
          carrier_id: svc.carrierId,
          carrier_code: svc.carrierCode,
          friendly_name: svc.accountNickname || svc.carrierName,
        },
        services: [],
      }
      byCarrier.set(svc.carrierId, entry)
    }
    entry.services.push({
      service_code: svc.serviceCode,
      name: svc.serviceName,
      domestic: svc.domestic ?? true,
      international: svc.international ?? false,
    })
  }

  return Array.from(byCarrier.values()).map(e => ({ ...e.carrier, services: e.services }))
}

export const MAX_OZ = 400 // 25 lbs (visual bar max)
export const CATCHALL_OZ = 99999 // Last segment catch-all upper bound

export const SEGMENT_COLORS = [
  'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500',
  'bg-teal-500', 'bg-pink-500', 'bg-indigo-500', 'bg-yellow-500',
  'bg-red-400', 'bg-cyan-500',
]

export const TRANSIT_TIME_OPTIONS = [
  { value: 'no_restriction', label: 'No Restriction' },
  { value: '1_day', label: '1 Business Day' },
  { value: '2_days', label: '2 Business Days' },
  { value: '3_days', label: '3 Business Days' },
  { value: '5_days', label: '5 Business Days' },
  { value: '7_days', label: '7 Business Days' },
]

export function formatWeight(oz: number): string {
  if (oz >= CATCHALL_OZ) return '∞'
  if (oz < 16) return `${oz} oz`
  const lbs = Math.floor(oz / 16)
  const remainOz = Math.round(oz % 16)
  if (remainOz === 0) return `${lbs} lb`
  return `${lbs} lb ${remainOz} oz`
}

// For the last segment, show "X lb+" instead of "X lb – Y lb"
export function formatSegmentRange(rule: WeightRuleLocal, isLast: boolean): string {
  const min = formatWeight(rule.minOz)
  if (isLast) return `${min}+`
  return `${min} – ${formatWeight(rule.maxOz)}`
}

// Is this the catch-all last segment?
export function isCatchAll(oz: number): boolean {
  return oz > MAX_OZ
}
