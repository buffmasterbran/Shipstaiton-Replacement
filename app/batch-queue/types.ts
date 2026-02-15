export interface PickCell {
  id: string
  name: string
  active: boolean
}

export interface CellAssignment {
  id: string
  cellId: string
  priority: number
  cell: PickCell
}

export interface BulkBatchInfo {
  id: string
  groupSignature: string
  orderCount: number
  splitIndex: number
  totalSplits: number
  status: string
}

export interface PickBatch {
  id: string
  name: string
  type: 'SINGLES' | 'BULK' | 'ORDER_BY_SIZE'
  status: 'ACTIVE' | 'IN_PROGRESS' | 'COMPLETED' | 'DRAFT' | 'RELEASED'
  priority: number
  isPersonalized: boolean
  totalOrders: number
  pickedOrders: number
  shippedOrders: number
  engravedOrders: number
  createdAt: string
  completedAt: string | null
  cellAssignments: CellAssignment[]
  bulkBatches?: BulkBatchInfo[]
  _count: {
    orders: number
    chunks: number
  }
}
