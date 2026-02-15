import type { Box } from '@/lib/box-config'
import type { Product } from '@/lib/products'

export type { Box }
export type { Product }

export interface FeedbackRule {
  id: string
  comboSignature: string
  boxId: string
  fits: boolean
  correctBoxId?: string
  testedAt: string
}

export interface BoxConfig {
  boxes: Box[]
  feedbackRules: FeedbackRule[]
  packingEfficiency: number
  version: string
}
