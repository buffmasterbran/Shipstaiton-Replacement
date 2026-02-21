export interface CarrierService {
  service_code: string
  name: string
  domestic: boolean
  international: boolean
}

export interface ShipEngineCarrier {
  carrier_id: string
  carrier_code: string
  account_number: string
  friendly_name: string
  nickname: string | null
  primary: boolean
  has_multi_package_supporting_services: boolean
  supports_label_messages: boolean
  requires_funded_amount: boolean
  funding_source_id: string | null
  services?: CarrierService[]
  packages?: Array<{
    package_code: string
    name: string
    description?: string
  }>
  options?: Array<{
    name: string
    default_value: string
    description?: string
  }>
}

export interface ClassifiedCarriers {
  own: ShipEngineCarrier[]
  managed: ShipEngineCarrier[]
}

export type CarrierTab = string

// ─── Unified Account types ───────────────────────────────────────────────────

export type CarrierNetwork = 'ups' | 'fedex' | 'usps' | 'dhl' | 'other'

export interface UnifiedService {
  identity: string                    // normalised key, e.g. "ups:ground"
  displayName: string
  domestic: boolean
  international: boolean
  directCode?: string                 // raw Direct code, e.g. "03"
  directConnectionId?: string         // UUID of the Direct connection
  shipEngineServiceCode?: string      // e.g. "ups_ground"
  shipEngineCarrierId?: string        // ShipEngine carrier_id
  shipEngineCarrierCode?: string      // e.g. "ups" or "fedex_walleted"
  shipEngineCarrierName?: string      // human-readable carrier name
  paths: ('direct' | 'shipengine')[]
}

export interface UnifiedAccount {
  id: string                          // e.g. "ups:0V2R99" or "se:se-12345"
  carrierNetwork: CarrierNetwork
  accountNumber: string | null
  nickname: string
  icon: string
  direct?: DirectConnectionConfig
  shipEngine?: ShipEngineCarrier      // primary SE carrier (for 1:1 accounts)
  shipEngineCarriers?: ShipEngineCarrier[] // multiple SE carriers (for merged marketplace tab)
  isMarketplace: boolean
  services: UnifiedService[]
}

export interface DirectConnectionConfig {
  id: string
  nickname: string
  clientId: string
  clientSecret: string
  accountNumber: string
  sandbox: boolean
  status: 'connected' | 'error' | 'untested'
  lastTestedAt?: string
  lastError?: string
  enabledServices?: string[]
}

export interface DirectConnections {
  ups?: DirectConnectionConfig[]
  fedex?: DirectConnectionConfig[]
}
