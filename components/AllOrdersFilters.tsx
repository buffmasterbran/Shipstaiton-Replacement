'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

export default function AllOrdersFilters({
  from,
  to,
}: {
  from?: string
  to?: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [fromVal, setFromVal] = useState(from ?? '')
  const [toVal, setToVal] = useState(to ?? '')

  useEffect(() => {
    setFromVal(from ?? '')
    setToVal(to ?? '')
  }, [from, to])

  const apply = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString())
    if (fromVal) params.set('from', fromVal)
    else params.delete('from')
    if (toVal) params.set('to', toVal)
    else params.delete('to')
    router.push(`/?${params.toString()}`)
  }, [fromVal, toVal, router, searchParams])

  const clear = useCallback(() => {
    setFromVal('')
    setToVal('')
    router.push('/')
  }, [router])

  return (
    <div className="flex items-center gap-1.5 text-sm">
      <input
        type="date"
        value={fromVal}
        onChange={(e) => setFromVal(e.target.value)}
        className="border border-gray-300 rounded px-1.5 py-1 text-sm w-32"
        title="From date"
      />
      <span className="text-gray-400">–</span>
      <input
        type="date"
        value={toVal}
        onChange={(e) => setToVal(e.target.value)}
        className="border border-gray-300 rounded px-1.5 py-1 text-sm w-32"
        title="To date"
      />
      <button
        type="button"
        onClick={apply}
        className="px-2 py-1 bg-gray-800 text-white rounded text-sm hover:bg-gray-700"
      >
        Go
      </button>
      {(from || to) && (
        <button
          type="button"
          onClick={clear}
          className="px-2 py-1 text-gray-500 hover:text-gray-700 text-xs"
          title="Clear date filter"
        >
          ✕
        </button>
      )}
    </div>
  )
}
