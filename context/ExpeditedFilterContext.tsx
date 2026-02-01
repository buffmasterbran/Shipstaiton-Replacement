'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

// Filter modes: 'all' = show everything, 'only' = show only matching, 'hide' = hide matching
export type FilterMode = 'all' | 'only' | 'hide'

interface ExpeditedFilterContextType {
  // 3-state filter APIs
  expeditedFilter: FilterMode
  setExpeditedFilter: (value: FilterMode) => void
  personalizedFilter: FilterMode
  setPersonalizedFilter: (value: FilterMode) => void
  // Legacy boolean APIs (for backwards compatibility - derived from filter modes)
  expeditedOnly: boolean
  setExpeditedOnly: (value: boolean) => void
  hidePersonalized: boolean
  setHidePersonalized: (value: boolean) => void
}

const ExpeditedFilterContext = createContext<ExpeditedFilterContextType | undefined>(undefined)

// Expedited shipping methods (same list as ExpeditedOrdersTable)
export const EXPEDITED_SHIPPING_METHODS = [
  'ups next day',
  'ups next day air',
  'ups 2nd day',
  'ups 2nd day air',
  'ups 2 day',
  'ups 2 day air',
  'ups 3 day',
  'ups 3 day select',
  'next day',
  '2nd day',
  '2 day',
  '3 day',
]

/** Check if an order has expedited shipping based on the raw payload. */
export function isOrderExpedited(rawPayload: any, customerReachedOut?: boolean): boolean {
  if (customerReachedOut) return true

  const order = Array.isArray(rawPayload) ? rawPayload[0] : rawPayload
  const method = (order?.requestedShippingService || order?.shippingMethod || order?.carrierCode || '').toLowerCase()
  return EXPEDITED_SHIPPING_METHODS.some(exp => method.includes(exp))
}

/** Check if an order contains personalized items. Uses the isPersonalized field from the payload if available, otherwise falls back to SKU/name detection. */
export function isOrderPersonalized(rawPayload: any): boolean {
  const order = Array.isArray(rawPayload) ? rawPayload[0] : rawPayload

  // First, check the explicit isPersonalized field from NetSuite
  if (order?.isPersonalized !== undefined && order?.isPersonalized !== null) {
    // Handle boolean, string "true"/"false", or truthy/falsy values
    if (typeof order.isPersonalized === 'boolean') {
      return order.isPersonalized
    }
    if (typeof order.isPersonalized === 'string') {
      return order.isPersonalized.toLowerCase() === 'true' || order.isPersonalized === 'T'
    }
    return Boolean(order.isPersonalized)
  }

  // Fallback: check SKU/name patterns for older orders without the field
  const items = order?.items || []

  for (const item of items) {
    const sku = (item.sku || '').toUpperCase()
    const name = (item.name || '').toUpperCase()

    // Check for personalization indicators
    if (
      sku.includes('-PERS') ||
      sku.includes('PERS-') ||
      sku.endsWith('PERS') ||
      name.includes('PERSONALI') ||
      name.includes('ENGRAV') ||
      name.includes('CUSTOM')
    ) {
      return true
    }
  }

  return false
}

/** Apply filter mode to check if order should be shown */
export function shouldShowOrder(
  rawPayload: any,
  personalizedFilter: FilterMode,
  expeditedFilter: FilterMode,
  customerReachedOut?: boolean
): boolean {
  const isPersonalized = isOrderPersonalized(rawPayload)
  const isExpedited = isOrderExpedited(rawPayload, customerReachedOut)

  // Check personalized filter
  if (personalizedFilter === 'only' && !isPersonalized) return false
  if (personalizedFilter === 'hide' && isPersonalized) return false

  // Check expedited filter
  if (expeditedFilter === 'only' && !isExpedited) return false
  if (expeditedFilter === 'hide' && isExpedited) return false

  return true
}

export function ExpeditedFilterProvider({ children }: { children: ReactNode }) {
  const [expeditedFilter, setExpeditedFilter] = useState<FilterMode>('hide') // Default: Shipping: Standard (hide expedited)
  const [personalizedFilter, setPersonalizedFilter] = useState<FilterMode>('hide') // Default: Non-PERS (hide personalized)

  // Persist to localStorage
  useEffect(() => {
    const storedExpedited = localStorage.getItem('expeditedFilter')
    if (storedExpedited === 'all' || storedExpedited === 'only' || storedExpedited === 'hide') {
      setExpeditedFilter(storedExpedited)
    }

    const storedPersonalized = localStorage.getItem('personalizedFilter')
    if (storedPersonalized === 'all' || storedPersonalized === 'only' || storedPersonalized === 'hide') {
      setPersonalizedFilter(storedPersonalized)
    }
  }, [])

  const handleSetExpeditedFilter = (value: FilterMode) => {
    setExpeditedFilter(value)
    localStorage.setItem('expeditedFilter', value)
  }

  const handleSetPersonalizedFilter = (value: FilterMode) => {
    setPersonalizedFilter(value)
    localStorage.setItem('personalizedFilter', value)
  }

  // Legacy boolean APIs for backwards compatibility
  const expeditedOnly = expeditedFilter === 'only'
  const hidePersonalized = personalizedFilter === 'hide'

  const handleSetExpeditedOnly = (value: boolean) => {
    handleSetExpeditedFilter(value ? 'only' : 'all')
  }

  const handleSetHidePersonalized = (value: boolean) => {
    handleSetPersonalizedFilter(value ? 'hide' : 'all')
  }

  return (
    <ExpeditedFilterContext.Provider
      value={{
        expeditedFilter,
        setExpeditedFilter: handleSetExpeditedFilter,
        personalizedFilter,
        setPersonalizedFilter: handleSetPersonalizedFilter,
        // Legacy APIs
        expeditedOnly,
        setExpeditedOnly: handleSetExpeditedOnly,
        hidePersonalized,
        setHidePersonalized: handleSetHidePersonalized,
      }}
    >
      {children}
    </ExpeditedFilterContext.Provider>
  )
}

export function useExpeditedFilter() {
  const context = useContext(ExpeditedFilterContext)
  if (context === undefined) {
    throw new Error('useExpeditedFilter must be used within an ExpeditedFilterProvider')
  }
  return context
}
