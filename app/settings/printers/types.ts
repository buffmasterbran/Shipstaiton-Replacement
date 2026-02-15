export interface PrintNodePrinter {
  id: number
  name: string
  state: string
  friendlyName: string
  enabled: boolean
  isDefault: boolean
  computerFriendlyName: string
  computer: { id: number; name: string; state: string }
}

export interface ScaleInfo {
  deviceName: string
  deviceNum: number
  computerId: number
  vendor: string
  product: string
  measurement: Record<string, number>
}

export interface WeightReading {
  weight: string
  rawValue: number
  unit: string
  massOz: number | null
  ageOfData: number
}
