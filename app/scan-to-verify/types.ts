// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VerifyItem {
  sku: string
  barcode: string | null
  name: string
  color: string
  size: string
  quantity: number
  scanned: number
  weightLbs: number
}

export type ScanStatus = 'idle' | 'success' | 'error'

export interface OrderData {
  id: string
  orderNumber: string
  status: string
  rawPayload: any
  suggestedBox?: any
  preShoppedRate?: any
}
