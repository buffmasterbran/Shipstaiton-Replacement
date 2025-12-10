'use client'

import { useState } from 'react'
import TestOrdersForm from '@/components/TestOrdersForm'

export default function TestOrdersPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Test Orders - ShipEngine Integration</h1>
      <TestOrdersForm />
    </div>
  )
}

