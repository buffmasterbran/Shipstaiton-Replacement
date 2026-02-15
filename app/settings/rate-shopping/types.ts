export interface CarrierService {
  carrierId: string
  carrierName: string
  serviceCode: string
  serviceName: string
}

export interface Carrier {
  carrier_id: string
  carrier_code: string
  friendly_name: string
  services?: Array<{
    service_code: string
    name: string
    domestic: boolean
    international: boolean
  }>
}

export interface RateShopper {
  id: string
  name: string
  services: CarrierService[]
  transitTimeRestriction: string | null
  preferenceEnabled: boolean
  preferredServiceCode: string | null
  preferenceType: string | null
  preferenceValue: number | null
  isDefault: boolean
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface ShippingMethodMapping {
  id: string
  incomingName: string
  targetType: 'service' | 'weight_rules' | 'rate_shopper'
  carrierId: string | null
  carrierCode: string | null
  serviceCode: string | null
  serviceName: string | null
  rateShopperId: string | null
  rateShopper?: RateShopper | null
  isExpedited: boolean
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface WeightRuleLocal {
  id?: string
  minOz: number
  maxOz: number
  targetType: 'service' | 'rate_shopper'
  carrierId?: string
  carrierCode?: string
  serviceCode?: string
  serviceName?: string
  rateShopperId?: string
  rateShopper?: { id: string; name: string; active: boolean } | null
  isActive: boolean
}

export type SubTab = 'mappings' | 'weight-rules' | 'rate-shoppers'
