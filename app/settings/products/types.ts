export interface ProductSize {
  id: string
  name: string
  lengthInches: number
  widthInches: number
  heightInches: number
  volume?: number
  weightLbs: number
  category: string
  active: boolean
  singleBoxId?: string | null
}

export interface Box {
  id: string
  name: string
  lengthInches: number
  widthInches: number
  heightInches: number
  active: boolean
}

export interface ProductSku {
  sku: string
  productSizeId: string
  name: string | null
  barcode: string | null
  binLocation: string | null
  active: boolean
}

export interface ProductSkuPattern {
  id: number
  productSizeId: string
  pattern: string
}

export interface UnmatchedSku {
  sku: string
  firstSeen: string
  lastSeen: string
  occurrences: number
  exampleOrder: string | null
  itemName: string | null
  dismissed: boolean
}

export interface ProductsConfig {
  sizes: ProductSize[]
  skus: ProductSku[]
  patterns: ProductSkuPattern[]
  unmatchedSkus: UnmatchedSku[]
}

export const CATEGORIES = ['tumbler', 'bottle', 'accessory', 'other']
