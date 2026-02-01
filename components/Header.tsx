'use client'

import { useState } from 'react'
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
}: HeaderProps) {
  const [dateRange, setDateRange] = useState('')

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
            type="text"
            placeholder="MM/DD/YYYY - MM/DD/YYYY"
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <svg
            className="w-5 h-5 text-gray-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
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

        {/* Personalized Filter Toggle (3-state) */}
        {setPersonalizedFilter && (
          <button
            type="button"
            onClick={() => setPersonalizedFilter(cycleFilterMode(personalizedFilter))}
            className={getFilterButtonClass(personalizedFilter, 'personalized')}
            title="Click to cycle: All → PERS Only → Non-PERS"
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
                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
              />
            </svg>
            {getFilterLabel(personalizedFilter, 'personalized')}
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

      {/* Right Side: Role + Welcome + Process */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-600">View as:</span>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="role"
              checked={role === 'admin'}
              onChange={() => setRole('admin')}
              className="w-4 h-4 text-green-600 focus:ring-green-500"
            />
            <span className="text-sm text-gray-700">Admin</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="role"
              checked={role === 'operator'}
              onChange={() => setRole('operator')}
              className="w-4 h-4 text-green-600 focus:ring-green-500"
            />
            <span className="text-sm text-gray-700">Operator</span>
          </label>
        </div>
        <span className="text-gray-700 border-l border-gray-200 pl-4">Welcome, Brandegee C Pierce</span>
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
      </div>
    </div>
  )
}
