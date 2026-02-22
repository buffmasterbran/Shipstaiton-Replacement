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
 * Account-first unification.
 *
 * Tabs represent carrier *accounts* (identified by network + account number).
 * Both ShipEngine carriers and Direct connections are attached to the matching
 * account. Either source can create a tab on its own.
 */
export function unifyAccounts(
  seCarriers: ShipEngineCarrier[],
  directConns: DirectConnections,
): UnifiedAccount[] {
  const ownCarriers = seCarriers.filter(c => !isShipEngineManaged(c))
  const marketplaceCarriers = seCarriers.filter(c => isShipEngineManaged(c))

  // ─── 1. Collect every (network, accountNumber) pair into a Map ───────────

  interface AccountBucket {
    network: CarrierNetwork
    accountNumber: string          // normalized (uppercased, trimmed)
    seCarrier?: ShipEngineCarrier
    directConn?: DirectConnectionConfig
  }

  const buckets = new Map<string, AccountBucket>()

  const makeKey = (network: CarrierNetwork, acctNum: string) =>
    `${network}:${acctNum.trim().toUpperCase()}`

  // From own-account ShipEngine carriers
  for (const se of ownCarriers) {
    const network = inferNetwork(se.carrier_code)
    if (!se.account_number) {
      // No account number — give it a unique key so it still gets a tab
      const key = `se:${se.carrier_id}`
      buckets.set(key, { network, accountNumber: '', seCarrier: se })
      continue
    }
    const key = makeKey(network, se.account_number)
    const existing = buckets.get(key)
    if (existing) {
      existing.seCarrier = se
    } else {
      buckets.set(key, { network, accountNumber: se.account_number.trim().toUpperCase(), seCarrier: se })
    }
  }

  // From Direct connections
  const directEntries: Array<{ network: 'ups' | 'fedex'; conn: DirectConnectionConfig }> = [
    ...(directConns.ups || []).map(c => ({ network: 'ups' as const, conn: c })),
    ...(directConns.fedex || []).map(c => ({ network: 'fedex' as const, conn: c })),
  ]

  for (const { network, conn } of directEntries) {
    if (!conn.accountNumber) {
      const key = `direct:${conn.id}`
      buckets.set(key, { network, accountNumber: '', directConn: conn })
      continue
    }
    const key = makeKey(network, conn.accountNumber)
    const existing = buckets.get(key)
    if (existing) {
      existing.directConn = conn
    } else {
      buckets.set(key, { network, accountNumber: conn.accountNumber.trim().toUpperCase(), directConn: conn })
    }
  }

  // ─── 2. Build one UnifiedAccount per bucket ──────────────────────────────

  const accounts: UnifiedAccount[] = []

  for (const [key, bucket] of Array.from(buckets.entries())) {
    const { network, seCarrier, directConn } = bucket

    const nickname = directConn?.nickname
      || seCarrier?.nickname
      || seCarrier?.friendly_name
      || bucket.accountNumber
      || 'Unknown'

    const services = buildUnifiedServices(network, directConn, seCarrier)

    accounts.push({
      id: key,
      carrierNetwork: network,
      accountNumber: bucket.accountNumber || seCarrier?.account_number || directConn?.accountNumber || null,
      nickname: `${nickname} (${network.toUpperCase()})`,
      icon: getCarrierIcon(network),
      direct: directConn,
      shipEngine: seCarrier,
      isMarketplace: false,
      services,
    })
  }

  // ─── 3. Marketplace / ShipEngine-funded carriers → single merged tab ─────

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

  // Add all Direct services from the full catalog.
  // Service selection is managed at the app level via selected_services,
  // not at the connection level via enabledServices (legacy).
  if (directConn && (network === 'ups' || network === 'fedex')) {
    const catalog = DIRECT_SERVICE_CATALOG[network]

    for (const svc of catalog) {
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
      } else if (!directConn) {
        // ShipEngine-only service -- only include when no Direct connection exists,
        // otherwise these are SE extras with no Direct equivalent
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
