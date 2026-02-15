'use client'

import { useState } from 'react'
import { SubTab } from './types'
import { ShippingMethodMappingsTab } from './ShippingMethodMappingsTab'
import { WeightRulesTab } from './WeightRulesTab'
import { RateShoppersTab } from './RateShoppersTab'

export default function ShippingRulesPage() {
  const [activeTab, setActiveTab] = useState<SubTab>('mappings')

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Shipping Rules</h1>
        <p className="text-gray-600 mt-1">
          Configure how incoming orders are mapped to carriers and services
        </p>
      </div>

      {/* Sub-tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('mappings')}
            className={`py-3 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'mappings'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Shipping Method Mappings
          </button>
          <button
            onClick={() => setActiveTab('weight-rules')}
            className={`py-3 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'weight-rules'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Weight Rules
          </button>
          <button
            onClick={() => setActiveTab('rate-shoppers')}
            className={`py-3 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'rate-shoppers'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Rate Shoppers
          </button>
        </nav>
      </div>

      {activeTab === 'mappings' && <ShippingMethodMappingsTab />}
      {activeTab === 'weight-rules' && <WeightRulesTab />}
      {activeTab === 'rate-shoppers' && <RateShoppersTab />}
    </div>
  )
}
