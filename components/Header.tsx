'use client'

import { useState } from 'react'

interface HeaderProps {
  onProcessClick?: () => void
  processButtonText?: string
  showProcessButton?: boolean
  processButtonDisabled?: boolean
}

export default function Header({ 
  onProcessClick, 
  processButtonText = 'Process',
  showProcessButton = false,
  processButtonDisabled = false
}: HeaderProps) {
  const [dateRange, setDateRange] = useState('')

  return (
    <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
      {/* Date Range Picker */}
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

      {/* Right Side */}
      <div className="flex items-center gap-4">
        <span className="text-gray-700">Welcome, Brandegee C Pierce</span>
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

