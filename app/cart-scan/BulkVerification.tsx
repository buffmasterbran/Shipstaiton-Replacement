'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import Barcode from 'react-barcode'
import { ChunkOrder, OrderItem, BulkSkuLayoutEntry, BulkShelfAssignment } from './types'
import { getShipstationBarcode, getOrderItems } from './helpers'

export function BulkVerification({
  shelfAssignments,
  ordersByShelf,
  shippedOrders,
  onCompleteOrder,
  onCompleteCart,
}: {
  shelfAssignments: BulkShelfAssignment[]
  ordersByShelf: Map<number, ChunkOrder[]>
  shippedOrders: Set<string>
  onCompleteOrder: (orderNumber: string) => void
  onCompleteCart: () => void
}) {
  const [currentShelfIdx, setCurrentShelfIdx] = useState(0)
  const [currentOrderInShelf, setCurrentOrderInShelf] = useState(0)
  const [items, setItems] = useState<OrderItem[]>([])
  const [scannedCounts, setScannedCounts] = useState<Map<string, number>>(new Map())
  const [scanInput, setScanInput] = useState('')
  const [scanError, setScanError] = useState<string | null>(null)
  const [allVerified, setAllVerified] = useState(false)
  const [labelPrinted, setLabelPrinted] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const currentShelf = shelfAssignments[currentShelfIdx]
  const shelfOrders = currentShelf ? (ordersByShelf.get(currentShelf.shelfNumber) || []) : []
  const order = shelfOrders[currentOrderInShelf] || null
  const totalOrdersAllShelves = shelfAssignments.reduce((sum, a) => sum + (ordersByShelf.get(a.shelfNumber)?.length || 0), 0)

  // Count shipped orders per shelf
  const shelfShippedCount = (shelfNum: number) => {
    const orders = ordersByShelf.get(shelfNum) || []
    return orders.filter(o => shippedOrders.has(o.orderNumber)).length
  }

  // Build bin layout for the ACTIVE shelf: SKU -> physical bin numbers
  const activeShelfBinMap = useMemo(() => {
    if (!currentShelf) return new Map<string, number[]>()
    const layout = (currentShelf.bulkBatch.skuLayout || []) as BulkSkuLayoutEntry[]
    const binOffset = (currentShelf.shelfNumber - 1) * 4
    const map = new Map<string, number[]>()
    for (const entry of layout) {
      const key = entry.sku.toUpperCase()
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(entry.masterUnitIndex + 1 + binOffset)
    }
    return map
  }, [currentShelf])

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
    if (inputRef.current) inputRef.current.focus()
  }, [order])

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
    if (order) onCompleteOrder(order.orderNumber)
  }

  const handleNext = () => {
    if (currentOrderInShelf < shelfOrders.length - 1) {
      // More orders in current shelf
      setCurrentOrderInShelf(prev => prev + 1)
    } else if (currentShelfIdx < shelfAssignments.length - 1) {
      // Move to next shelf
      setCurrentShelfIdx(prev => prev + 1)
      setCurrentOrderInShelf(0)
    } else {
      // All shelves done
      onCompleteCart()
    }
  }

  // Determine button label
  const isLastOrderInShelf = currentOrderInShelf >= shelfOrders.length - 1
  const isLastShelf = currentShelfIdx >= shelfAssignments.length - 1
  let nextLabel = 'Next Order →'
  if (isLastOrderInShelf && isLastShelf) nextLabel = 'Complete Cart'
  else if (isLastOrderInShelf) nextLabel = `Next Shelf (Shelf ${currentShelfIdx + 2}) →`

  if (!order || !currentShelf) return null

  return (
    <div className="flex-1 flex flex-col">
      {/* 4x3 Bin Grid with shelf labels */}
      <div className="p-4">
        <div className="space-y-1">
          {shelfAssignments.map((assignment, shelfIdx) => {
            const layout = (assignment.bulkBatch.skuLayout || []) as BulkSkuLayoutEntry[]
            const binOffset = (assignment.shelfNumber - 1) * 4
            const isActiveShelf = shelfIdx === currentShelfIdx
            const shelfDone = shelfShippedCount(assignment.shelfNumber) >= (ordersByShelf.get(assignment.shelfNumber)?.length || 0)
            const shipped = shelfShippedCount(assignment.shelfNumber)
            const total = ordersByShelf.get(assignment.shelfNumber)?.length || 0

            return (
              <div key={assignment.shelfNumber} className="flex items-center gap-2">
                <div className={`w-16 text-xs font-bold text-center py-1 rounded ${
                  shelfDone ? 'bg-green-100 text-green-700' : isActiveShelf ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  Shelf {assignment.shelfNumber}
                  <div className="text-[10px] font-normal">{shipped}/{total}</div>
          </div>
                <div className="flex-1 grid grid-cols-4 gap-1">
                  {Array.from({ length: 4 }, (_, binIdx) => {
                    const physicalBin = binIdx + 1 + binOffset
                    const layoutEntry = layout[binIdx]
                    const isEmpty = !layoutEntry

                    let bg = 'bg-white', border = 'border-gray-300', textColor = 'text-gray-600'
                    if (isEmpty) { bg = 'bg-gray-100'; border = 'border-gray-200'; textColor = 'text-gray-300' }
                    else if (shelfDone) { bg = 'bg-green-50'; border = 'border-green-400'; textColor = 'text-green-700' }
                    else if (isActiveShelf) { bg = 'bg-orange-50'; border = 'border-orange-400'; textColor = 'text-orange-700' }

                    return (
                      <div key={physicalBin} className={`p-1.5 rounded border text-center ${bg} ${border} ${textColor}`}>
                        <div className="text-[10px] text-gray-400">Bin {physicalBin}</div>
                        {layoutEntry ? (
                          <>
                            <div className="text-xs font-mono font-bold truncate">{layoutEntry.sku}</div>
                            <div className="text-[10px]">{layoutEntry.binQty}x</div>
                          </>
                        ) : (
                          <div className="text-sm">&mdash;</div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
          {/* Empty shelf rows (up to 3 total) */}
          {Array.from({ length: Math.max(0, 3 - shelfAssignments.length) }).map((_, idx) => {
            const shelfNum = shelfAssignments.length + idx + 1
            const binOffset = (shelfNum - 1) * 4
            return (
              <div key={`empty-shelf-${shelfNum}`} className="flex items-center gap-2">
                <div className="w-16 text-xs font-bold text-center py-1 rounded bg-gray-100 text-gray-400">
                  Shelf {shelfNum}
                  <div className="text-[10px] font-normal">empty</div>
                </div>
                <div className="flex-1 grid grid-cols-4 gap-1">
                  {Array.from({ length: 4 }, (_, binIdx) => (
                    <div key={binIdx + 1 + binOffset} className="p-1.5 rounded border border-gray-200 bg-gray-100 text-center text-gray-300">
                      <div className="text-[10px] text-gray-300">Bin {binIdx + 1 + binOffset}</div>
                      <div className="text-sm">&mdash;</div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Order info */}
      <div className="bg-white shadow p-4 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-orange-600 font-medium">
              Shelf {currentShelf.shelfNumber} &mdash; Order {currentOrderInShelf + 1} of {shelfOrders.length}
            </div>
            <div className="text-2xl font-bold">#{order.orderNumber}</div>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-500">{shippedOrders.size} / {totalOrdersAllShelves} total</div>
            <div className={`text-lg font-bold ${allVerified ? 'text-green-600' : 'text-amber-600'}`}>
              {allVerified ? 'Verified' : 'Scan items'}
            </div>
          </div>
        </div>
        {(() => {
          const bulkBarcode = getShipstationBarcode(order)
          return bulkBarcode ? (
            <div className="mt-3 flex justify-center">
              <Barcode value={bulkBarcode} width={1.5} height={40} fontSize={12} margin={4} />
            </div>
          ) : null
        })()}
      </div>

      {/* Scan input */}
      <div className="px-4 mb-4">
        <input
          ref={inputRef}
          type="text"
          value={scanInput}
          onChange={(e) => setScanInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleScan(scanInput)}
          placeholder="Scan item barcode..."
          className="w-full px-4 py-3 text-lg border-2 border-gray-300 rounded-xl focus:border-orange-500 focus:outline-none"
          disabled={allVerified}
        />
        {scanError && (
          <div className="mt-2 p-2 rounded-lg text-center font-medium bg-red-100 text-red-700">{scanError}</div>
        )}
      </div>

      {/* Items to verify */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
        {items.map((item, idx) => {
          const scanned = scannedCounts.get(item.sku.toUpperCase()) || 0
          const isComplete = scanned >= item.quantity
          const bins = activeShelfBinMap.get(item.sku.toUpperCase()) || []
          return (
            <div key={idx} className={`p-4 rounded-xl border-2 ${isComplete ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-white'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-mono text-lg font-bold text-gray-900">{item.sku}</div>
                  <div className="text-sm text-gray-600">{item.name}</div>
                  {bins.length > 0 && (
                    <div className="text-xs text-orange-600 mt-1">
                      Grab from Bin{bins.length > 1 ? 's' : ''} {bins.join(', ')}
                    </div>
                  )}
                </div>
                <div className={`text-3xl font-bold ${isComplete ? 'text-green-600' : 'text-gray-400'}`}>
                  {scanned}/{item.quantity}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Bottom actions */}
      <div className="p-4 bg-white shadow-lg space-y-3">
        {allVerified && !labelPrinted && (
          <button onClick={handlePrintLabel} className="w-full py-4 bg-green-600 text-white text-xl font-bold rounded-xl hover:bg-green-700">
            Print Label
          </button>
        )}
        {labelPrinted && <div className="text-center text-green-600 font-medium">Label printed</div>}
        <button
          onClick={handleNext}
          disabled={!allVerified}
          className={`w-full py-4 text-xl font-bold rounded-xl ${allVerified ? 'bg-orange-600 text-white hover:bg-orange-700' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
        >
          {labelPrinted ? nextLabel : 'Verify Items First'}
        </button>
      </div>
    </div>
  )
}
