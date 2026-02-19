'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Barcode from 'react-barcode'
import { ChunkOrder, OrderItem } from './types'
import { getShipstationBarcode, getOrderItems } from './helpers'
import { MockupButton } from './MockupModal'

export function StandardVerification({
  order,
  binNumber,
  isEmpty,
  onComplete,
  onNext,
}: {
  order: ChunkOrder | null
  binNumber: number
  isEmpty: boolean
  onComplete: () => void
  onNext: () => void
}) {
  const [items, setItems] = useState<OrderItem[]>([])
  const [scannedCounts, setScannedCounts] = useState<Map<string, number>>(new Map())
  const [scanInput, setScanInput] = useState('')
  const [scanError, setScanError] = useState<string | null>(null)
  const [allVerified, setAllVerified] = useState(false)
  const [labelPrinted, setLabelPrinted] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (order) {
      setItems(getOrderItems(order.rawPayload))
      setScannedCounts(new Map())
      setScanError(null)
      setAllVerified(false)
      setLabelPrinted(false)
    }
  }, [order])

  useEffect(() => {
    if (inputRef.current && !isEmpty) inputRef.current.focus()
  }, [order, isEmpty])

  useEffect(() => {
    if (items.length === 0) return
    const allDone = items.every(item => (scannedCounts.get(item.sku.toUpperCase()) || 0) >= item.quantity)
    setAllVerified(allDone)
  }, [items, scannedCounts])

  const handleScan = useCallback((value: string) => {
    if (!value.trim()) return
    const scannedValue = value.trim().toUpperCase()
    setScanInput('')
    setScanError(null)

    const matched = items.find(i => i.sku.toUpperCase() === scannedValue)
    if (!matched) { setScanError('Not in this order'); return }

    const current = scannedCounts.get(scannedValue) || 0
    if (current >= matched.quantity) setScanError(`Already scanned ${current}/${matched.quantity}`)

    setScannedCounts(prev => {
      const m = new Map(prev)
      m.set(scannedValue, (prev.get(scannedValue) || 0) + 1)
      return m
    })
  }, [items, scannedCounts])

  const handlePrintLabel = async () => {
    setLabelPrinted(true)
    onComplete()
  }

  if (isEmpty) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <h2 className="text-2xl font-bold text-gray-500 mb-2">Bin {binNumber} is Empty</h2>
        <button onClick={onNext} className="px-8 py-4 bg-blue-600 text-white text-xl font-bold rounded-xl hover:bg-blue-700">
          Continue →
        </button>
      </div>
    )
  }
  if (!order) return null

  const ssBarcode = getShipstationBarcode(order)

  return (
    <div className="flex-1 flex flex-col">
      <div className="bg-white shadow p-4 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-500">Order</div>
            <div className="text-2xl font-bold">#{order.orderNumber}</div>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-500">Bin</div>
            <div className="text-4xl font-bold text-blue-600">{binNumber}</div>
          </div>
        </div>
        {ssBarcode && (
          <div className="mt-3 flex justify-center">
            <Barcode value={ssBarcode} width={1.5} height={40} fontSize={12} margin={4} />
          </div>
        )}
      </div>

      <div className="px-4 mb-4">
        <input
          ref={inputRef}
          type="text"
          value={scanInput}
          onChange={(e) => setScanInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleScan(scanInput)}
          placeholder="Scan item barcode..."
          className="w-full px-4 py-3 text-lg border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none"
          disabled={allVerified}
        />
        {scanError && (
          <div className="mt-2 p-2 rounded-lg text-center font-medium bg-red-100 text-red-700">{scanError}</div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
          {items.map((item, idx) => {
            const scanned = scannedCounts.get(item.sku.toUpperCase()) || 0
            const isComplete = scanned >= item.quantity
            return (
            <div key={idx} className={`p-4 rounded-xl border-2 ${isComplete ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-white'}`}>
                <div className="flex items-center justify-between">
                <div>
                  <div className="font-mono text-lg font-bold text-gray-900">{item.sku}</div>
                  <div className="text-sm text-gray-600">{item.name}</div>
                  {item.mockupUrl && <MockupButton url={item.mockupUrl} />}
                    </div>
                <div className={`text-3xl font-bold ${isComplete ? 'text-green-600' : 'text-gray-400'}`}>
                  {scanned}/{item.quantity}
                    </div>
                  </div>
                    </div>
          )
        })}
      </div>

      <div className="p-4 bg-white shadow-lg space-y-3">
        {allVerified && !labelPrinted && (
          <button onClick={handlePrintLabel} className="w-full py-4 bg-green-600 text-white text-xl font-bold rounded-xl hover:bg-green-700">
            Print Label
          </button>
        )}
        {labelPrinted && <div className="text-center text-green-600 font-medium">Label printed</div>}
        <button
          onClick={onNext}
          disabled={!allVerified}
          className={`w-full py-4 text-xl font-bold rounded-xl ${allVerified ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
        >
          {labelPrinted ? 'Next Order →' : 'Verify Items First'}
        </button>
                  </div>
                </div>
  )
}
