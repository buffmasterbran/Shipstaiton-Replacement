'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useRole } from '@/context/RoleContext'
import {
  PickChunk, ChunkOrder, CartWithChunks, PrintNodeComputer,
  ShippingDetails, BoxOption, CarrierServiceOption, ShipStep, PickingMode,
} from './types'
import { getModeBadge } from './helpers'
import { StandardVerification } from './StandardVerification'
import { SinglesVerification } from './SinglesVerification'
import { BulkVerification } from './BulkVerification'

// ============================================================================
// Main Page
// ============================================================================

export default function CartScanPage() {
  const { role } = useRole()
  const isAdmin = role === 'admin'
  const [step, setStep] = useState<ShipStep>('cart-select')
  const [readyCarts, setReadyCarts] = useState<any[]>([])
  const [cart, setCart] = useState<CartWithChunks | null>(null)
  const [shipperName, setShipperName] = useState('')
  const [cartInput, setCartInput] = useState('')
  const [currentBinIndex, setCurrentBinIndex] = useState(0)
  const [shippedOrders, setShippedOrders] = useState<Set<string>>(new Set())
  const [emptyBins, setEmptyBins] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [releaseShipCart, setReleaseShipCart] = useState<any | null>(null)
  const [releasing, setReleasing] = useState(false)

  // PrintNode state
  const [pnComputers, setPnComputers] = useState<PrintNodeComputer[]>([])
  const [selectedComputerName, setSelectedComputerName] = useState<string>('')
  const [selectedPrinterId, setSelectedPrinterId] = useState<number | null>(null)
  const [selectedScaleKey, setSelectedScaleKey] = useState<string>('') // "deviceName:deviceNum"
  const [pnLoading, setPnLoading] = useState(true)

  // Shipping details panel state
  const [shippingDetails, setShippingDetails] = useState<ShippingDetails>({
    weightOz: '', weightLbs: '', boxName: '', boxId: '', lengthIn: '', widthIn: '', heightIn: '', carrier: '', service: '', carrierServiceKey: '',
  })
  const [scaleWeight, setScaleWeight] = useState<string | null>(null)
  const [scaleLoading, setScaleLoading] = useState(false)
  const [scalePolling, setScalePolling] = useState(false)
  const scalePollingRef = useRef(false) // ref so interval callback always sees latest value

  // Reference data for dropdowns
  const [allBoxes, setAllBoxes] = useState<BoxOption[]>([])
  const [allCarrierServices, setAllCarrierServices] = useState<CarrierServiceOption[]>([])

  // Derived: selected computer and its printers
  const selectedComputer = useMemo(
    () => pnComputers.find(c => c.name === selectedComputerName) || null,
    [pnComputers, selectedComputerName]
  )
  const computerDisplayName = useCallback(
    (c: PrintNodeComputer) => c.friendlyName || c.name,
    []
  )
  const selectedPrinter = useMemo(
    () => selectedComputer?.printers.find(p => p.id === selectedPrinterId) || null,
    [selectedComputer, selectedPrinterId]
  )
  const printerDisplayName = useCallback(
    (p: { name: string; friendlyName: string }) => p.friendlyName || p.name,
    []
  )
  const selectedScale = useMemo(() => {
    if (!selectedComputer || !selectedScaleKey) return null
    const [dn, dnStr] = selectedScaleKey.split(':')
    return selectedComputer.scales.find(s => s.deviceName === dn && s.deviceNum === parseInt(dnStr || '0', 10)) || null
  }, [selectedComputer, selectedScaleKey])
  const scaleDisplayName = useCallback(
    (s: { deviceName: string; friendlyName: string }) => s.friendlyName || s.deviceName,
    []
  )

  // Load saved name + saved printer/scale selections from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('shipper-name')
    if (saved) setShipperName(saved)
    const savedComputer = localStorage.getItem('selected-computer')
    if (savedComputer) setSelectedComputerName(savedComputer)
    const savedPrinter = localStorage.getItem('selected-printer-id')
    if (savedPrinter) setSelectedPrinterId(parseInt(savedPrinter, 10))
    const savedScale = localStorage.getItem('selected-scale')
    if (savedScale) setSelectedScaleKey(savedScale)
  }, [])

  // Fetch boxes and carrier services for shipping details dropdowns
  useEffect(() => {
    // Fetch boxes
    fetch('/api/box-config')
      .then(r => r.json())
      .then(data => {
        const boxes = (data.boxes || [])
          .filter((b: any) => b.active)
          .map((b: any) => ({
            id: b.id,
            name: b.name,
            lengthInches: b.lengthInches,
            widthInches: b.widthInches,
            heightInches: b.heightInches,
            weightLbs: b.weightLbs || 0,
            active: b.active,
          }))
        setAllBoxes(boxes)
      })
      .catch(() => {})

    // Fetch carrier services from rate shoppers
    fetch('/api/rate-shoppers')
      .then(r => r.json())
      .then(data => {
        const shoppers = data.rateShoppers || []
        const serviceMap = new Map<string, CarrierServiceOption>()
        for (const rs of shoppers) {
          const services = rs.services || []
          for (const svc of services) {
            const key = `${svc.carrierCode || svc.carrierId}|${svc.serviceCode}`
            if (!serviceMap.has(key)) {
              serviceMap.set(key, {
                key,
                carrier: svc.carrierName || svc.carrierCode || '',
                carrierCode: svc.carrierCode || svc.carrierId || '',
                serviceCode: svc.serviceCode || '',
                serviceName: svc.serviceName || '',
              })
            }
          }
        }
        setAllCarrierServices(Array.from(serviceMap.values()))
      })
      .catch(() => {})
  }, [])

  // Fetch available computers/printers from PrintNode
  useEffect(() => {
    setPnLoading(true)
    fetch('/api/printnode?action=computers')
      .then(r => r.json())
      .then((data) => {
        const computers: PrintNodeComputer[] = data.computers || []
        setPnComputers(computers)

        // If previously selected computer is still online, keep it; otherwise clear
        if (selectedComputerName) {
          const stillOnline = computers.find(c => c.name === selectedComputerName)
          if (!stillOnline) {
            setSelectedComputerName('')
            setSelectedPrinterId(null)
            setSelectedScaleKey('')
            localStorage.removeItem('selected-computer')
            localStorage.removeItem('selected-printer-id')
            localStorage.removeItem('selected-scale')
          } else {
            if (selectedPrinterId) {
              // Verify printer still exists on that computer
              const printerExists = stillOnline.printers.find(p => p.id === selectedPrinterId)
              if (!printerExists) {
                // Fall back to default printer
                const defaultP = stillOnline.printers.find(p => p.isDefault) || stillOnline.printers[0]
                if (defaultP) {
                  setSelectedPrinterId(defaultP.id)
                  localStorage.setItem('selected-printer-id', String(defaultP.id))
                }
              }
            }
            // Verify scale still exists on that computer
            if (selectedScaleKey) {
              const [dn, dnStr] = selectedScaleKey.split(':')
              const scaleExists = stillOnline.scales.find(s => s.deviceName === dn && s.deviceNum === parseInt(dnStr || '0', 10))
              if (!scaleExists && stillOnline.scales.length > 0) {
                const s = stillOnline.scales[0]
                const key = `${s.deviceName}:${s.deviceNum}`
                setSelectedScaleKey(key)
                localStorage.setItem('selected-scale', key)
              } else if (!scaleExists) {
                setSelectedScaleKey('')
                localStorage.removeItem('selected-scale')
              }
            }
          }
        }
      })
      .catch(() => setPnComputers([]))
      .finally(() => setPnLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Handle computer selection
  const handleSelectComputer = useCallback((computerName: string) => {
    setSelectedComputerName(computerName)
    localStorage.setItem('selected-computer', computerName)
    // Auto-select default printer for this computer
    const computer = pnComputers.find(c => c.name === computerName)
    if (computer) {
      const defaultPrinter = computer.printers.find(p => p.isDefault) || computer.printers[0]
      if (defaultPrinter) {
        setSelectedPrinterId(defaultPrinter.id)
        localStorage.setItem('selected-printer-id', String(defaultPrinter.id))
      } else {
        setSelectedPrinterId(null)
        localStorage.removeItem('selected-printer-id')
      }
      // Auto-select scale if computer has one
      if (computer.scales.length > 0) {
        const s = computer.scales[0]
        const key = `${s.deviceName}:${s.deviceNum}`
        setSelectedScaleKey(key)
        localStorage.setItem('selected-scale', key)
      } else {
        setSelectedScaleKey('')
        localStorage.removeItem('selected-scale')
      }
    }
  }, [pnComputers])

  // Handle printer selection within a computer
  const handleSelectPrinter = useCallback((printerId: number) => {
    setSelectedPrinterId(printerId)
    localStorage.setItem('selected-printer-id', String(printerId))
  }, [])

  // Handle scale selection
  const handleSelectScale = useCallback((scaleKey: string) => {
    setSelectedScaleKey(scaleKey)
    if (scaleKey) {
      localStorage.setItem('selected-scale', scaleKey)
    } else {
      localStorage.removeItem('selected-scale')
    }
  }, [])

  // Toggle live scale polling ON/OFF
  const toggleScalePolling = useCallback(() => {
    setScalePolling(prev => {
      const next = !prev
      scalePollingRef.current = next
      if (!next) setScaleLoading(false)
      return next
    })
  }, [])

  // Stop polling when scale or computer changes, or when leaving shipping step
  useEffect(() => {
    setScalePolling(false)
    scalePollingRef.current = false
  }, [selectedScaleKey, step])

  // Live scale polling interval (500ms)
  useEffect(() => {
    if (!scalePolling || !selectedComputer || !selectedScaleKey) return

    const [deviceName, deviceNumStr] = selectedScaleKey.split(':')
    const deviceNum = parseInt(deviceNumStr || '0', 10)
    const computerId = selectedComputer.id

    let cancelled = false

    const poll = async () => {
      if (cancelled || !scalePollingRef.current) return
      try {
        setScaleLoading(true)
        const res = await fetch('/api/printnode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'get-weight', computerId, deviceName, deviceNum }),
        })
        if (cancelled || !scalePollingRef.current) return
        const data = await res.json()
        if (data.success) {
          setScaleWeight(data.weight)
          if (data.massOz !== null && data.massOz !== undefined) {
            const totalOz = data.massOz
            const wholeLbs = Math.floor(totalOz / 16)
            const remainOz = totalOz - wholeLbs * 16
            setShippingDetails(prev => ({
              ...prev,
              weightLbs: String(wholeLbs),
              weightOz: remainOz.toFixed(1),
            }))
          }
        } else {
          setScaleWeight('Error: ' + (data.error || 'No reading'))
        }
      } catch {
        if (!cancelled && scalePollingRef.current) {
          setScaleWeight('Error: Connection failed')
        }
      } finally {
        if (!cancelled) setScaleLoading(false)
      }
    }

    // Immediately poll once, then every 500ms
    poll()
    const interval = setInterval(poll, 500)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [scalePolling, selectedComputer, selectedScaleKey])

  // Fetch ready carts (and SHIPPING carts for admins)
  useEffect(() => {
    if (step === 'cart-select') {
      const params = isAdmin ? '&includeActive=true' : ''
      fetch(`/api/ship?action=ready-carts${params}`)
        .then(res => res.json())
        .then(data => setReadyCarts(data.carts || []))
        .catch(() => {})
    }
  }, [step, isAdmin])

  // Determine cart's picking mode
  const pickingMode: PickingMode = useMemo(() => {
    if (!cart) return 'UNKNOWN'
    const chunk = cart.chunks[0]
    if (!chunk) return 'UNKNOWN'
    const type = chunk.batch?.type || chunk.pickingMode
    if (type === 'SINGLES') return 'SINGLES'
    if (type === 'BULK') return 'BULK'
    if (type === 'ORDER_BY_SIZE') return 'ORDER_BY_SIZE'
    return 'UNKNOWN'
  }, [cart])

  const isPersonalized = cart?.chunks[0]?.batch?.isPersonalized || cart?.chunks[0]?.isPersonalized || false

  // For Bulk: extract shelf assignments sorted by shelfNumber
  const bulkShelfAssignments = useMemo(() => {
    if (!cart || pickingMode !== 'BULK') return []
    const chunk = cart.chunks[0]
    if (!chunk?.bulkBatchAssignments?.length) {
      return []
    }
    const sorted = [...chunk.bulkBatchAssignments].sort((a, b) => a.shelfNumber - b.shelfNumber)
    return sorted
  }, [cart, pickingMode])

  // Get all orders sorted by bin (include SHIPPED for resume flow — they show as completed)
  const allOrders = useMemo(() => {
    return cart?.chunks.flatMap(chunk =>
      chunk.orders.filter(o => o.status === 'AWAITING_SHIPMENT' || o.status === 'SHIPPED')
    ).sort((a, b) => (a.binNumber || 0) - (b.binNumber || 0)) || []
  }, [cart])

  // For Bulk: group orders by shelf using sequential binNumber ordering
  const bulkOrdersByShelf = useMemo(() => {
    if (bulkShelfAssignments.length === 0) return new Map<number, ChunkOrder[]>()
    const map = new Map<number, ChunkOrder[]>()
    // Orders have sequential binNumbers per shelf (shelf 1 first, then 2, then 3)
    // Use the assignment order counts to split
    let offset = 0
    for (const a of bulkShelfAssignments) {
      const shelfOrders = allOrders.slice(offset, offset + a.bulkBatch.orderCount)
      map.set(a.shelfNumber, shelfOrders)
      offset += a.bulkBatch.orderCount
    }
    return map
  }, [bulkShelfAssignments, allOrders])

  // For singles: group orders by bin
  const ordersByBin = useMemo(() => {
    const map = new Map<number, ChunkOrder[]>()
    allOrders.forEach(o => {
      const bin = o.binNumber || 0
      if (!map.has(bin)) map.set(bin, [])
      map.get(bin)!.push(o)
    })
    return map
  }, [allOrders])

  // Bin numbers in order
  const binNumbers = useMemo(() => {
    return Array.from(ordersByBin.keys()).sort((a, b) => a - b)
  }, [ordersByBin])

  const currentBin = binNumbers[currentBinIndex] || 0
  const currentChunk = cart?.chunks[0]

  // Current order for shipping details panel (non-bulk: first order in current bin)
  const currentOrder = useMemo(() => {
    if (!cart || pickingMode === 'BULK') return null
    const binOrders = ordersByBin.get(currentBin) || []
    return binOrders[0] || null
  }, [cart, pickingMode, ordersByBin, currentBin])

  // Populate shipping details when current order changes
  useEffect(() => {
    if (!currentOrder) {
      setShippingDetails({ weightOz: '', weightLbs: '', boxName: '', boxId: '', lengthIn: '', widthIn: '', heightIn: '', carrier: '', service: '', carrierServiceKey: '' })
      setScaleWeight(null)
      return
    }

    const raw = Array.isArray(currentOrder.rawPayload) ? currentOrder.rawPayload[0] : currentOrder.rawPayload
    const rate = raw?.preShoppedRate || (currentOrder as any).preShoppedRate
    const weight = (currentOrder as any).shippedWeight
    const box = (currentOrder as any).suggestedBox

    const decimalLbs = weight ? parseFloat(weight) : 0
    const totalOz = decimalLbs * 16
    const wholeLbs = Math.floor(totalOz / 16)
    const remainOz = totalOz - wholeLbs * 16

    // Try to match the suggested box to one in our boxes list
    const matchedBox = box?.boxId ? allBoxes.find(b => b.id === box.boxId) :
      box?.boxName ? allBoxes.find(b => b.name === box.boxName) : null

    // Try to match the pre-shopped rate to a carrier service option
    const carrierCode = rate?.carrierCode || ''
    const serviceCode = rate?.serviceCode || ''
    const matchedCarrierKey = carrierCode && serviceCode ? `${carrierCode}|${serviceCode}` : ''

    setShippingDetails({
      weightLbs: decimalLbs ? String(wholeLbs) : '',
      weightOz: decimalLbs ? remainOz.toFixed(1) : '',
      boxName: box?.boxName || matchedBox?.name || '',
      boxId: matchedBox?.id || '',
      lengthIn: box?.lengthInches ? String(box.lengthInches) : matchedBox ? String(matchedBox.lengthInches) : '',
      widthIn: box?.widthInches ? String(box.widthInches) : matchedBox ? String(matchedBox.widthInches) : '',
      heightIn: box?.heightInches ? String(box.heightInches) : matchedBox ? String(matchedBox.heightInches) : '',
      carrier: rate?.carrier || rate?.carrierCode || '',
      service: rate?.serviceName || rate?.serviceCode || '',
      carrierServiceKey: matchedCarrierKey,
    })
    setScaleWeight(null)
  }, [currentOrder, allBoxes])

  // Whether station is selected (has computers available AND one is chosen with a printer)
  const hasStation = !!(selectedComputerName && selectedPrinterId)

  const handleSelectCart = async (cartId?: string) => {
    if (!shipperName.trim()) { setError('Please enter your name'); return }
    if (pnComputers.length > 0 && !hasStation) { setError('Please select your station (computer) and printer'); return }
    const searchId = cartId || cartInput.trim()
    if (!searchId) { setError('Please enter or select a cart'); return }

    localStorage.setItem('shipper-name', shipperName.trim())
    setLoading(true)
    setError(null)

    try {
      const cartRes = await fetch(`/api/ship?cartId=${searchId}`)
      if (!cartRes.ok) throw new Error((await cartRes.json()).error || 'Cart not found')
        const cartData = await cartRes.json()

      await fetch('/api/ship', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start-shipping', cartId: cartData.cart.id, shipperName: shipperName.trim() }),
      })

      setCart(cartData.cart)
      setCurrentBinIndex(0)
      setShippedOrders(new Set())
      
      // Identify empty bins (always 12 bins for all modes)
      const usedBins = new Set(cartData.cart.chunks.flatMap((c: PickChunk) => c.orders.map(o => o.binNumber)))
      const empty = new Set<number>()
      for (let i = 1; i <= 12; i++) { if (!usedBins.has(i)) empty.add(i) }
      setEmptyBins(empty)
      
      setStep('shipping')
    } catch (err: any) {
      setError(err.message || 'Failed to load cart')
    } finally {
      setLoading(false)
    }
  }

  // Mark all orders in current bin as shipped
  const handleBinComplete = useCallback(async () => {
    if (!currentChunk) return
    const binOrders = ordersByBin.get(currentBin) || []
    for (const order of binOrders) {
    try {
      await fetch('/api/ship', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'complete-order', chunkId: currentChunk.id, orderNumber: order.orderNumber }),
        })
        setShippedOrders(prev => new Set([...Array.from(prev), order.orderNumber]))
      } catch {}
    }
  }, [currentBin, currentChunk, ordersByBin])

  // Single order complete (for standard/bulk modes)
  const handleOrderComplete = useCallback(async () => {
    if (!currentChunk) return
    const binOrders = ordersByBin.get(currentBin) || []
    const order = binOrders[0]
    if (!order) return

    try {
      await fetch('/api/ship', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete-order', chunkId: currentChunk.id, orderNumber: order.orderNumber }),
      })
      setShippedOrders(prev => new Set([...Array.from(prev), order.orderNumber]))
    } catch {}
  }, [currentBin, currentChunk, ordersByBin])

  const handleNextBin = useCallback(async () => {
    if (currentBinIndex >= binNumbers.length - 1) {
      // Cart complete
      if (cart && currentChunk) {
        await fetch('/api/ship', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'complete-cart', cartId: cart.id, chunkId: currentChunk.id }),
        })
      }
      setStep('complete')
    } else {
      setCurrentBinIndex(prev => prev + 1)
    }
  }, [currentBinIndex, binNumbers.length, cart, currentChunk])

  const handleReset = () => {
    setCart(null)
    setCartInput('')
    setCurrentBinIndex(0)
    setShippedOrders(new Set())
    setEmptyBins(new Set())
    setStep('cart-select')
  }

  // Resume a SHIPPING cart — load it and pre-populate shipped orders from DB
  const handleResumeCart = async (cartId: string) => {
    if (!shipperName.trim()) { setError('Please enter your name'); return }
    if (pnComputers.length > 0 && !hasStation) { setError('Please select your station (computer) and printer'); return }
    localStorage.setItem('shipper-name', shipperName.trim())
    setLoading(true)
    setError(null)

    try {
      const cartRes = await fetch(`/api/ship?cartId=${cartId}`)
      if (!cartRes.ok) throw new Error((await cartRes.json()).error || 'Cart not found')
      const cartData = await cartRes.json()

      // Don't call start-shipping again — cart is already in SHIPPING status
      setCart(cartData.cart)
      setCurrentBinIndex(0)

      // Pre-populate shipped orders from the database
      const alreadyShipped = new Set<string>()
      for (const chunk of cartData.cart.chunks) {
        for (const order of chunk.orders) {
          if (order.status === 'SHIPPED') {
            alreadyShipped.add(order.orderNumber)
          }
        }
      }
      setShippedOrders(alreadyShipped)

      // Identify empty bins
      const usedBins = new Set(cartData.cart.chunks.flatMap((c: PickChunk) => c.orders.map((o: ChunkOrder) => o.binNumber)))
      const empty = new Set<number>()
      for (let i = 1; i <= 12; i++) { if (!usedBins.has(i)) empty.add(i) }
      setEmptyBins(empty)

      setStep('shipping')
    } catch (err: any) {
      setError(err.message || 'Failed to resume cart')
    } finally {
      setLoading(false)
    }
  }

  // Release a stuck SHIPPING cart — keep shipped orders, return rest to queue
  const handleReleaseShippingCart = async () => {
    if (!releaseShipCart) return
    setReleasing(true)
    try {
      const res = await fetch('/api/ship', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'release-shipping-cart', cartId: releaseShipCart.id, reason: 'admin_release' }),
      })
      if (!res.ok) throw new Error('Failed to release cart')
      setReleaseShipCart(null)
      // Re-fetch carts
      const params = isAdmin ? '&includeActive=true' : ''
      const cartsRes = await fetch(`/api/ship?action=ready-carts${params}`)
      const cartsData = await cartsRes.json()
      setReadyCarts(cartsData.carts || [])
    } catch {
      alert('Failed to release cart. Try again.')
    } finally {
      setReleasing(false)
    }
  }

  // ============================================
  // RENDER: Cart Select
  // ============================================
  if (step === 'cart-select') {
    return (
      <div className="min-h-screen bg-gray-100 p-4">
        <div className="max-w-lg mx-auto">
          <h1 className="text-3xl font-bold text-gray-900 mb-6 text-center">Ship Station</h1>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Your Name</label>
            <input
              type="text"
              value={shipperName}
              onChange={(e) => setShipperName(e.target.value)}
              placeholder="Enter your name"
              className="w-full px-4 py-3 text-lg border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* Computer / Printer Selection */}
          {!pnLoading && pnComputers.length > 0 && (
            <div className="mb-6 bg-white rounded-xl shadow p-4 border border-gray-200">
            <label className="block text-sm font-medium text-gray-700 mb-2">
                Your Station (Computer)
            </label>
              <select
                value={selectedComputerName}
                onChange={(e) => handleSelectComputer(e.target.value)}
                className="w-full px-4 py-3 text-lg border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none bg-white"
              >
                <option value="">Select your computer...</option>
                {pnComputers.map(c => (
                  <option key={c.name} value={c.name}>
                    {computerDisplayName(c)}
                    {c.state === 'connected' ? ' ● Online' : ' ○ Offline'}
                  </option>
                ))}
              </select>

              {/* Printer dropdown (shows when computer is selected) */}
              {selectedComputer && selectedComputer.printers.length > 0 && (
                <div className="mt-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Printer</label>
                  <div className="flex items-center gap-2">
                    <select
                      value={selectedPrinterId || ''}
                      onChange={(e) => handleSelectPrinter(parseInt(e.target.value, 10))}
                      className="flex-1 px-3 py-2 border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none bg-white text-sm"
                    >
                      {selectedComputer.printers.map(p => (
                        <option key={p.id} value={p.id}>
                          {printerDisplayName(p)}{p.isDefault ? ' (default)' : ''}
                        </option>
                      ))}
                    </select>
                    {selectedPrinter && (
                      <div className="flex items-center gap-1.5 text-xs shrink-0">
                        <div className="w-2 h-2 rounded-full bg-green-500" />
                        <span className="text-green-700 font-medium">Ready</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Scale dropdown (shows when computer is selected and has scales) */}
              {selectedComputer && selectedComputer.scales.length > 0 && (
                <div className="mt-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Scale</label>
                  <div className="flex items-center gap-2">
                    <select
                      value={selectedScaleKey}
                      onChange={(e) => handleSelectScale(e.target.value)}
                      className="flex-1 px-3 py-2 border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none bg-white text-sm"
                    >
                      <option value="">No scale</option>
                      {selectedComputer.scales.map(s => {
                        const key = `${s.deviceName}:${s.deviceNum}`
                        return (
                          <option key={key} value={key}>
                            {scaleDisplayName(s)}
                          </option>
                        )
                      })}
                    </select>
                    {selectedScale && (
                      <div className="flex items-center gap-1.5 text-xs shrink-0">
                        <svg className="w-3.5 h-3.5 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0 0 12 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52 2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 0 1-2.031.352 5.988 5.988 0 0 1-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.971Zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0 2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 0 1-2.031.352 5.988 5.988 0 0 1-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.971Z" /></svg>
                        <span className="text-green-700 font-medium">Connected</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {selectedComputer && selectedComputer.printers.length === 0 && (
                <div className="mt-3 text-sm text-amber-600 bg-amber-50 p-2 rounded-lg">
                  No enabled printers on this computer. Enable printers in Settings &gt; Printers.
                </div>
              )}
            </div>
          )}

          {!pnLoading && pnComputers.length === 0 && (
            <div className="mb-6 bg-amber-50 text-amber-700 p-3 rounded-xl text-sm text-center">
              No PrintNode computers online. Labels will open as PDF downloads.
            </div>
          )}

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Scan or Enter Cart</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={cartInput}
                onChange={(e) => setCartInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSelectCart()}
                placeholder="Scan cart barcode..."
                className="flex-1 px-4 py-3 text-lg border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none"
              />
              <button
                onClick={() => handleSelectCart()}
                disabled={loading || (pnComputers.length > 0 && !hasStation)}
                className="px-6 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50"
              >
                Go
              </button>
            </div>
          </div>

          {error && <div className="mb-4 bg-red-50 text-red-600 p-3 rounded-lg text-center">{error}</div>}

          {readyCarts.filter(c => c.status === 'PICKED_READY').length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Or Select Ready Cart</label>
              <div className="grid gap-3">
                {readyCarts.filter(c => c.status === 'PICKED_READY').map((c: any) => (
                  <button
                    key={c.id}
                    onClick={() => handleSelectCart(c.id)}
                    disabled={loading || (pnComputers.length > 0 && !hasStation)}
                    className="p-4 bg-white rounded-xl shadow text-left hover:bg-blue-50 border-2 border-transparent hover:border-blue-500 disabled:opacity-50"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full" style={{ backgroundColor: c.color || '#9ca3af' }} />
                      <div className="flex-1">
                        <div className="font-bold text-lg">{c.name}</div>
                        <div className="text-sm text-gray-600">{c.orderCount} orders</div>
                        </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {readyCarts.filter(c => c.status === 'PICKED_READY').length === 0 && readyCarts.filter(c => c.status === 'SHIPPING').length === 0 && (
            <div className="bg-amber-50 text-amber-700 p-4 rounded-lg text-center">
              <p className="font-medium">No carts ready for shipping</p>
              <p className="text-sm mt-1">Wait for pickers to complete carts</p>
            </div>
          )}

          {/* SHIPPING carts — admin only */}
          {isAdmin && readyCarts.filter(c => c.status === 'SHIPPING').length > 0 && (
            <div className="mt-6">
              <label className="block text-sm font-medium text-red-600 mb-2 uppercase tracking-wide">Active Shipping Carts (Admin)</label>
              <div className="grid gap-3">
                {readyCarts.filter(c => c.status === 'SHIPPING').map((c: any) => {
                  const info = c.shippingInfo
                  const minutesAgo = info?.shippingStartedAt
                    ? Math.floor((Date.now() - new Date(info.shippingStartedAt).getTime()) / 60000)
                    : null
                  return (
                    <div
                      key={c.id}
                      className="p-4 bg-red-50 rounded-xl shadow border-2 border-red-300"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full opacity-60" style={{ backgroundColor: c.color || '#9ca3af' }} />
                        <div className="flex-1">
                          <div className="font-bold text-lg text-gray-900">{c.name}</div>
                          <div className="text-sm text-gray-500">
                            {info?.shipperName || 'Unknown'}
                            {minutesAgo !== null ? ` · ${minutesAgo} min ago` : ''}
                          </div>
                          <div className="text-sm text-gray-600">
                            {info?.ordersShipped || 0} of {info?.ordersTotal || 0} orders shipped
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => handleResumeCart(c.id)}
                          disabled={loading || !shipperName.trim() || (pnComputers.length > 0 && !hasStation)}
                          className="flex-1 py-2 text-sm font-bold text-blue-600 bg-white border-2 border-blue-300 rounded-lg hover:bg-blue-50 transition-colors disabled:opacity-50"
                        >
                          Resume Shipping
                        </button>
                        <button
                          onClick={() => setReleaseShipCart(c)}
                          disabled={loading}
                          className="flex-1 py-2 text-sm font-bold text-red-600 bg-white border-2 border-red-300 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                        >
                          Release Cart
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Release shipping cart confirmation dialog */}
          {releaseShipCart && (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-8">
              <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-4">Release Shipping Cart?</h2>
                <div className="bg-red-50 rounded-xl p-4 mb-4">
                  <p className="text-lg text-gray-800">
                    <span className="font-bold">{releaseShipCart.name}</span> is being shipped by{' '}
                    <span className="font-bold">{releaseShipCart.shippingInfo?.shipperName || 'Unknown'}</span>
                  </p>
                  {releaseShipCart.shippingInfo && (
                    <p className="text-sm text-gray-500 mt-1">
                      {releaseShipCart.shippingInfo.ordersShipped} of {releaseShipCart.shippingInfo.ordersTotal} orders already shipped
                    </p>
                  )}
                </div>
                <p className="text-lg text-gray-600 mb-2">This will:</p>
                <ul className="text-gray-600 mb-4 space-y-1 ml-4">
                  <li>• Keep {releaseShipCart.shippingInfo?.ordersShipped || 0} already-shipped orders (labels exist)</li>
                  <li>• Return {(releaseShipCart.shippingInfo?.ordersTotal || 0) - (releaseShipCart.shippingInfo?.ordersShipped || 0)} unshipped orders back to the queue</li>
                  <li>• Make the cart available again</li>
                </ul>
                <p className="text-lg text-amber-600 font-medium mb-6">Make sure the physical cart is empty before releasing.</p>
                <div className="flex gap-4">
                  <button
                    onClick={() => setReleaseShipCart(null)}
                    disabled={releasing}
                    className="flex-1 py-3 bg-gray-100 text-gray-700 text-lg font-bold rounded-2xl hover:bg-gray-200 transition-colors"
                  >
                    Go Back
                  </button>
                  <button
                    onClick={handleReleaseShippingCart}
                    disabled={releasing}
                    className="flex-1 py-3 bg-red-600 text-white text-lg font-bold rounded-2xl hover:bg-red-700 transition-colors disabled:opacity-50"
                  >
                    {releasing ? 'Releasing...' : 'Release Cart'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ============================================
  // RENDER: Shipping
  // ============================================
  if (step === 'shipping' && cart) {
    const badge = getModeBadge(pickingMode, isPersonalized)
    const binOrders = ordersByBin.get(currentBin) || []
    const isEmptyBin = emptyBins.has(currentBin)
    const isBulkMode = pickingMode === 'BULK'

    return (
      <div className="h-screen bg-gray-100 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-white shadow px-4 py-2 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="font-bold text-lg">{cart.name}</div>
              <span className={`px-2 py-1 rounded text-xs font-bold ${badge.bg}`}>{badge.label}</span>
              </div>
            <div className="flex items-center gap-3">
              {/* Computer dropdown */}
              {pnComputers.length > 0 && (
                <select
                  value={selectedComputerName}
                  onChange={(e) => handleSelectComputer(e.target.value)}
                  className="text-xs px-2 py-1 border border-gray-300 rounded-lg bg-white focus:border-blue-500 focus:outline-none max-w-[140px]"
                >
                  <option value="">No computer</option>
                  {pnComputers.map(c => (
                    <option key={c.name} value={c.name}>{computerDisplayName(c)}</option>
                  ))}
                </select>
              )}
              {/* Printer dropdown */}
              {selectedComputer && selectedComputer.printers.length > 0 ? (
                <select
                  value={selectedPrinterId || ''}
                  onChange={(e) => handleSelectPrinter(parseInt(e.target.value, 10))}
                  className={`text-xs px-2 py-1 border rounded-lg focus:outline-none max-w-[160px] ${
                    selectedPrinterId
                      ? 'bg-green-50 border-green-300 text-green-700 focus:border-green-500'
                      : 'bg-amber-50 border-amber-300 text-amber-700 focus:border-amber-500'
                  }`}
                >
                  {selectedComputer.printers.map(p => (
                    <option key={p.id} value={p.id}>
                      {printerDisplayName(p)}{p.isDefault ? ' (default)' : ''}
                    </option>
                  ))}
                </select>
              ) : pnComputers.length > 0 ? (
                <div className="flex items-center text-xs bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg">
                  <span className="text-amber-700">No printer</span>
                </div>
              ) : null}
              {/* Scale dropdown */}
              {selectedComputer && selectedComputer.scales.length > 0 && (
                <select
                  value={selectedScaleKey}
                  onChange={(e) => handleSelectScale(e.target.value)}
                  className={`text-xs px-2 py-1 border rounded-lg focus:outline-none max-w-[160px] ${
                    selectedScaleKey
                      ? 'bg-blue-50 border-blue-300 text-blue-700 focus:border-blue-500'
                      : 'bg-gray-50 border-gray-300 text-gray-500 focus:border-gray-400'
                  }`}
                >
                  <option value="">No scale</option>
                  {selectedComputer.scales.map(s => {
                    const key = `${s.deviceName}:${s.deviceNum}`
                    return (
                      <option key={key} value={key}>{scaleDisplayName(s)}</option>
                    )
                  })}
                </select>
              )}
            <div className="text-right">
                {!isBulkMode && (
                  <div className="text-sm text-gray-600">Bin {currentBinIndex + 1} / {binNumbers.length}</div>
                )}
                <div className="text-sm text-gray-500">{shipperName}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Shipping Details Panel (non-bulk only) */}
        {!isBulkMode && currentOrder && !isEmptyBin && (
          <div className="bg-white border-t border-gray-200 px-4 py-2 shrink-0">
            <div className="flex items-center gap-6 text-sm">
              {/* Weight (lb + remaining oz) */}
              <div className="flex items-center gap-2">
                <span className="text-gray-500 font-medium">Weight:</span>
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={shippingDetails.weightLbs}
                    onChange={(e) => setShippingDetails(prev => ({ ...prev, weightLbs: e.target.value }))}
                    className="w-12 px-1.5 py-1 border border-gray-300 rounded text-center text-sm focus:border-blue-500 focus:outline-none"
                    placeholder="0"
                  />
                  <span className="text-gray-400 text-xs">lb</span>
                </div>
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={shippingDetails.weightOz}
                    onChange={(e) => setShippingDetails(prev => ({ ...prev, weightOz: e.target.value }))}
                    className="w-14 px-1.5 py-1 border border-gray-300 rounded text-center text-sm focus:border-blue-500 focus:outline-none"
                    placeholder="0.0"
                  />
                  <span className="text-gray-400 text-xs">oz</span>
                </div>
                {/* Scale live polling toggle */}
                {selectedScale && (
                  <button
                    onClick={toggleScalePolling}
                    className={`ml-1 flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors ${
                      scalePolling
                        ? 'bg-green-100 text-green-700 border border-green-300 hover:bg-green-200'
                        : 'bg-gray-100 text-gray-600 border border-gray-300 hover:bg-gray-200'
                    }`}
                    title={scalePolling ? 'Stop live weighing' : `Start live weighing on ${scaleDisplayName(selectedScale)}`}
                  >
                    {scalePolling && (
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                      </span>
                    )}
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0 0 12 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52 2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 0 1-2.031.352 5.988 5.988 0 0 1-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.971Zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0 2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 0 1-2.031.352 5.988 5.988 0 0 1-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.971Z" /></svg>
                    {scalePolling ? 'LIVE' : 'Scale'}
                  </button>
                )}
                {scaleWeight && !scaleWeight.startsWith('Error') && (
                  <span className={`text-xs font-medium ${scalePolling ? 'text-green-600' : 'text-gray-600'}`}>
                    {shippingDetails.weightLbs}lb {shippingDetails.weightOz}oz
                  </span>
                )}
                {scaleWeight && scaleWeight.startsWith('Error') && (
                  <span className="text-xs text-red-500">{scaleWeight}</span>
                )}
              </div>

              {/* Divider */}
              <div className="w-px h-6 bg-gray-200" />

              {/* Box / Dims */}
              <div className="flex items-center gap-2">
                <span className="text-gray-500 font-medium">Box:</span>
                <select
                  value={shippingDetails.boxId}
                  onChange={(e) => {
                    const boxId = e.target.value
                    if (boxId === '__custom__') {
                      setShippingDetails(prev => ({ ...prev, boxId: '', boxName: 'Custom', lengthIn: '', widthIn: '', heightIn: '' }))
                      return
                    }
                    const box = allBoxes.find(b => b.id === boxId)
                    if (box) {
                      setShippingDetails(prev => ({
                        ...prev,
                        boxId: box.id,
                        boxName: box.name,
                        lengthIn: String(box.lengthInches),
                        widthIn: String(box.widthInches),
                        heightIn: String(box.heightInches),
                      }))
                    } else {
                      setShippingDetails(prev => ({ ...prev, boxId: '', boxName: '' }))
                    }
                  }}
                  className="text-xs px-1.5 py-1 border border-gray-300 rounded bg-white focus:border-blue-500 focus:outline-none max-w-[140px]"
                >
                  <option value="">Select box...</option>
                  {allBoxes.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                  <option value="__custom__">Custom</option>
                </select>
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={shippingDetails.lengthIn}
                    onChange={(e) => setShippingDetails(prev => ({ ...prev, lengthIn: e.target.value, boxId: '', boxName: 'Custom' }))}
                    className="w-10 px-1 py-1 border border-gray-300 rounded text-center text-xs focus:border-blue-500 focus:outline-none"
                    placeholder="L"
                  />
                  <span className="text-gray-400 text-xs">x</span>
                  <input
                    type="text"
                    value={shippingDetails.widthIn}
                    onChange={(e) => setShippingDetails(prev => ({ ...prev, widthIn: e.target.value, boxId: '', boxName: 'Custom' }))}
                    className="w-10 px-1 py-1 border border-gray-300 rounded text-center text-xs focus:border-blue-500 focus:outline-none"
                    placeholder="W"
                  />
                  <span className="text-gray-400 text-xs">x</span>
                  <input
                    type="text"
                    value={shippingDetails.heightIn}
                    onChange={(e) => setShippingDetails(prev => ({ ...prev, heightIn: e.target.value, boxId: '', boxName: 'Custom' }))}
                    className="w-10 px-1 py-1 border border-gray-300 rounded text-center text-xs focus:border-blue-500 focus:outline-none"
                    placeholder="H"
                  />
                  <span className="text-gray-400 text-xs">in</span>
                </div>
              </div>

              {/* Divider */}
              <div className="w-px h-6 bg-gray-200" />

              {/* Carrier / Service */}
              <div className="flex items-center gap-2">
                <span className="text-gray-500 font-medium">Carrier:</span>
                <select
                  value={shippingDetails.carrierServiceKey}
                  onChange={(e) => {
                    const key = e.target.value
                    const svc = allCarrierServices.find(s => s.key === key)
                    if (svc) {
                      setShippingDetails(prev => ({
                        ...prev,
                        carrierServiceKey: key,
                        carrier: svc.carrier,
                        service: svc.serviceName,
                      }))
                    } else {
                      setShippingDetails(prev => ({ ...prev, carrierServiceKey: '', carrier: '', service: '' }))
                    }
                  }}
                  className="text-xs px-1.5 py-1 border border-gray-300 rounded bg-white focus:border-blue-500 focus:outline-none max-w-[220px]"
                >
                  <option value="">Select carrier...</option>
                  {allCarrierServices.map(svc => (
                    <option key={svc.key} value={svc.key}>
                      {svc.carrier} / {svc.serviceName}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Main content: Grid left, Verification right (for non-Bulk) */}
        {isBulkMode ? (
          <BulkVerification
            shelfAssignments={bulkShelfAssignments}
            ordersByShelf={bulkOrdersByShelf}
            shippedOrders={shippedOrders}
            onCompleteOrder={(orderNumber) => {
              const chunk = currentChunk
              if (!chunk) return
              fetch('/api/ship', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'complete-order', chunkId: chunk.id, orderNumber }),
              }).then(() => {
                setShippedOrders(prev => new Set([...Array.from(prev), orderNumber]))
              }).catch(() => {})
            }}
            onCompleteCart={async () => {
              if (cart && currentChunk) {
                await fetch('/api/ship', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'complete-cart', cartId: cart.id, chunkId: currentChunk.id }),
                })
              }
              setStep('complete')
            }}
          />
        ) : (
          <div className="flex-1 flex flex-col lg:flex-row">
            {/* Left: Bin grid */}
            <div className="flex-1 p-3">
              <div className="grid gap-2 bg-white rounded-lg p-3 shadow h-full" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((bin) => {
                  const binShipped = (ordersByBin.get(bin) || []).every(o => shippedOrders.has(o.orderNumber))
                  const isCurrent = bin === currentBin
                  const isEmpty = emptyBins.has(bin) || !ordersByBin.has(bin)

                  let bg = 'bg-gray-50', border = 'border-gray-300', text = 'text-gray-600'
                  if (isEmpty) { bg = 'bg-gray-200'; border = 'border-gray-400'; text = 'text-gray-400' }
                  else if (binShipped) { bg = 'bg-green-100'; border = 'border-green-500'; text = 'text-green-700' }
                  else if (isCurrent) { bg = 'bg-blue-100'; border = 'border-blue-500'; text = 'text-blue-700' }
              
              return (
                    <div key={bin} className={`flex items-center justify-center rounded-xl border-2 font-bold text-2xl ${bg} ${border} ${text}`}>
                      {isEmpty ? '—' : binShipped ? '✓' : bin}
                </div>
              )
            })}
          </div>
        </div>

            {/* Right: Verification content */}
            <div className="lg:w-96 xl:w-[420px] shrink-0 flex flex-col min-w-0 overflow-y-auto">
              {pickingMode === 'SINGLES' ? (
                <SinglesVerification
                  binOrders={isEmptyBin ? [] : binOrders}
                  binNumber={currentBin}
                  onComplete={handleBinComplete}
                  onNext={handleNextBin}
                />
              ) : (
                <StandardVerification
                  order={isEmptyBin ? null : binOrders[0] || null}
                  binNumber={currentBin}
          isEmpty={isEmptyBin}
          onComplete={handleOrderComplete}
                  onNext={handleNextBin}
        />
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ============================================
  // RENDER: Complete
  // ============================================
  if (step === 'complete') {
    return (
      <div className="min-h-screen bg-gray-100 p-4 flex items-center justify-center">
        <div className="max-w-lg mx-auto text-center">
          <div className="text-6xl mb-6">&#10003;</div>
          <h1 className="text-3xl font-bold text-green-600 mb-4">Cart Complete!</h1>
          <p className="text-gray-600 mb-2">{shippedOrders.size} orders shipped from {cart?.name}</p>
          <button onClick={handleReset} className="w-full py-4 bg-blue-600 text-white text-xl font-bold rounded-xl hover:bg-blue-700 mt-8">
            Ship Another Cart
          </button>
        </div>
      </div>
    )
  }

  return null
}
