'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

interface ExpeditedFilterContextType {
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

export function ExpeditedFilterProvider({ children }: { children: ReactNode }) {
  const [expeditedOnly, setExpeditedOnly] = useState(false)
  const [hidePersonalized, setHidePersonalized] = useState(true) // Default to hiding personalized

  // Persist to localStorage
  useEffect(() => {
    const storedExpedited = localStorage.getItem('expeditedOnly')
    if (storedExpedited === 'true') {
      setExpeditedOnly(true)
    }

    const storedPersonalized = localStorage.getItem('hidePersonalized')
    // Default to true (hide personalized) unless explicitly set to false
    if (storedPersonalized === 'false') {
      setHidePersonalized(false)
    }
  }, [])

  const handleSetExpeditedOnly = (value: boolean) => {
    setExpeditedOnly(value)
    localStorage.setItem('expeditedOnly', value.toString())
  }

  const handleSetHidePersonalized = (value: boolean) => {
    setHidePersonalized(value)
    localStorage.setItem('hidePersonalized', value.toString())
  }

  return (
    <ExpeditedFilterContext.Provider
      value={{
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
