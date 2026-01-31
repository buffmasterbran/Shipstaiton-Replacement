'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

interface ExpeditedFilterContextType {
  expeditedOnly: boolean
  setExpeditedOnly: (value: boolean) => void
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

export function ExpeditedFilterProvider({ children }: { children: ReactNode }) {
  const [expeditedOnly, setExpeditedOnly] = useState(false)

  // Persist to localStorage
  useEffect(() => {
    const stored = localStorage.getItem('expeditedOnly')
    if (stored === 'true') {
      setExpeditedOnly(true)
    }
  }, [])

  const handleSetExpeditedOnly = (value: boolean) => {
    setExpeditedOnly(value)
    localStorage.setItem('expeditedOnly', value.toString())
  }

  return (
    <ExpeditedFilterContext.Provider value={{ expeditedOnly, setExpeditedOnly: handleSetExpeditedOnly }}>
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
