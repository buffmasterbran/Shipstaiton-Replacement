'use client'

import { useState, useEffect, useCallback } from 'react'

// ---------------------------------------------------------------------------
// Shared types — used by every component that needs reference data
// ---------------------------------------------------------------------------

export interface BoxConfig {
  id: string
  name: string
  lengthInches: number
  widthInches: number
  heightInches: number
  weightLbs: number
  active: boolean
}

export interface ShipLocation {
  id: string
  name: string
  company?: string | null
  addressLine1?: string
  addressLine2?: string | null
  city?: string
  state?: string
  postalCode?: string
  country?: string
  phone?: string
  email?: string | null
  isDefault: boolean
}

export interface CarrierService {
  carrierId: string
  carrierCode: string
  carrierName: string
  serviceCode: string
  serviceName: string
  accountNickname?: string | null
  domestic?: boolean
  international?: boolean
}

export interface SkuPattern {
  pattern: string
  weightLbs: number
}

export interface ReferenceData {
  // Dropdown data
  boxes: BoxConfig[]
  locations: ShipLocation[]
  carrierServices: CarrierService[]

  // SKU resolution data (for scan-to-verify and weight calculation)
  skuBarcodeMap: Record<string, string>
  skuWeightMap: Record<string, number>
  skuPatterns: SkuPattern[]
  boxMap: Record<string, BoxConfig>

  // Default selections
  defaultLocationId: string

  // Status
  loaded: boolean
  error: string | null

  // Actions
  refresh: () => Promise<void>
}

// ---------------------------------------------------------------------------
// Hook — single API call, returns everything, caches in component state
// ---------------------------------------------------------------------------

export function useReferenceData(): ReferenceData {
  const [boxes, setBoxes] = useState<BoxConfig[]>([])
  const [locations, setLocations] = useState<ShipLocation[]>([])
  const [carrierServices, setCarrierServices] = useState<CarrierService[]>([])
  const [skuBarcodeMap, setSkuBarcodeMap] = useState<Record<string, string>>({})
  const [skuWeightMap, setSkuWeightMap] = useState<Record<string, number>>({})
  const [skuPatterns, setSkuPatterns] = useState<SkuPattern[]>([])
  const [boxMap, setBoxMap] = useState<Record<string, BoxConfig>>({})
  const [defaultLocationId, setDefaultLocationId] = useState<string>('')
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    try {
      setError(null)
      const res = await fetch('/api/scan-to-verify/reference-data')
      if (!res.ok) throw new Error('Failed to load reference data')
      const data = await res.json()

      setBoxes(data.boxes || [])
      setBoxMap(data.boxMap || {})

      const locs: ShipLocation[] = data.locations || []
      setLocations(locs)
      const defaultLoc = locs.find(l => l.isDefault)
      setDefaultLocationId(defaultLoc?.id || (locs.length > 0 ? locs[0].id : ''))

      setCarrierServices(data.carrierServices || [])
      setSkuBarcodeMap(data.skuBarcodeMap || {})
      setSkuWeightMap(data.skuWeightMap || {})
      setSkuPatterns(data.skuPatterns || [])
      setLoaded(true)
    } catch (err: any) {
      console.error('Failed to load reference data:', err)
      setError(err.message || 'Failed to load reference data')
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  return {
    boxes,
    locations,
    carrierServices,
    skuBarcodeMap,
    skuWeightMap,
    skuPatterns,
    boxMap,
    defaultLocationId,
    loaded,
    error,
    refresh: loadData,
  }
}

// ---------------------------------------------------------------------------
// Helper functions — for resolving SKUs using cached data
// ---------------------------------------------------------------------------

/** Resolve a SKU to its barcode using cached reference data */
export function resolveBarcode(
  sku: string,
  skuBarcodeMap: Record<string, string>,
): string | null {
  if (!sku) return null
  return skuBarcodeMap[sku] || skuBarcodeMap[sku.toUpperCase()] || null
}

/** Resolve a SKU to its weight using cached reference data (exact match + regex) */
export function resolveWeight(
  sku: string,
  skuWeightMap: Record<string, number>,
  skuPatterns: SkuPattern[],
): number {
  if (!sku) return 0
  // Exact match
  const exact = skuWeightMap[sku] ?? skuWeightMap[sku.toUpperCase()]
  if (exact !== undefined) return exact
  // Regex pattern fallback
  for (const p of skuPatterns) {
    try {
      if (new RegExp(p.pattern, 'i').test(sku)) return p.weightLbs
    } catch { continue }
  }
  return 0
}
