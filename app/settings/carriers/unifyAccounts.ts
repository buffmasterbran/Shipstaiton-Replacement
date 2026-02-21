import type {
  ShipEngineCarrier,
  DirectConnectionConfig,
  DirectConnections,
  UnifiedAccount,
  UnifiedService,
  CarrierNetwork,
} from './types'
import { isShipEngineManaged } from './helpers'
import {
  getServiceIdentity,
  getDirectEquivalent,
  getShipEngineEquivalent,
  detectCarrierNetwork,
  UPS_MAP,
  FEDEX_MAP,
} from '@/lib/shipping/service-map'

// Full Direct service catalogs (used when building the unified service list)
const DIRECT_SERVICE_CATALOG: Record<'ups' | 'fedex', Array<{ code: string; name: string; domestic: boolean; international: boolean }>> = {
  ups: UPS_MAP.map(e => ({ code: e.directCode, name: e.name, domestic: e.domestic, international: e.international })),
  fedex: FEDEX_MAP.map(e => ({ code: e.directCode, name: e.name, domestic: e.domestic, international: e.international })),
}

function getCarrierIcon(network: CarrierNetwork): string {
  switch (network) {
    case 'ups': return '🟤'
    case 'fedex': return '🟣'
    case 'usps': return '🔵'
    case 'dhl': return '🟡'
    default: return '📦'
  }
}

function inferNetwork(carrierCode: string): CarrierNetwork {
  const net = detectCarrierNetwork(carrierCode)
  if (net) return net
  const c = carrierCode.toLowerCase()
  if (c.includes('usps') || c.includes('stamps') || c.includes('endicia')) return 'usps'
  if (c.includes('dhl')) return 'dhl'
  return 'other'
}

/**
 * Merge ShipEngine carriers and Direct connections into a unified list of
 * carrier accounts, matched by carrier network + account number.
 */
export function unifyAccounts(
  seCarriers: ShipEngineCarrier[],
  directConns: DirectConnections,
): UnifiedAccount[] {
  const accounts: UnifiedAccount[] = []

  // Separate marketplace carriers from own-account carriers
  const ownCarriers = seCarriers.filter(c => !isShipEngineManaged(c))
  const marketplaceCarriers = seCarriers.filter(c => isShipEngineManaged(c))

  // Track which ShipEngine carriers have been matched to a Direct connection
  const matchedSEIds = new Set<string>()

  // ─── Match Direct connections to ShipEngine carriers ────────────────────────

  const directEntries: Array<{ network: 'ups' | 'fedex'; conn: DirectConnectionConfig }> = [
    ...(directConns.ups || []).map(c => ({ network: 'ups' as const, conn: c })),
    ...(directConns.fedex || []).map(c => ({ network: 'fedex' as const, conn: c })),
  ]

  for (const { network, conn } of directEntries) {
    // Try to find a matching ShipEngine carrier by network + account number
    const matchedSE = ownCarriers.find(se => {
      if (matchedSEIds.has(se.carrier_id)) return false
      const seNetwork = inferNetwork(se.carrier_code)
      if (seNetwork !== network) return false
      // Match by account number (case-insensitive)
      if (!se.account_number || !conn.accountNumber) return false
      return se.account_number.toUpperCase() === conn.accountNumber.toUpperCase()
    })

    if (matchedSE) {
      matchedSEIds.add(matchedSE.carrier_id)
    }

    const nickname = conn.nickname || matchedSE?.nickname || matchedSE?.friendly_name || conn.accountNumber
    const services = buildUnifiedServices(network, conn, matchedSE || undefined)

    accounts.push({
      id: `${network}:${conn.accountNumber || conn.id}`,
      carrierNetwork: network,
      accountNumber: conn.accountNumber || matchedSE?.account_number || null,
      nickname: `${nickname} (${network.toUpperCase()})`,
      icon: getCarrierIcon(network),
      direct: conn,
      shipEngine: matchedSE || undefined,
      isMarketplace: false,
      services,
    })
  }

  // ─── Unmatched own-account ShipEngine carriers (no Direct counterpart) ─────

  for (const se of ownCarriers) {
    if (matchedSEIds.has(se.carrier_id)) continue

    const network = inferNetwork(se.carrier_code)
    const nickname = se.nickname || se.friendly_name || se.carrier_code
    const services = buildUnifiedServices(network, undefined, se)

    accounts.push({
      id: `se:${se.carrier_id}`,
      carrierNetwork: network,
      accountNumber: se.account_number || null,
      nickname: `${nickname} (${network.toUpperCase()})`,
      icon: getCarrierIcon(network),
      direct: undefined,
      shipEngine: se,
      isMarketplace: false,
      services,
    })
  }

  // ─── Marketplace / ShipEngine-funded carriers → single merged tab ─────────

  if (marketplaceCarriers.length > 0) {
    const allMarketplaceServices: UnifiedService[] = []
    for (const se of marketplaceCarriers) {
      const network = inferNetwork(se.carrier_code)
      const svcList = buildUnifiedServices(network, undefined, se)
      allMarketplaceServices.push(...svcList)
    }

    accounts.push({
      id: 'mkt:funded',
      carrierNetwork: 'other',
      accountNumber: null,
      nickname: 'ShipEngine Funded',
      icon: '💳',
      direct: undefined,
      shipEngine: marketplaceCarriers[0],
      shipEngineCarriers: marketplaceCarriers,
      isMarketplace: true,
      services: allMarketplaceServices,
    })
  }

  return accounts
}

// ─── Service merging ─────────────────────────────────────────────────────────

function buildUnifiedServices(
  network: CarrierNetwork,
  directConn?: DirectConnectionConfig,
  seCarrier?: ShipEngineCarrier,
): UnifiedService[] {
  const serviceMap = new Map<string, UnifiedService>()

  // Add Direct services (from enabled list, or full catalog if no enabled list)
  if (directConn && (network === 'ups' || network === 'fedex')) {
    const catalog = DIRECT_SERVICE_CATALOG[network]
    const enabledSet = new Set(directConn.enabledServices || [])
    const useEnabled = enabledSet.size > 0

    for (const svc of catalog) {
      if (useEnabled && !enabledSet.has(svc.code)) continue

      const identity = getServiceIdentity(
        network === 'ups' ? `ups-direct:${svc.code}` : `fedex-direct:${svc.code}`,
      )

      serviceMap.set(identity, {
        identity,
        displayName: svc.name,
        domestic: svc.domestic,
        international: svc.international,
        directCode: svc.code,
        directConnectionId: directConn.id,
        paths: ['direct'],
      })
    }
  }

  // Add / merge ShipEngine services
  if (seCarrier?.services) {
    for (const svc of seCarrier.services) {
      const identity = getServiceIdentity(svc.service_code)
      const existing = serviceMap.get(identity)

      if (existing) {
        // Service already added via Direct — merge ShipEngine path
        existing.shipEngineServiceCode = svc.service_code
        existing.shipEngineCarrierId = seCarrier.carrier_id
        existing.shipEngineCarrierCode = seCarrier.carrier_code
        existing.shipEngineCarrierName = seCarrier.nickname || seCarrier.friendly_name
        if (!existing.paths.includes('shipengine')) {
          existing.paths.push('shipengine')
        }
      } else {
        // ShipEngine-only service
        serviceMap.set(identity, {
          identity,
          displayName: svc.name,
          domestic: svc.domestic,
          international: svc.international,
          shipEngineServiceCode: svc.service_code,
          shipEngineCarrierId: seCarrier.carrier_id,
          shipEngineCarrierCode: seCarrier.carrier_code,
          shipEngineCarrierName: seCarrier.nickname || seCarrier.friendly_name,
          paths: ['shipengine'],
        })
      }
    }
  }

  return Array.from(serviceMap.values())
}
