export interface PickCell {
  id: string
  name: string
  active: boolean
}

export interface PickCart {
  id: string
  name: string
  color: string | null
  status: string
  active: boolean
  activeChunk?: {
    pickerName: string
    claimedAt: string
    ordersInChunk: number
  } | null
}

export interface OrderItem {
  sku: string
  name: string
  quantity: number
}

export interface ChunkOrder {
  id: string
  orderNumber: string
  binNumber: number
  rawPayload: any
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
  pickingMode?: 'SINGLES' | 'BULK' | 'ORDER_BY_SIZE'
  isPersonalized?: boolean
  cartId: string
  pickerName: string
  ordersInChunk: number
  batch: {
    id: string
    name: string
    type?: 'SINGLES' | 'BULK' | 'ORDER_BY_SIZE'
    isPersonalized?: boolean
  }
  cart: PickCart
  orders: ChunkOrder[]
  bulkBatchAssignments?: Array<{
    shelfNumber: number
    bulkBatch: {
      id: string
      skuLayout: BulkSkuLayoutEntry[]
      orderCount: number
      groupSignature: string
    }
  }>
}

// Item grouped by SKU with bin distribution
export interface PickItem {
  sku: string
  name: string
  binLocation: string
  productSize: string
  productColor: string
  bins: Array<{ binNumber: number; quantity: number }>
  totalQuantity: number
}

export type PickerStep = 'login' | 'cell-select' | 'cart-select' | 'picking' | 'complete'
