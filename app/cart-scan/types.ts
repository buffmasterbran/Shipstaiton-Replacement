export interface PickCart {
  id: string
  name: string
  color: string | null
  status: string
}

export interface ChunkOrder {
  id: string
  orderNumber: string
  binNumber: number | null
  rawPayload: any
  status: string
  labelPrepurchased?: boolean
  trackingNumber?: string | null
}

export interface BulkSkuLayoutEntry {
  sku: string
  binQty: number
  masterUnitIndex: number
}

export interface PickChunk {
  id: string
  batchId: string
  chunkNumber: number
  status: string
  pickingMode?: string
  isPersonalized?: boolean
  cartId: string
  batch: {
    id: string
    name: string
    type?: string
    isPersonalized?: boolean
  }
  orders: ChunkOrder[]
  bulkBatchAssignments?: Array<{
    shelfNumber: number
    bulkBatch: {
      id: string
      skuLayout: BulkSkuLayoutEntry[]
      orderCount: number
    }
  }>
}

export interface CartWithChunks extends PickCart {
  chunks: PickChunk[]
}

export interface OrderItem {
  sku: string
  name: string
  quantity: number
}

export interface PrintNodeComputer {
  id: number
  name: string
  friendlyName: string
  state: string
  printers: { id: number; name: string; friendlyName: string; isDefault: boolean }[]
  scales: { deviceName: string; deviceNum: number; friendlyName: string }[]
}

export interface ShippingDetails {
  weightOz: string
  weightLbs: string
  boxName: string
  boxId: string
  lengthIn: string
  widthIn: string
  heightIn: string
  carrier: string
  service: string
  carrierServiceKey: string // "carrier|serviceCode" for dropdown matching
}

export interface BoxOption {
  id: string
  name: string
  lengthInches: number
  widthInches: number
  heightInches: number
  weightLbs: number
  active: boolean
}

export interface CarrierServiceOption {
  key: string // "carrierCode|serviceCode"
  carrier: string
  carrierCode: string
  serviceCode: string
  serviceName: string
}

export interface BulkShelfAssignment {
  shelfNumber: number
  bulkBatch: {
    id: string
    skuLayout: BulkSkuLayoutEntry[]
    orderCount: number
  }
}

export type ShipStep = 'cart-select' | 'shipping' | 'complete'
export type PickingMode = 'SINGLES' | 'BULK' | 'ORDER_BY_SIZE' | 'UNKNOWN'
