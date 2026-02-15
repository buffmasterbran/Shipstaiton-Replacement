'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import Barcode from 'react-barcode'
import { ChunkOrder, OrderItem } from './types'
import { getShipstationBarcode, getOrderItems } from './helpers'

export function SinglesVerification({
  binOrders,
  binNumber,
  onComplete,
  onNext,
}: {
  binOrders: ChunkOrder[]
  binNumber: number
  onComplete: () => void
  onNext: () => void
}) {
  const [scanInput, setScanInput] = useState('')
  const [scanError, setScanError] = useState<string | null>(null)
  const [primaryScanned, setPrimaryScanned] = useState(false)
  const [spotCheckRequired, setSpotCheckRequired] = useState(false)
  const [spotCheckDone, setSpotCheckDone] = useState(false)
  const [labelsPrinted, setLabelsPrinted] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Expected SKU from first order
  const expectedSku = useMemo(() => {
    if (binOrders.length === 0) return ''
    const items = getOrderItems(binOrders[0].rawPayload)
    return items[0]?.sku?.toUpperCase() || ''
  }, [binOrders])

  // Determine if spot check needed (20% chance)
  useEffect(() => {
    setPrimaryScanned(false)
    setSpotCheckRequired(Math.random() < 0.2) // 20% of the time
    setSpotCheckDone(false)
    setLabelsPrinted(false)
    setScanError(null)
    setScanInput('')
    if (inputRef.current) inputRef.current.focus()
  }, [binNumber])

  const handleScan = useCallback((value: string) => {
    if (!value.trim()) return
    const scanned = value.trim().toUpperCase()
    setScanInput('')
    setScanError(null)

    if (scanned === expectedSku) {
      if (!primaryScanned) {
        setPrimaryScanned(true)
      } else if (spotCheckRequired && !spotCheckDone) {
        setSpotCheckDone(true)
      }
    } else {
      setScanError(`Expected ${expectedSku}, got ${scanned}. WRONG ITEM!`)
    }
  }, [expectedSku, primaryScanned, spotCheckRequired, spotCheckDone])

  const verified = primaryScanned && (!spotCheckRequired || spotCheckDone)

  const handlePrintLabels = async () => {
    setLabelsPrinted(true)
    onComplete()
  }

  if (binOrders.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <h2 className="text-2xl font-bold text-gray-500 mb-2">Bin {binNumber} is Empty</h2>
        <button onClick={onNext} className="px-8 py-4 bg-blue-600 text-white text-xl font-bold rounded-xl hover:bg-blue-700">
          Continue →
        </button>
              </div>
            )
  }

  return (
    <div className="flex-1 flex flex-col">
      <div className="bg-white shadow p-4 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-500">Bin {binNumber} &mdash; Singles</div>
            <div className="text-2xl font-bold">{binOrders.length} orders</div>
            <div className="text-sm text-gray-500 font-mono">{expectedSku}</div>
          </div>
          <div className="text-right">
            <div className={`text-lg font-bold ${verified ? 'text-green-600' : 'text-amber-600'}`}>
              {verified ? 'Verified' : primaryScanned ? 'Spot check...' : 'Scan 1 item'}
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 mb-4">
        <input
          ref={inputRef}
          type="text"
          value={scanInput}
          onChange={(e) => setScanInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleScan(scanInput)}
          placeholder={!primaryScanned ? 'Scan 1 item to verify...' : 'Spot check: scan another item...'}
          className="w-full px-4 py-3 text-lg border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none"
          disabled={verified}
        />
        {scanError && (
          <div className="mt-2 p-2 rounded-lg text-center font-medium bg-red-100 text-red-700">{scanError}</div>
        )}
      </div>

      <div className="flex-1 px-4 flex flex-col items-center justify-center">
        {primaryScanned && spotCheckRequired && !spotCheckDone && (
          <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-6 text-center mb-4">
            <div className="text-2xl font-bold text-amber-700 mb-2">Spot Check Required</div>
            <div className="text-lg text-amber-600">
              Scan a random item from this bin to verify correctness
            </div>
          </div>
        )}
        {verified && !labelsPrinted && (
          <div className="text-center">
            <div className="text-6xl text-green-500 mb-4">&#10003;</div>
            <div className="text-xl text-green-700 font-medium mb-4">
              Bin verified! Ready to print {binOrders.length} labels.
            </div>
            <div className="max-h-48 overflow-y-auto space-y-2">
              {binOrders.map((o, i) => {
                const bc = getShipstationBarcode(o)
                return bc ? (
                  <div key={o.id} className="flex items-center justify-center gap-2">
                    <span className="text-xs text-gray-400 w-16 text-right">#{o.orderNumber}</span>
                    <Barcode value={bc} width={1.2} height={30} fontSize={10} margin={2} />
                  </div>
                ) : null
          })}
        </div>
          </div>
        )}
        {labelsPrinted && (
          <div className="text-center">
            <div className="text-xl text-green-700 font-medium mb-4">
              {binOrders.length} labels printed. Apply labels and move on.
            </div>
            <div className="max-h-48 overflow-y-auto space-y-2">
              {binOrders.map((o, i) => {
                const bc = getShipstationBarcode(o)
                return bc ? (
                  <div key={o.id} className="flex items-center justify-center gap-2">
                    <span className="text-xs text-gray-400 w-16 text-right">#{o.orderNumber}</span>
                    <Barcode value={bc} width={1.2} height={30} fontSize={10} margin={2} />
                  </div>
                ) : null
              })}
            </div>
          </div>
        )}
      </div>

      <div className="p-4 bg-white shadow-lg space-y-3">
        {verified && !labelsPrinted && (
          <button onClick={handlePrintLabels} className="w-full py-4 bg-green-600 text-white text-xl font-bold rounded-xl hover:bg-green-700">
            Print {binOrders.length} Labels
          </button>
        )}
        {labelsPrinted && (
          <button onClick={onNext} className="w-full py-4 bg-blue-600 text-white text-xl font-bold rounded-xl hover:bg-blue-700">
            Next Bin →
          </button>
        )}
      </div>
    </div>
  )
}
