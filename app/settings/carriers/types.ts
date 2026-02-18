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

export type CarrierTab = 'our-accounts' | 'shipengine'
