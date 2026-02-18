'use client'

import { Fragment, useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { XMarkIcon, CodeBracketIcon } from '@heroicons/react/24/outline'
import { useReferenceData } from '@/hooks/useReferenceData'
import RateBrowserDialog from './RateBrowserDialog'

interface OrderItem {
  sku?: string
  name?: string
  color?: string
  quantity?: number
  unitPrice?: number
  weight?: { value?: number; units?: string }
}

interface Order {
  orderNumber?: string
  orderKey?: string
  orderDate?: string
  orderStatus?: string
  customerName?: string
  shipTo?: {
    name?: string; company?: string; street1?: string; street2?: string
    city?: string; state?: string; postalCode?: string; country?: string
    phone?: string; residential?: boolean
  }
  items?: OrderItem[]
  amountPaid?: number
  taxAmount?: number
  shippingAmount?: number
  weight?: { value?: number; units?: string }
  dimensions?: { length?: number; width?: number; height?: number; units?: string }
  requestedShippingService?: string
  paymentMethod?: string
  advancedOptions?: { customField1?: string }
  shipFrom?: { locationId?: string }
}

interface PrintNodeComputer {
  id: number; name: string; friendlyName: string; state: string
  printers: { id: number; name: string; friendlyName: string; isDefault: boolean }[]
  scales: { deviceName: string; deviceNum: number; friendlyName: string }[]
}

interface OrderDialogProps {
  isOpen: boolean
  onClose: () => void
  order: Order | null
  rawPayload?: any
  orderLog?: any
  onSaved?: (updated: any) => void
}

function formatCurrency(amount: number | string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(amount))
}

const STATION_STORAGE_KEY = 'print-label-station-prefs'
function loadStationPrefs() {
  try { const r = localStorage.getItem(STATION_STORAGE_KEY); return r ? JSON.parse(r) : { computer: '', printer: 0, scale: '' } }
  catch { return { computer: '', printer: 0, scale: '' } }
}
function saveStationPrefs(computer: string, printer: number, scale: string) {
  try { localStorage.setItem(STATION_STORAGE_KEY, JSON.stringify({ computer, printer, scale })) } catch { /* */ }
}

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','PR','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY']

export default function OrderDialog({ isOpen, onClose, order, rawPayload, orderLog, onSaved }: OrderDialogProps) {
  const { carrierServices, boxes, locations, defaultLocationId, loaded: refDataLoaded } = useReferenceData()
  const [showJson, setShowJson] = useState(false)

  // === PrintNode state ===
  const [computers, setComputers] = useState<PrintNodeComputer[]>([])
  const [loadingComputers, setLoadingComputers] = useState(true)
  const [selectedComputerName, setSelectedComputerName] = useState('')
  const [selectedPrinterId, setSelectedPrinterId] = useState<number | null>(null)
  const [selectedScaleKey, setSelectedScaleKey] = useState('')

  // === Label state ===
  const [buying, setBuying] = useState(false)
  const [labelResult, setLabelResult] = useState<{ trackingNumber: string; labelUrl: string; cost: number } | null>(null)
  const [labelError, setLabelError] = useState<string | null>(null)

  // === Editable fields (right sidebar) ===
  const [editServiceCode, setEditServiceCode] = useState('')
  const [editWeight, setEditWeight] = useState('')
  const [editBoxId, setEditBoxId] = useState('')
  const [editLength, setEditLength] = useState('')
  const [editWidth, setEditWidth] = useState('')
  const [editHeight, setEditHeight] = useState('')

  // === Address edit state ===
  const [editingAddress, setEditingAddress] = useState(false)
  const [addrName, setAddrName] = useState('')
  const [addrCompany, setAddrCompany] = useState('')
  const [addrStreet1, setAddrStreet1] = useState('')
  const [addrStreet2, setAddrStreet2] = useState('')
  const [addrCity, setAddrCity] = useState('')
  const [addrState, setAddrState] = useState('')
  const [addrPostalCode, setAddrPostalCode] = useState('')
  const [addrCountry, setAddrCountry] = useState('US')
  const [addrPhone, setAddrPhone] = useState('')

  // === Address validation state ===
  const [addrValidated, setAddrValidated] = useState<boolean | undefined>(undefined)
  const [addrOverridden, setAddrOverridden] = useState(false)
  const [addrSuggestion, setAddrSuggestion] = useState<any>(null)
  const [addrMessages, setAddrMessages] = useState<string[]>([])
  const [savingAddress, setSavingAddress] = useState(false)

  // === Ship From state ===
  const [shipFromId, setShipFromId] = useState('')

  // === Rate recalc state ===
  const [rateRecalcing, setRateRecalcing] = useState(false)
  const [currentRate, setCurrentRate] = useState<any>(null)
  const [currentRateStatus, setCurrentRateStatus] = useState<string | null>(null)

  // === Scale polling ===
  const [scalePolling, setScalePolling] = useState(false)
  const scalePollingRef = useRef(false)
  const [scaleWeight, setScaleWeight] = useState<string | null>(null)

  // === Saving state ===
  const [saving, setSaving] = useState(false)

  // === Re-ingest state ===
  const [reingesting, setReingesting] = useState(false)

  // === Get rate state ===
  const [gettingRate, setGettingRate] = useState(false)
  const [showRateBrowser, setShowRateBrowser] = useState(false)

  // Derived
  const selectedComputer = useMemo(() => computers.find(c => c.name === selectedComputerName) || null, [computers, selectedComputerName])
  const selectedPrinter = useMemo(() => selectedComputer?.printers.find(p => p.id === selectedPrinterId) || null, [selectedComputer, selectedPrinterId])

  // Original values for change detection
  const origRef = useRef<any>({})

  // === Initialize state when dialog opens ===
  useEffect(() => {
    if (!isOpen || !orderLog) return

    setLabelResult(null)
    setLabelError(null)
    setBuying(false)
    setShowJson(false)
    setEditingAddress(false)
    setAddrSuggestion(null)
    setAddrMessages([])
    setSavingAddress(false)
    setScalePolling(false)
    scalePollingRef.current = false
    setScaleWeight(null)

    const rate = orderLog.preShoppedRate
    setCurrentRate(rate || null)
    setCurrentRateStatus(orderLog.rateShopStatus || null)
    setEditServiceCode(rate?.serviceCode || '')
    setEditWeight(orderLog.shippedWeight != null ? String(orderLog.shippedWeight) : '')

    const box = orderLog.suggestedBox
    setEditBoxId(box?.boxId || '')
    setEditLength(box?.lengthInches != null ? String(box.lengthInches) : '')
    setEditWidth(box?.widthInches != null ? String(box.widthInches) : '')
    setEditHeight(box?.heightInches != null ? String(box.heightInches) : '')

    setAddrValidated(orderLog.addressValidated)
    setAddrOverridden(orderLog.addressOverridden || false)

    const shipTo = order?.shipTo || {}
    setAddrName(shipTo.name || '')
    setAddrCompany(shipTo.company || '')
    setAddrStreet1(shipTo.street1 || '')
    setAddrStreet2(shipTo.street2 || '')
    setAddrCity(shipTo.city || '')
    setAddrState(shipTo.state || '')
    setAddrPostalCode(shipTo.postalCode || '')
    setAddrCountry(shipTo.country || 'US')
    setAddrPhone(shipTo.phone || '')

    // Default ship-from to the order's stored value or the default location
    const shipFrom = order?.shipFrom as any
    if (shipFrom?.locationId) {
      setShipFromId(shipFrom.locationId)
    } else {
      setShipFromId(defaultLocationId || '')
    }

    origRef.current = {
      weight: orderLog.shippedWeight != null ? String(orderLog.shippedWeight) : '',
      boxId: box?.boxId || '',
      length: box?.lengthInches != null ? String(box.lengthInches) : '',
      width: box?.widthInches != null ? String(box.widthInches) : '',
      height: box?.heightInches != null ? String(box.heightInches) : '',
      serviceCode: rate?.serviceCode || '',
    }

    // Fetch PrintNode computers
    setLoadingComputers(true)
    fetch('/api/printnode?action=computers')
      .then(r => r.json())
      .then(data => {
        const comps: PrintNodeComputer[] = data.computers || []
        setComputers(comps)
        const prefs = loadStationPrefs()
        if (prefs.computer) {
          const found = comps.find(c => c.name === prefs.computer)
          if (found) {
            setSelectedComputerName(prefs.computer)
            const pe = found.printers.find(p => p.id === prefs.printer)
            setSelectedPrinterId(pe ? prefs.printer : (found.printers.find(p => p.isDefault) || found.printers[0])?.id || null)
            if (prefs.scale) {
              const [dn, dnStr] = prefs.scale.split(':')
              const se = found.scales.find(s => s.deviceName === dn && s.deviceNum === parseInt(dnStr || '0', 10))
              setSelectedScaleKey(se ? prefs.scale : '')
            }
          }
        }
      })
      .catch(() => setComputers([]))
      .finally(() => setLoadingComputers(false))
  }, [isOpen, orderLog, order])

  // === Auto rate recalc on weight/dims change (debounced) ===
  const recalcTimerRef = useRef<any>(null)
  useEffect(() => {
    if (!isOpen || !orderLog?.id) return
    const orig = origRef.current
    const weightChanged = editWeight !== orig.weight
    const dimsChanged = editLength !== orig.length || editWidth !== orig.width || editHeight !== orig.height
    if (!weightChanged && !dimsChanged) return

    if (recalcTimerRef.current) clearTimeout(recalcTimerRef.current)
    recalcTimerRef.current = setTimeout(async () => {
      setRateRecalcing(true)
      try {
        const body: any = { retryRateShopping: true }
        const w = parseFloat(editWeight)
        if (!isNaN(w)) body.weight = w
        const l = parseFloat(editLength), wi = parseFloat(editWidth), h = parseFloat(editHeight)
        if (!isNaN(l) && !isNaN(wi) && !isNaN(h)) {
          body.box = {
            boxId: editBoxId || null,
            boxName: boxes.find(b => b.id === editBoxId)?.name || null,
            lengthInches: l, widthInches: wi, heightInches: h,
            weightLbs: boxes.find(b => b.id === editBoxId)?.weightLbs || 0,
          }
        }
        const res = await fetch(`/api/orders/${orderLog.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        const data = await res.json()
        if (data.success && data.order) {
          setCurrentRate(data.order.preShoppedRate || null)
          setCurrentRateStatus(data.order.rateShopStatus || null)
          origRef.current = { ...origRef.current, weight: editWeight, length: editLength, width: editWidth, height: editHeight, boxId: editBoxId }
          onSaved?.(data.order)
        }
      } catch (e) { console.error('Auto recalc error:', e) }
      finally { setRateRecalcing(false) }
    }, 800)
    return () => { if (recalcTimerRef.current) clearTimeout(recalcTimerRef.current) }
  }, [editWeight, editLength, editWidth, editHeight, isOpen, orderLog?.id, editBoxId, boxes, onSaved])

  // === Box selection auto-fills dims ===
  const handleBoxChange = useCallback((boxId: string) => {
    setEditBoxId(boxId)
    const box = boxes.find(b => b.id === boxId)
    if (box) {
      setEditLength(String(box.lengthInches))
      setEditWidth(String(box.widthInches))
      setEditHeight(String(box.heightInches))
    }
  }, [boxes])

  // === Service override (immediate save) ===
  const handleServiceChange = useCallback(async (serviceCode: string) => {
    setEditServiceCode(serviceCode)
    if (!orderLog?.id || !serviceCode) return
    const svc = carrierServices.find(s => s.serviceCode === serviceCode)
    if (!svc) return
    setSaving(true)
    try {
      const res = await fetch(`/api/orders/${orderLog.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ carrier: { carrierId: svc.carrierId, carrierCode: svc.carrierCode, carrier: svc.carrierName, serviceCode: svc.serviceCode, serviceName: svc.serviceName } }),
      })
      const data = await res.json()
      if (data.success && data.order) {
        setCurrentRate(data.order.preShoppedRate || null)
        setCurrentRateStatus(data.order.rateShopStatus || null)
        origRef.current.serviceCode = serviceCode
        onSaved?.(data.order)
      }
    } catch (e) { console.error('Service save error:', e) }
    finally { setSaving(false) }
  }, [orderLog?.id, carrierServices, onSaved])

  // === Get rate for current service (when price is $0) ===
  const handleGetRate = useCallback(async () => {
    if (!orderLog?.id) return
    setGettingRate(true)
    try {
      const body: any = { retryRateShopping: true }
      const w = parseFloat(editWeight)
      if (!isNaN(w)) body.weight = w
      const l = parseFloat(editLength), wi = parseFloat(editWidth), h = parseFloat(editHeight)
      if (!isNaN(l) && !isNaN(wi) && !isNaN(h)) {
        body.box = {
          boxId: editBoxId || null,
          boxName: boxes.find(b => b.id === editBoxId)?.name || null,
          lengthInches: l, widthInches: wi, heightInches: h,
          weightLbs: boxes.find(b => b.id === editBoxId)?.weightLbs || 0,
        }
      }
      const res = await fetch(`/api/orders/${orderLog.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data.success && data.order) {
        setCurrentRate(data.order.preShoppedRate || null)
        setCurrentRateStatus(data.order.rateShopStatus || null)
        onSaved?.(data.order)
      }
    } catch (e) { console.error('Get rate error:', e) }
    finally { setGettingRate(false) }
  }, [orderLog?.id, editWeight, editLength, editWidth, editHeight, editBoxId, boxes, onSaved])

  // === Select rate from Rate Browser ===
  const handleBrowseRateSelect = useCallback(async (rate: any) => {
    if (!orderLog?.id) return
    try {
      const res = await fetch(`/api/orders/${orderLog.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          carrier: {
            carrierId: rate.carrierId,
            carrierCode: rate.carrierCode,
            carrier: rate.carrier,
            serviceCode: rate.serviceCode,
            serviceName: rate.serviceName,
          },
        }),
      })
      const data = await res.json()
      if (data.success && data.order) {
        setCurrentRate({ ...rate, price: rate.price })
        setCurrentRateStatus('SUCCESS')
        setEditServiceCode(rate.serviceCode)
        onSaved?.(data.order)
      }
    } catch (e) { console.error('Apply rate error:', e) }
  }, [orderLog?.id, onSaved])

  // === Address save + validate ===
  const handleSaveAddress = useCallback(async () => {
    if (!orderLog?.id) return
    setSavingAddress(true)
    setAddrSuggestion(null)
    setAddrMessages([])
    try {
      const addr = { name: addrName, company: addrCompany, street1: addrStreet1, street2: addrStreet2, city: addrCity, state: addrState, postalCode: addrPostalCode, country: addrCountry, phone: addrPhone }
      const res = await fetch(`/api/orders/${orderLog.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: addr, retryRateShopping: true }),
      })
      const data = await res.json()
      if (data.success && data.order) {
        setAddrValidated(data.order.addressValidated)
        setAddrOverridden(data.order.addressOverridden)
        setCurrentRate(data.order.preShoppedRate || null)
        setCurrentRateStatus(data.order.rateShopStatus || null)
        onSaved?.(data.order)

        const av = data.addressValidation
        if (av) {
          if (av.status === 'verified') {
            setEditingAddress(false)
          } else if (av.status === 'warning' && av.matchedAddress) {
            setAddrSuggestion(av.matchedAddress)
            setAddrMessages(av.messages?.map((m: any) => m.message) || [])
          } else {
            setAddrMessages(av.messages?.map((m: any) => m.message) || ['Address could not be verified'])
          }
        } else {
          setEditingAddress(false)
        }
      }
    } catch (e: any) { setAddrMessages([e.message || 'Failed to save address']) }
    finally { setSavingAddress(false) }
  }, [orderLog?.id, addrName, addrCompany, addrStreet1, addrStreet2, addrCity, addrState, addrPostalCode, addrCountry, addrPhone, onSaved])

  // === Accept suggested address ===
  const handleAcceptSuggestion = useCallback(async () => {
    if (!orderLog?.id || !addrSuggestion) return
    setSavingAddress(true)
    try {
      const res = await fetch(`/api/orders/${orderLog.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acceptMatchedAddress: addrSuggestion, retryRateShopping: true }),
      })
      const data = await res.json()
      if (data.success && data.order) {
        setAddrValidated(true)
        setAddrOverridden(false)
        setAddrSuggestion(null)
        setAddrMessages([])
        setEditingAddress(false)
        setAddrName(addrSuggestion.name || addrName)
        setAddrCompany(addrSuggestion.company || addrCompany)
        setAddrStreet1(addrSuggestion.street1 || addrStreet1)
        setAddrStreet2(addrSuggestion.street2 || '')
        setAddrCity(addrSuggestion.city || addrCity)
        setAddrState(addrSuggestion.state || addrState)
        setAddrPostalCode(addrSuggestion.postalCode || addrPostalCode)
        setCurrentRate(data.order.preShoppedRate || null)
        setCurrentRateStatus(data.order.rateShopStatus || null)
        onSaved?.(data.order)
      }
    } catch (e) { console.error('Accept suggestion error:', e) }
    finally { setSavingAddress(false) }
  }, [orderLog?.id, addrSuggestion, addrName, addrCompany, addrStreet1, addrCity, addrState, addrPostalCode, onSaved])

  // === Override (keep original) ===
  const handleOverrideAddress = useCallback(async () => {
    if (!orderLog?.id) return
    setSavingAddress(true)
    try {
      const res = await fetch(`/api/orders/${orderLog.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overrideAddress: true }),
      })
      const data = await res.json()
      if (data.success) {
        setAddrOverridden(true)
        setAddrSuggestion(null)
        setAddrMessages([])
        setEditingAddress(false)
        onSaved?.(data.order)
      }
    } catch (e) { console.error('Override error:', e) }
    finally { setSavingAddress(false) }
  }, [orderLog?.id, onSaved])

  // === Re-verify address without editing ===
  const [verifying, setVerifying] = useState(false)
  const handleVerifyAddress = useCallback(async () => {
    if (!orderLog?.id) return
    setVerifying(true)
    setAddrSuggestion(null)
    setAddrMessages([])
    try {
      const addr = { name: addrName, company: addrCompany, street1: addrStreet1, street2: addrStreet2, city: addrCity, state: addrState, postalCode: addrPostalCode, country: addrCountry, phone: addrPhone }
      const res = await fetch(`/api/orders/${orderLog.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: addr }),
      })
      const data = await res.json()
      if (data.success && data.order) {
        setAddrValidated(data.order.addressValidated)
        setAddrOverridden(data.order.addressOverridden)
        onSaved?.(data.order)

        const av = data.addressValidation
        if (av) {
          if (av.status === 'verified') {
            setAddrMessages([])
          } else if (av.status === 'warning' && av.matchedAddress) {
            setAddrSuggestion(av.matchedAddress)
            setAddrMessages(av.messages?.map((m: any) => m.message) || [])
          } else {
            setAddrMessages(av.messages?.map((m: any) => m.message) || ['Address could not be verified'])
          }
        }
      }
    } catch (e: any) { setAddrMessages([e.message || 'Verification failed']) }
    finally { setVerifying(false) }
  }, [orderLog?.id, addrName, addrCompany, addrStreet1, addrStreet2, addrCity, addrState, addrPostalCode, addrCountry, addrPhone, onSaved])

  // === Scale polling ===
  useEffect(() => {
    setScalePolling(false)
    scalePollingRef.current = false
  }, [selectedScaleKey])

  useEffect(() => {
    if (!isOpen) { setScalePolling(false); scalePollingRef.current = false }
  }, [isOpen])

  useEffect(() => {
    if (!scalePolling || !selectedComputer || !selectedScaleKey) return
    const [deviceName, deviceNumStr] = selectedScaleKey.split(':')
    const deviceNum = parseInt(deviceNumStr || '0', 10)
    const computerId = selectedComputer.id
    let cancelled = false

    const poll = async () => {
      if (cancelled || !scalePollingRef.current) return
      try {
        const res = await fetch('/api/printnode', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'get-weight', computerId, deviceName, deviceNum }),
        })
        if (cancelled || !scalePollingRef.current) return
        const data = await res.json()
        if (data.success && data.weight) {
          setScaleWeight(data.weight)
          const parsed = parseFloat(data.weight)
          if (!isNaN(parsed) && parsed > 0) {
            setEditWeight(prev => {
              const prevNum = parseFloat(prev)
              if (Math.abs(parsed - prevNum) > 0.01 || isNaN(prevNum)) return parsed.toFixed(2)
              return prev
            })
          }
        }
      } catch { /* ignore */ }
    }

    poll()
    const interval = setInterval(poll, 500)
    return () => { cancelled = true; clearInterval(interval) }
  }, [scalePolling, selectedComputer, selectedScaleKey])

  // === PrintNode handlers ===
  const handleSelectComputer = useCallback((name: string) => {
    setSelectedComputerName(name)
    const comp = computers.find(c => c.name === name)
    if (comp) {
      const dp = comp.printers.find(p => p.isDefault) || comp.printers[0]
      const pid = dp?.id || null
      setSelectedPrinterId(pid)
      const sk = comp.scales.length > 0 ? `${comp.scales[0].deviceName}:${comp.scales[0].deviceNum}` : ''
      setSelectedScaleKey(sk)
      saveStationPrefs(name, pid || 0, sk)
    } else { setSelectedPrinterId(null); setSelectedScaleKey('') }
  }, [computers])
  const handleSelectPrinter = useCallback((id: number) => { setSelectedPrinterId(id); saveStationPrefs(selectedComputerName, id, selectedScaleKey) }, [selectedComputerName, selectedScaleKey])
  const handleSelectScale = useCallback((key: string) => { setSelectedScaleKey(key); saveStationPrefs(selectedComputerName, selectedPrinterId || 0, key) }, [selectedComputerName, selectedPrinterId])

  // === Buy & Print ===
  const handleBuyAndPrint = async () => {
    setBuying(true); setLabelError(null)
    try {
      await new Promise(r => setTimeout(r, 800))
      setLabelResult({ trackingNumber: `FAKE-${Date.now()}`, labelUrl: '', cost: currentRate?.price ?? 0 })
    } catch (err: any) { setLabelError(err.message || 'Failed to create label') }
    finally { setBuying(false) }
  }

  const handleReingest = useCallback(async () => {
    if (!orderLog?.id) return
    setReingesting(true)
    try {
      const res = await fetch(`/api/orders/${orderLog.id}/reingest`, { method: 'POST' })
      const data = await res.json()
      if (data.success && data.order) {
        const o = data.order
        setCurrentRate(o.preShoppedRate || null)
        setCurrentRateStatus(o.rateShopStatus || null)
        setEditWeight(o.shippedWeight != null ? String(o.shippedWeight) : editWeight)
        setAddrValidated(o.addressValidated)
        setAddrOverridden(o.addressOverridden || false)

        const box = o.suggestedBox as any
        if (box) {
          setEditBoxId(box.boxId || '')
          setEditLength(box.lengthInches != null ? String(box.lengthInches) : '')
          setEditWidth(box.widthInches != null ? String(box.widthInches) : '')
          setEditHeight(box.heightInches != null ? String(box.heightInches) : '')
        }

        origRef.current = {
          weight: o.shippedWeight != null ? String(o.shippedWeight) : '',
          boxId: box?.boxId || '',
          length: box?.lengthInches != null ? String(box.lengthInches) : '',
          width: box?.widthInches != null ? String(box.widthInches) : '',
          height: box?.heightInches != null ? String(box.heightInches) : '',
          serviceCode: o.preShoppedRate?.serviceCode || '',
        }
        setEditServiceCode(o.preShoppedRate?.serviceCode || '')
        onSaved?.(o)
      }
    } catch (e) { console.error('Re-ingest error:', e) }
    finally { setReingesting(false) }
  }, [orderLog?.id, editWeight, onSaved])

  if (!order) return null
  const canBuy = !!(selectedPrinterId && currentRate)

  // Validation badge
  const ValidationBadge = () => {
    if (addrValidated === true) return <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700 font-medium"><svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>Validated</span>
    if (addrOverridden) return <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-700 font-medium">Overridden</span>
    return <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-700 font-medium"><svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>Not Validated</span>
  }

  const inputCls = 'w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white'
  const selectCls = 'w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-1 focus:ring-green-500 focus:border-green-500 bg-white'

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0">
          <div className="fixed inset-0 bg-black/40" />
        </Transition.Child>
        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100" leave="ease-in duration-150" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
              <Dialog.Panel className="w-full max-w-7xl max-h-[95vh] transform rounded-xl bg-white text-left shadow-2xl transition-all flex flex-col overflow-hidden">

                {/* Header */}
                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <Dialog.Title as="h3" className="text-lg font-bold text-white">
                        Order #{order.orderNumber || 'N/A'}
                      </Dialog.Title>
                      {order.orderKey && <span className="text-xs text-blue-200 font-mono">NS: {order.orderKey}</span>}
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-white/20 text-white">
                        {order.orderStatus || 'Awaiting Shipment'}
                      </span>
                      {(saving || rateRecalcing) && <span className="text-xs text-blue-200 animate-pulse">Saving...</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setShowJson(!showJson)} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-blue-100 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
                        <CodeBracketIcon className="h-3.5 w-3.5" />JSON
                      </button>
                      <button onClick={handleReingest} disabled={reingesting} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-blue-100 hover:text-white hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50">
                        {reingesting ? (
                          <><svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>Running...</>
                        ) : (
                          <><svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" /></svg>Re-run Ingest</>
                        )}
                      </button>
                      <button onClick={onClose} className="ml-2 rounded-full p-1 text-white hover:bg-white/20 transition-colors">
                        <XMarkIcon className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                </div>

                {showJson && rawPayload && (
                  <div className="bg-gray-900 border-b border-gray-700 max-h-64 overflow-auto">
                    <pre className="p-4 text-xs text-green-400 font-mono whitespace-pre-wrap">{JSON.stringify(rawPayload, null, 2)}</pre>
                  </div>
                )}

                {/* Two-Panel Content */}
                <div className="grid grid-cols-1 lg:grid-cols-5 flex-1 min-h-0 overflow-hidden">

                  {/* LEFT PANEL */}
                  <div className="lg:col-span-3 overflow-y-auto p-6 space-y-5 border-r border-gray-200">

                    {/* Ship To */}
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Ship To</h4>
                          <ValidationBadge />
                        </div>
                        {!editingAddress ? (
                          <div className="flex items-center gap-2">
                            {addrValidated !== true && (
                              <button onClick={handleVerifyAddress} disabled={verifying} className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700 hover:bg-blue-200 font-medium disabled:opacity-50 transition-colors">
                                {verifying ? 'Verifying...' : 'Verify'}
                              </button>
                            )}
                            <button onClick={() => setEditingAddress(true)} className="text-xs text-blue-600 hover:text-blue-800 font-medium">Edit</button>
                          </div>
                        ) : (
                          <button onClick={() => { setEditingAddress(false); setAddrSuggestion(null); setAddrMessages([]) }} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                        )}
                      </div>

                      {!editingAddress ? (
                        <div>
                          <div className="text-sm text-gray-900">
                            <div className="font-medium">{addrName}</div>
                            {addrCompany && <div className="text-gray-600">{addrCompany}</div>}
                            <div className="mt-1">{addrStreet1}</div>
                            {addrStreet2 && <div>{addrStreet2}</div>}
                            <div>{addrCity}, {addrState} {addrPostalCode}</div>
                            {addrCountry && addrCountry !== 'US' && <div>{addrCountry}</div>}
                            {addrPhone && <div className="text-xs text-gray-500 mt-1">{addrPhone}</div>}
                          </div>

                          {addrSuggestion && (
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm mt-3">
                              <div className="font-medium text-blue-800 mb-1">ShipEngine suggests:</div>
                              <div className="text-blue-700 text-xs">
                                {addrSuggestion.street1}<br />
                                {addrSuggestion.street2 && <>{addrSuggestion.street2}<br /></>}
                                {addrSuggestion.city}, {addrSuggestion.state} {addrSuggestion.postalCode}
                              </div>
                              <div className="flex gap-2 mt-2">
                                <button onClick={handleAcceptSuggestion} disabled={savingAddress} className="px-3 py-1 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50">Accept</button>
                                <button onClick={handleOverrideAddress} disabled={savingAddress} className="px-3 py-1 text-xs text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg">Keep Mine</button>
                              </div>
                            </div>
                          )}

                          {addrMessages.length > 0 && !addrSuggestion && (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-xs text-red-700 mt-3">
                              {addrMessages.map((m, i) => <div key={i}>{m}</div>)}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div><label className="block text-xs text-gray-600 mb-0.5">Name</label><input className={inputCls} value={addrName} onChange={e => { setAddrName(e.target.value); setAddrValidated(false) }} /></div>
                            <div><label className="block text-xs text-gray-600 mb-0.5">Company</label><input className={inputCls} value={addrCompany} onChange={e => { setAddrCompany(e.target.value); setAddrValidated(false) }} /></div>
                          </div>
                          <div><label className="block text-xs text-gray-600 mb-0.5">Street 1</label><input className={inputCls} value={addrStreet1} onChange={e => { setAddrStreet1(e.target.value); setAddrValidated(false) }} /></div>
                          <div><label className="block text-xs text-gray-600 mb-0.5">Street 2</label><input className={inputCls} value={addrStreet2} onChange={e => { setAddrStreet2(e.target.value); setAddrValidated(false) }} /></div>
                          <div className="grid grid-cols-4 gap-2">
                            <div className="col-span-2"><label className="block text-xs text-gray-600 mb-0.5">City</label><input className={inputCls} value={addrCity} onChange={e => { setAddrCity(e.target.value); setAddrValidated(false) }} /></div>
                            <div>
                              <label className="block text-xs text-gray-600 mb-0.5">State</label>
                              {addrCountry === 'US' ? (
                                <select className={inputCls} value={addrState} onChange={e => { setAddrState(e.target.value); setAddrValidated(false) }}>
                                  <option value="">--</option>
                                  {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                              ) : (
                                <input className={inputCls} value={addrState} onChange={e => { setAddrState(e.target.value); setAddrValidated(false) }} />
                              )}
                            </div>
                            <div><label className="block text-xs text-gray-600 mb-0.5">Zip</label><input className={inputCls} value={addrPostalCode} onChange={e => { setAddrPostalCode(e.target.value); setAddrValidated(false) }} /></div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div><label className="block text-xs text-gray-600 mb-0.5">Country</label><input className={inputCls} value={addrCountry} onChange={e => { setAddrCountry(e.target.value); setAddrValidated(false) }} /></div>
                            <div><label className="block text-xs text-gray-600 mb-0.5">Phone</label><input className={inputCls} value={addrPhone} onChange={e => setAddrPhone(e.target.value)} /></div>
                          </div>

                          {/* Suggestion from ShipEngine */}
                          {addrSuggestion && (
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
                              <div className="font-medium text-blue-800 mb-1">ShipEngine suggests:</div>
                              <div className="text-blue-700 text-xs">
                                {addrSuggestion.street1}<br />
                                {addrSuggestion.street2 && <>{addrSuggestion.street2}<br /></>}
                                {addrSuggestion.city}, {addrSuggestion.state} {addrSuggestion.postalCode}
                              </div>
                              <div className="flex gap-2 mt-2">
                                <button onClick={handleAcceptSuggestion} disabled={savingAddress} className="px-3 py-1 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50">Accept</button>
                                <button onClick={handleOverrideAddress} disabled={savingAddress} className="px-3 py-1 text-xs text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg">Keep Mine</button>
                              </div>
                            </div>
                          )}

                          {addrMessages.length > 0 && !addrSuggestion && (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-xs text-red-700">
                              {addrMessages.map((m, i) => <div key={i}>{m}</div>)}
                            </div>
                          )}

                          <button onClick={handleSaveAddress} disabled={savingAddress} className="px-4 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50">
                            {savingAddress ? 'Validating...' : 'Save & Validate Address'}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Ship From */}
                    <div className="bg-gray-50 rounded-lg p-4">
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Ship From</h4>
                      <select
                        value={shipFromId}
                        onChange={e => {
                          setShipFromId(e.target.value)
                          if (orderLog?.id && e.target.value) {
                            fetch(`/api/orders/${orderLog.id}`, {
                              method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ shipFrom: { locationId: e.target.value } }),
                            }).then(r => r.json()).then(d => { if (d.order && onSaved) onSaved(d.order) }).catch(() => {})
                          }
                        }}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      >
                        <option value="">-- Select location --</option>
                        {locations.map(loc => (
                          <option key={loc.id} value={loc.id}>{loc.name}{loc.isDefault ? ' (default)' : ''}</option>
                        ))}
                      </select>
                      {(() => {
                        const loc = locations.find(l => l.id === shipFromId)
                        if (!loc) return null
                        return (
                          <div className="text-sm text-gray-700 mt-2">
                            {loc.company && <div className="text-gray-600">{loc.company}</div>}
                            <div>{loc.addressLine1}</div>
                            {loc.addressLine2 && <div>{loc.addressLine2}</div>}
                            <div>{loc.city}, {loc.state} {loc.postalCode}</div>
                            {loc.phone && <div className="text-xs text-gray-500 mt-1">{loc.phone}</div>}
                          </div>
                        )
                      })()}
                    </div>

                    {/* Order Items */}
                    {order.items && order.items.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Items ({order.items.length})</h4>
                        <div className="overflow-x-auto rounded-lg border border-gray-200">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">SKU</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Color</th>
                                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qty</th>
                                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Price</th>
                                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Weight</th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-100">
                              {order.items.map((item, idx) => (
                                <tr key={idx} className="hover:bg-gray-50">
                                  <td className="px-3 py-2 whitespace-nowrap text-xs font-mono text-gray-700">{item.sku || 'N/A'}</td>
                                  <td className="px-3 py-2 text-sm text-gray-900 font-medium">{item.name || 'Unnamed'}</td>
                                  <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-600">{item.color || '—'}</td>
                                  <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900 text-right">{item.quantity || 0}</td>
                                  <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900 text-right">{item.unitPrice ? formatCurrency(item.unitPrice) : '$0.00'}</td>
                                  <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500 text-right">{item.weight?.value ? `${item.weight.value} ${item.weight.units || 'lbs'}` : '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Cost Summary */}
                    <div className="bg-gray-50 rounded-lg p-4">
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Cost Summary</h4>
                      <div className="space-y-1.5 text-sm">
                        {order.amountPaid !== undefined && (
                          <div className="flex justify-between"><span className="text-gray-500">Product</span><span className="text-gray-900">{formatCurrency((order.amountPaid || 0) - (order.shippingAmount || 0) - (order.taxAmount || 0))}</span></div>
                        )}
                        {order.shippingAmount !== undefined && (
                          <div className="flex justify-between"><span className="text-gray-500">Shipping</span><span className="text-gray-900">{formatCurrency(order.shippingAmount)}</span></div>
                        )}
                        {order.taxAmount !== undefined && order.taxAmount > 0 && (
                          <div className="flex justify-between"><span className="text-gray-500">Tax</span><span className="text-gray-900">{formatCurrency(order.taxAmount)}</span></div>
                        )}
                        {order.amountPaid !== undefined && (
                          <div className="flex justify-between pt-1.5 border-t border-gray-200 font-semibold"><span className="text-gray-700">Total Paid</span><span className="text-gray-900">{formatCurrency(order.amountPaid)}</span></div>
                        )}
                      </div>
                    </div>

                    {/* Order Info */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                      {order.orderDate && <div className="bg-gray-50 rounded-lg p-3"><div className="text-xs text-gray-500 mb-0.5">Order Date</div><div className="font-medium text-gray-900">{new Date(order.orderDate).toLocaleDateString()}</div></div>}
                      {order.requestedShippingService && <div className="bg-gray-50 rounded-lg p-3"><div className="text-xs text-gray-500 mb-0.5">Requested</div><div className="font-medium text-gray-900 text-xs">{order.requestedShippingService}</div></div>}
                      {order.paymentMethod && <div className="bg-gray-50 rounded-lg p-3"><div className="text-xs text-gray-500 mb-0.5">Payment</div><div className="font-medium text-gray-900">{order.paymentMethod}</div></div>}
                      {orderLog?.orderType && <div className="bg-gray-50 rounded-lg p-3"><div className="text-xs text-gray-500 mb-0.5">Type</div><div className="font-medium text-gray-900">{orderLog.orderType}</div></div>}
                    </div>

                    {order.advancedOptions?.customField1 && (
                      <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
                        <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Notes</h4>
                        <p className="text-sm text-gray-900">{order.advancedOptions.customField1}</p>
                      </div>
                    )}
                  </div>

                  {/* RIGHT SIDEBAR */}
                  <div className="lg:col-span-2 overflow-y-auto p-5 bg-gray-50/50 space-y-4">

                    {/* Service */}
                    <div className="bg-white rounded-lg p-4 border border-gray-200">
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Service</h4>
                      <select value={editServiceCode} onChange={e => handleServiceChange(e.target.value)} disabled={!refDataLoaded} className={selectCls}>
                        <option value="">{!refDataLoaded ? 'Loading...' : 'Select service...'}</option>
                        {carrierServices.map(s => <option key={s.serviceCode} value={s.serviceCode}>{s.carrierName} — {s.serviceName}</option>)}
                      </select>
                      {currentRate && currentRate.price > 0 ? (
                        <div className="flex items-center justify-between mt-3">
                          <div>
                            <div className="text-sm font-medium text-gray-900">{currentRate.serviceName || currentRate.serviceCode}</div>
                            <div className="text-xs text-gray-500">{currentRate.carrier}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-bold text-green-700">${currentRate.price?.toFixed(2)}</div>
                            {currentRate.deliveryDays && <div className="text-xs text-gray-400">{currentRate.deliveryDays}d</div>}
                          </div>
                        </div>
                      ) : currentRate && currentRate.serviceCode && !rateRecalcing ? (
                        <div className="flex items-center justify-between mt-3">
                          <div>
                            <div className="text-sm font-medium text-gray-900">{currentRate.serviceName || currentRate.serviceCode}</div>
                            <div className="text-xs text-gray-500">{currentRate.carrier}</div>
                          </div>
                          <button onClick={handleGetRate} disabled={gettingRate} className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 transition-colors">
                            {gettingRate ? 'Getting...' : 'Get Rate'}
                          </button>
                        </div>
                      ) : null}
                      {rateRecalcing && <div className="text-xs text-blue-500 mt-2 animate-pulse">Recalculating rate...</div>}
                      {currentRateStatus === 'FAILED' && <div className="text-xs text-red-600 mt-2 bg-red-50 p-2 rounded">Rate shopping failed</div>}
                      <button
                        onClick={() => setShowRateBrowser(true)}
                        className="mt-3 w-full py-1.5 px-3 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors"
                      >
                        Browse Rates
                      </button>
                    </div>

                    {/* Package */}
                    <div className="bg-white rounded-lg p-4 border border-gray-200 space-y-3">
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Package</h4>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Box</label>
                        <select value={editBoxId} onChange={e => handleBoxChange(e.target.value)} className={selectCls}>
                          <option value="">Custom / No box</option>
                          {boxes.map(b => <option key={b.id} value={b.id}>{b.name} ({b.lengthInches}x{b.widthInches}x{b.heightInches})</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Weight (lbs)</label>
                        <div className="flex items-center gap-2">
                          <input type="number" step="0.01" min="0" value={editWeight} onChange={e => setEditWeight(e.target.value)} className={`flex-1 ${inputCls}`} placeholder="0.00" />
                          {selectedComputer && selectedScaleKey && (
                            <button
                              onClick={() => { const next = !scalePolling; setScalePolling(next); scalePollingRef.current = next }}
                              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${scalePolling ? 'bg-green-100 text-green-700 border-green-300' : 'bg-gray-100 text-gray-600 border-gray-300 hover:bg-gray-200'}`}
                            >
                              {scalePolling && <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" /></span>}
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0 0 12 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52 2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 0 1-2.031.352 5.988 5.988 0 0 1-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.971Zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0 2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 0 1-2.031.352 5.988 5.988 0 0 1-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.971Z" /></svg>
                              {scalePolling ? 'LIVE' : 'Scale'}
                            </button>
                          )}
                        </div>
                        {scalePolling && scaleWeight && <div className="text-xs text-green-600 mt-1">Scale: {scaleWeight}</div>}
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Size (in)</label>
                        <div className="grid grid-cols-3 gap-2">
                          <input type="number" step="0.1" min="0" placeholder="L" value={editLength} onChange={e => setEditLength(e.target.value)} className={inputCls} />
                          <input type="number" step="0.1" min="0" placeholder="W" value={editWidth} onChange={e => setEditWidth(e.target.value)} className={inputCls} />
                          <input type="number" step="0.1" min="0" placeholder="H" value={editHeight} onChange={e => setEditHeight(e.target.value)} className={inputCls} />
                        </div>
                      </div>
                    </div>

                    {/* Print Station */}
                    <div className="bg-white rounded-lg p-4 border border-gray-200">
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Print Station</h4>
                      {loadingComputers ? <div className="text-sm text-gray-400">Loading stations...</div>
                      : computers.length === 0 ? <div className="text-xs text-amber-600 bg-amber-50 p-2.5 rounded-lg">No PrintNode computers online.</div>
                      : (
                        <div className="space-y-3">
                          <div><label className="block text-xs font-medium text-gray-600 mb-1">Station</label>
                            <select value={selectedComputerName} onChange={e => handleSelectComputer(e.target.value)} className={selectCls}>
                              <option value="">Select a station...</option>
                              {computers.map(c => <option key={c.id} value={c.name}>{c.friendlyName || c.name}</option>)}
                            </select>
                          </div>
                          {selectedComputer && selectedComputer.printers.length > 0 && (
                            <div><label className="block text-xs font-medium text-gray-600 mb-1">Printer</label>
                              <select value={selectedPrinterId || ''} onChange={e => handleSelectPrinter(parseInt(e.target.value, 10))} className={selectCls}>
                                {selectedComputer.printers.map(p => <option key={p.id} value={p.id}>{p.friendlyName || p.name}{p.isDefault ? ' (default)' : ''}</option>)}
                              </select>
                            </div>
                          )}
                          {selectedComputer && selectedComputer.printers.length === 0 && <div className="text-xs text-amber-600 bg-amber-50 p-2 rounded-lg">No printers on this station.</div>}
                          {selectedComputer && selectedComputer.scales.length > 0 && (
                            <div><label className="block text-xs font-medium text-gray-600 mb-1">Scale <span className="text-gray-400">(optional)</span></label>
                              <select value={selectedScaleKey} onChange={e => handleSelectScale(e.target.value)} className={selectCls}>
                                <option value="">No scale</option>
                                {selectedComputer.scales.map(s => { const k = `${s.deviceName}:${s.deviceNum}`; return <option key={k} value={k}>{s.friendlyName || s.deviceName}</option> })}
                              </select>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {labelError && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{labelError}</div>}

                    {labelResult ? (
                      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                          <span className="font-semibold text-green-800 text-sm">Label Created</span>
                        </div>
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between"><span className="text-green-700">Tracking #</span><span className="font-mono font-medium text-green-900">{labelResult.trackingNumber}</span></div>
                          {labelResult.cost > 0 && <div className="flex justify-between"><span className="text-green-700">Cost</span><span className="font-medium text-green-900">${labelResult.cost.toFixed(2)}</span></div>}
                          <div className="text-xs text-green-600 mt-1">Sent to {selectedPrinter ? (selectedPrinter.friendlyName || selectedPrinter.name) : 'printer'}</div>
                        </div>
                      </div>
                    ) : (
                      <button onClick={handleBuyAndPrint} disabled={!canBuy || buying} className="w-full py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold flex items-center justify-center gap-2 text-sm shadow-sm transition-colors">
                        {buying ? (
                          <><svg className="animate-spin w-4 h-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>Creating Label...</>
                        ) : (
                          <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18.75 12h.008v.008h-.008V12zm-2.25 0h.008v.008h-.008V12z" /></svg>Create + Print Label</>
                        )}
                      </button>
                    )}
                  </div>
                </div>

              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>

      {/* Rate Browser Dialog (renders outside the main Dialog to avoid z-index issues) */}
      <RateBrowserDialog
        isOpen={showRateBrowser}
        onClose={() => setShowRateBrowser(false)}
        order={order}
        orderLog={orderLog}
        onSelectRate={handleBrowseRateSelect}
      />
    </Transition>
  )
}
