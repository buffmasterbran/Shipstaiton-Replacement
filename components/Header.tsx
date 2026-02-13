'use client'

import type { UserRole } from './MainLayout'
import type { FilterMode } from '@/context/ExpeditedFilterContext'

interface HeaderProps {
  role: UserRole
  setRole: (role: UserRole) => void
  // New 3-state filter APIs
  expeditedFilter?: FilterMode
  setExpeditedFilter?: (value: FilterMode) => void
  personalizedFilter?: FilterMode
  setPersonalizedFilter?: (value: FilterMode) => void
  hideExpeditedToggle?: boolean
  // Legacy APIs (kept for backwards compatibility)
  expeditedOnly?: boolean
  setExpeditedOnly?: (value: boolean) => void
  hidePersonalized?: boolean
  setHidePersonalized?: (value: boolean) => void
  onProcessClick?: () => void
  processButtonText?: string
  showProcessButton?: boolean
  processButtonDisabled?: boolean
  ordersCount?: number
  ordersLoading?: boolean
  lastFetchedAt?: Date | null
  onRefreshOrders?: () => void
  dateStart?: string
  dateEnd?: string
  setDateStart?: (d: string) => void
  setDateEnd?: (d: string) => void
}

// Cycle through filter modes: all -> only -> hide -> all
function cycleFilterMode(current: FilterMode): FilterMode {
  if (current === 'all') return 'only'
  if (current === 'only') return 'hide'
  return 'all'
}

// Get display text for filter mode
function getFilterLabel(mode: FilterMode, type: 'expedited' | 'personalized'): string {
  if (type === 'expedited') {
    if (mode === 'all') return 'Shipping: All'
    if (mode === 'only') return 'Shipping: Expedited'
    return 'Shipping: Standard'
  } else {
    if (mode === 'all') return 'PERS & Non-PERS'
    if (mode === 'only') return 'PERS Only'
    return 'Non-PERS'
  }
}

// Get button color based on filter mode
function getFilterButtonClass(mode: FilterMode, type: 'expedited' | 'personalized'): string {
  const baseClass = 'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors'
  if (mode === 'all') {
    return `${baseClass} bg-gray-100 text-gray-600 hover:bg-gray-200`
  }
  if (mode === 'only') {
    return type === 'expedited'
      ? `${baseClass} bg-orange-500 text-white`
      : `${baseClass} bg-purple-500 text-white`
  }
  // hide mode
  return type === 'expedited'
    ? `${baseClass} bg-orange-200 text-orange-800`
    : `${baseClass} bg-purple-200 text-purple-800`
}

export default function Header({
  role,
  setRole,
  expeditedFilter = 'all',
  setExpeditedFilter,
  personalizedFilter = 'hide',
  setPersonalizedFilter,
  hideExpeditedToggle = false,
  // Legacy props (ignored if new props are provided)
  expeditedOnly,
  setExpeditedOnly,
  hidePersonalized,
  setHidePersonalized,
  onProcessClick,
  processButtonText = 'Process',
  showProcessButton = false,
  processButtonDisabled = false,
  ordersCount,
  ordersLoading = false,
  lastFetchedAt,
  onRefreshOrders,
  dateStart: startDate = '',
  dateEnd: endDate = '',
  setDateStart: setStartDate,
  setDateEnd: setEndDate,
}: HeaderProps) {

  const formatLastFetched = (date: Date | null | undefined) => {
    if (!date) return ''
    const now = new Date()
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000)
    if (diff < 60) return 'just now'
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
      {/* Date Range Picker + Filter Toggles */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate?.(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm text-gray-700"
          />
          <span className="text-gray-400 text-sm">–</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate?.(e.target.value)}
            min={startDate || undefined}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm text-gray-700"
          />
          {(startDate || endDate) && (
            <button
              onClick={() => { setStartDate?.(''); setEndDate?.('') }}
              className="text-gray-400 hover:text-gray-600 text-sm"
              title="Clear dates"
            >
              ✕
            </button>
          )}
        </div>

        {/* Expedited Filter Toggle (3-state) */}
        {!hideExpeditedToggle && setExpeditedFilter && (
          <button
            type="button"
            onClick={() => setExpeditedFilter(cycleFilterMode(expeditedFilter))}
            className={getFilterButtonClass(expeditedFilter, 'expedited')}
            title="Click to cycle: All → Expedited → Standard"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
            {getFilterLabel(expeditedFilter, 'expedited')}
          </button>
        )}

        {/* Refresh Orders Button */}
        {onRefreshOrders && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onRefreshOrders}
              disabled={ordersLoading}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                ordersLoading
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
              }`}
              title="Refresh orders from database"
            >
              <svg
                className={`w-4 h-4 ${ordersLoading ? 'animate-spin' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              {ordersLoading ? 'Loading...' : 'Refresh'}
            </button>
            {ordersCount !== undefined && !ordersLoading && (
              <span className="text-xs text-gray-500">
                {ordersCount} orders {lastFetchedAt && `• ${formatLastFetched(lastFetchedAt)}`}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Right Side: Process */}
      <div className="flex items-center gap-6">
        {showProcessButton && onProcessClick && (
          <button
            onClick={onProcessClick}
            disabled={processButtonDisabled}
            className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${
              processButtonDisabled
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-green-600 text-white hover:bg-green-700'
            }`}
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            {processButtonText}
          </button>
        )}
        {/* Settings Gear Icon */}
        <a
          href="/settings"
          className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          title="Settings"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </a>
      </div>
    </div>
  )
}
