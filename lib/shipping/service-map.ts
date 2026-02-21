/**
 * Bidirectional mapping between ShipEngine service codes and Direct carrier
 * service codes.  Used for deduplication (same service offered by both paths)
 * and for the silent fallback flow (Direct → ShipEngine).
 */

type CarrierNetwork = 'ups' | 'fedex'

interface ServiceEntry {
  network: CarrierNetwork
  directCode: string
  shipEngineCode: string
  identity: string        // normalized key, e.g. "ups:ground"
  name: string
  domestic: boolean
  international: boolean
}

// ─── UPS mapping ─────────────────────────────────────────────────────────────

const UPS_MAP: Omit<ServiceEntry, 'network'>[] = [
  { directCode: '01', shipEngineCode: 'ups_next_day_air',           identity: 'ups:next_day_air',           name: 'UPS Next Day Air',              domestic: true,  international: false },
  { directCode: '02', shipEngineCode: 'ups_2nd_day_air',            identity: 'ups:2nd_day_air',            name: 'UPS 2nd Day Air',               domestic: true,  international: false },
  { directCode: '03', shipEngineCode: 'ups_ground',                 identity: 'ups:ground',                 name: 'UPS Ground',                    domestic: true,  international: false },
  { directCode: '12', shipEngineCode: 'ups_3_day_select',           identity: 'ups:3_day_select',           name: 'UPS 3 Day Select',              domestic: true,  international: false },
  { directCode: '13', shipEngineCode: 'ups_next_day_air_saver',     identity: 'ups:next_day_air_saver',     name: 'UPS Next Day Air Saver',        domestic: true,  international: false },
  { directCode: '14', shipEngineCode: 'ups_next_day_air_early_am',  identity: 'ups:next_day_air_early_am',  name: 'UPS Next Day Air Early A.M.',   domestic: true,  international: false },
  { directCode: '59', shipEngineCode: 'ups_2nd_day_air_am',         identity: 'ups:2nd_day_air_am',         name: 'UPS 2nd Day Air A.M.',          domestic: true,  international: false },
  { directCode: '92', shipEngineCode: 'ups_surepost_less_than_1lb', identity: 'ups:surepost_lt1',           name: 'UPS SurePost Less than 1 lb',   domestic: true,  international: false },
  { directCode: '93', shipEngineCode: 'ups_surepost_1lb_or_greater',identity: 'ups:surepost_gte1',          name: 'UPS SurePost 1 lb or Greater',  domestic: true,  international: false },
  { directCode: '07', shipEngineCode: 'ups_worldwide_express',      identity: 'ups:worldwide_express',      name: 'UPS Worldwide Express',         domestic: false, international: true },
  { directCode: '08', shipEngineCode: 'ups_worldwide_expedited',    identity: 'ups:worldwide_expedited',    name: 'UPS Worldwide Expedited',       domestic: false, international: true },
  { directCode: '11', shipEngineCode: 'ups_standard_international', identity: 'ups:standard_intl',          name: 'UPS Standard (Canada/Mexico)',   domestic: false, international: true },
  { directCode: '54', shipEngineCode: 'ups_worldwide_express_plus', identity: 'ups:worldwide_express_plus', name: 'UPS Worldwide Express Plus',     domestic: false, international: true },
  { directCode: '65', shipEngineCode: 'ups_worldwide_saver',        identity: 'ups:worldwide_saver',        name: 'UPS Worldwide Saver',           domestic: false, international: true },
]

// ─── FedEx mapping ───────────────────────────────────────────────────────────

const FEDEX_MAP: Omit<ServiceEntry, 'network'>[] = [
  { directCode: 'FEDEX_GROUND',          shipEngineCode: 'fedex_ground',              identity: 'fedex:ground',              name: 'FedEx Ground',              domestic: true, international: false },
  { directCode: 'GROUND_HOME_DELIVERY',  shipEngineCode: 'fedex_home_delivery',       identity: 'fedex:home_delivery',       name: 'FedEx Home Delivery',       domestic: true, international: false },
  { directCode: 'FEDEX_EXPRESS_SAVER',   shipEngineCode: 'fedex_express_saver',       identity: 'fedex:express_saver',       name: 'FedEx Express Saver',       domestic: true, international: false },
  { directCode: 'FEDEX_2_DAY',           shipEngineCode: 'fedex_2day',                identity: 'fedex:2day',                name: 'FedEx 2Day',                domestic: true, international: false },
  { directCode: 'FEDEX_2_DAY_AM',        shipEngineCode: 'fedex_2day_am',             identity: 'fedex:2day_am',             name: 'FedEx 2Day A.M.',           domestic: true, international: false },
  { directCode: 'STANDARD_OVERNIGHT',    shipEngineCode: 'fedex_standard_overnight',  identity: 'fedex:standard_overnight',  name: 'FedEx Standard Overnight',  domestic: true, international: false },
  { directCode: 'PRIORITY_OVERNIGHT',    shipEngineCode: 'fedex_priority_overnight',  identity: 'fedex:priority_overnight',  name: 'FedEx Priority Overnight',  domestic: true, international: false },
  { directCode: 'FIRST_OVERNIGHT',       shipEngineCode: 'fedex_first_overnight',     identity: 'fedex:first_overnight',     name: 'FedEx First Overnight',     domestic: true, international: false },
  { directCode: 'FEDEX_GROUND_ECONOMY',  shipEngineCode: 'fedex_ground_economy',      identity: 'fedex:ground_economy',      name: 'FedEx Ground Economy',      domestic: true, international: false },
]

// ─── Indexes ─────────────────────────────────────────────────────────────────

const ALL_ENTRIES: ServiceEntry[] = [
  ...UPS_MAP.map(e => ({ ...e, network: 'ups' as const })),
  ...FEDEX_MAP.map(e => ({ ...e, network: 'fedex' as const })),
]

const byDirectCode = new Map<string, ServiceEntry>()
const byShipEngineCode = new Map<string, ServiceEntry>()
const byIdentity = new Map<string, ServiceEntry>()

for (const e of ALL_ENTRIES) {
  byDirectCode.set(`${e.network}:${e.directCode}`, e)
  byShipEngineCode.set(e.shipEngineCode, e)
  byIdentity.set(e.identity, e)
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Given a ShipEngine service code (e.g. "ups_ground"), return the Direct
 * carrier equivalent or null.
 */
export function getDirectEquivalent(shipEngineServiceCode: string): {
  carrier: CarrierNetwork
  code: string
  identity: string
  name: string
} | null {
  const e = byShipEngineCode.get(shipEngineServiceCode)
  if (!e) return null
  return { carrier: e.network, code: e.directCode, identity: e.identity, name: e.name }
}

/**
 * Given a direct carrier code (e.g. "ups", "03"), return the ShipEngine
 * service code equivalent or null.
 */
export function getShipEngineEquivalent(
  carrierNetwork: CarrierNetwork,
  directCode: string,
): string | null {
  const e = byDirectCode.get(`${carrierNetwork}:${directCode}`)
  return e?.shipEngineCode ?? null
}

/**
 * Normalise any service code (ShipEngine, Direct prefixed, or raw) into a
 * stable identity string for deduplication.
 *
 * Examples:
 *   "ups_ground"             → "ups:ground"
 *   "ups-direct:03"          → "ups:ground"
 *   "fedex_2day"             → "fedex:2day"
 *   "fedex-direct:FEDEX_2_DAY" → "fedex:2day"
 *   "usps_first_class_mail"  → "usps_first_class_mail" (passthrough)
 */
export function getServiceIdentity(serviceCode: string): string {
  // Check ShipEngine code first
  const se = byShipEngineCode.get(serviceCode)
  if (se) return se.identity

  // Check "carrier-direct:CODE" format
  if (serviceCode.startsWith('ups-direct:')) {
    const raw = serviceCode.replace('ups-direct:', '')
    const e = byDirectCode.get(`ups:${raw}`)
    if (e) return e.identity
  }
  if (serviceCode.startsWith('fedex-direct:')) {
    const raw = serviceCode.replace('fedex-direct:', '')
    const e = byDirectCode.get(`fedex:${raw}`)
    if (e) return e.identity
  }

  // Passthrough for codes we don't have a mapping for (USPS, etc.)
  return serviceCode
}

/**
 * Look up the full entry by identity key.
 */
export function getEntryByIdentity(identity: string): ServiceEntry | null {
  return byIdentity.get(identity) ?? null
}

/**
 * Detect the carrier network from a carrierCode.
 * Works with both ShipEngine codes ("ups", "fedex") and direct codes
 * ("ups-direct", "fedex-direct").
 */
export function detectCarrierNetwork(carrierCode: string): CarrierNetwork | null {
  const c = carrierCode.toLowerCase()
  if (c.includes('ups')) return 'ups'
  if (c.includes('fedex') || c.includes('fdx')) return 'fedex'
  return null
}

export { ALL_ENTRIES, UPS_MAP, FEDEX_MAP }
export type { ServiceEntry, CarrierNetwork }
