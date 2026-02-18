'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'

interface PrintNodeComputer {
  id: number
  name: string
  friendlyName: string
  state: string
  printers: { id: number; name: string; friendlyName: string; isDefault: boolean }[]
  scales: { deviceName: string; deviceNum: number; friendlyName: string }[]
}

interface PrintLabelDialogProps {
  isOpen: boolean
  onClose: () => void
  order: any
  orderLog: any
  onLabelCreated?: (data: { trackingNumber: string; labelUrl: string; cost: number }) => void
}

function getStationStorageKey() {
  const userId = typeof window !== 'undefined' ? localStorage.getItem('current-user-id') : null
  return userId ? `print-label-station-prefs-${userId}` : 'print-label-station-prefs'
}

function loadStationPrefs() {
  try {
    const raw = localStorage.getItem(getStationStorageKey())
    if (!raw) return { computer: '', printer: 0, scale: '' }
    return JSON.parse(raw)
  } catch {
    return { computer: '', printer: 0, scale: '' }
  }
}

function saveStationPrefs(computer: string, printer: number, scale: string) {
  try {
    localStorage.setItem(getStationStorageKey(), JSON.stringify({ computer, printer, scale }))
  } catch { /* ignore */ }
}

export default function PrintLabelDialog({ isOpen, onClose, order, orderLog, onLabelCreated }: PrintLabelDialogProps) {
  const [computers, setComputers] = useState<PrintNodeComputer[]>([])
  const [loadingComputers, setLoadingComputers] = useState(true)

  const [selectedComputerName, setSelectedComputerName] = useState('')
  const [selectedPrinterId, setSelectedPrinterId] = useState<number | null>(null)
  const [selectedScaleKey, setSelectedScaleKey] = useState('')

  const [buying, setBuying] = useState(false)
  const [result, setResult] = useState<{ trackingNumber: string; labelUrl: string; cost: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const preShoppedRate = orderLog?.preShoppedRate as any
  const shippedWeight = orderLog?.shippedWeight as number | null
  const suggestedBox = orderLog?.suggestedBox as any

  const selectedComputer = useMemo(
    () => computers.find((c) => c.name === selectedComputerName) || null,
    [computers, selectedComputerName]
  )

  const selectedPrinter = useMemo(
    () => selectedComputer?.printers.find((p) => p.id === selectedPrinterId) || null,
    [selectedComputer, selectedPrinterId]
  )

  const selectedScale = useMemo(() => {
    if (!selectedComputer || !selectedScaleKey) return null
    const [dn, dnStr] = selectedScaleKey.split(':')
    return selectedComputer.scales.find(
      (s) => s.deviceName === dn && s.deviceNum === parseInt(dnStr || '0', 10)
    ) || null
  }, [selectedComputer, selectedScaleKey])

  useEffect(() => {
    if (!isOpen) return
    setResult(null)
    setError(null)
    setBuying(false)

    setLoadingComputers(true)
    fetch('/api/printnode?action=computers')
      .then((r) => r.json())
      .then((data) => {
        const comps: PrintNodeComputer[] = data.computers || []
        setComputers(comps)

        const prefs = loadStationPrefs()
        if (prefs.computer) {
          const found = comps.find((c) => c.name === prefs.computer)
          if (found) {
            setSelectedComputerName(prefs.computer)
            const printerExists = found.printers.find((p) => p.id === prefs.printer)
            setSelectedPrinterId(printerExists ? prefs.printer : (found.printers.find((p) => p.isDefault) || found.printers[0])?.id || null)
            if (prefs.scale) {
              const [dn, dnStr] = prefs.scale.split(':')
              const scaleExists = found.scales.find((s) => s.deviceName === dn && s.deviceNum === parseInt(dnStr || '0', 10))
              setSelectedScaleKey(scaleExists ? prefs.scale : '')
            }
          }
        }
      })
      .catch(() => setComputers([]))
      .finally(() => setLoadingComputers(false))
  }, [isOpen])

  const handleSelectComputer = useCallback((name: string) => {
    setSelectedComputerName(name)
    const comp = computers.find((c) => c.name === name)
    if (comp) {
      const defaultP = comp.printers.find((p) => p.isDefault) || comp.printers[0]
      const pid = defaultP?.id || null
      setSelectedPrinterId(pid)
      const scaleKey = comp.scales.length > 0 ? `${comp.scales[0].deviceName}:${comp.scales[0].deviceNum}` : ''
      setSelectedScaleKey(scaleKey)
      saveStationPrefs(name, pid || 0, scaleKey)
    } else {
      setSelectedPrinterId(null)
      setSelectedScaleKey('')
    }
  }, [computers])

  const handleSelectPrinter = useCallback((id: number) => {
    setSelectedPrinterId(id)
    saveStationPrefs(selectedComputerName, id, selectedScaleKey)
  }, [selectedComputerName, selectedScaleKey])

  const handleSelectScale = useCallback((key: string) => {
    setSelectedScaleKey(key)
    saveStationPrefs(selectedComputerName, selectedPrinterId || 0, key)
  }, [selectedComputerName, selectedPrinterId])

  const handleBuyAndPrint = async () => {
    setBuying(true)
    setError(null)

    try {
      // FAKE label creation for now
      await new Promise((r) => setTimeout(r, 800))
      const fakeResult = {
        trackingNumber: `FAKE-${Date.now()}`,
        labelUrl: '',
        cost: preShoppedRate?.price ?? 0,
      }
      setResult(fakeResult)
      onLabelCreated?.(fakeResult)
    } catch (err: any) {
      setError(err.message || 'Failed to create label')
    } finally {
      setBuying(false)
    }
  }

  if (!isOpen) return null

  const canBuy = !!(selectedPrinterId && preShoppedRate)

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 py-8">
        <div className="fixed inset-0 bg-black/50 transition-opacity" onClick={onClose} />
        <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg z-10 overflow-hidden">

          {/* Header */}
          <div className="bg-gradient-to-r from-green-600 to-emerald-600 px-6 py-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">
                Print Label — #{order?.orderNumber || orderLog?.orderNumber || 'N/A'}
              </h3>
              <button onClick={onClose} className="rounded-full p-1 text-white hover:bg-white/20 transition-colors">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <div className="p-6 space-y-5">

            {/* Success State */}
            {result ? (
              <div className="text-center py-4">
                <div className="mx-auto w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mb-4">
                  <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h4 className="text-lg font-semibold text-gray-900 mb-1">Label Created</h4>
                <p className="text-sm text-gray-500 mb-4">Sent to {selectedPrinter ? (selectedPrinter.friendlyName || selectedPrinter.name) : 'printer'}</p>
                <div className="bg-gray-50 rounded-lg p-4 text-left space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Tracking #</span>
                    <span className="font-mono font-medium text-gray-900">{result.trackingNumber}</span>
                  </div>
                  {result.cost > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Cost</span>
                      <span className="font-medium text-gray-900">${result.cost.toFixed(2)}</span>
                    </div>
                  )}
                </div>
                <button
                  onClick={onClose}
                  className="mt-6 px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 text-sm font-medium"
                >
                  Close
                </button>
              </div>
            ) : (
              <>
                {/* Ship To */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Ship To</h4>
                  <div className="text-sm text-gray-900">
                    <div className="font-medium">{order?.shipTo?.name || 'N/A'}</div>
                    {order?.shipTo?.company && <div className="text-gray-600">{order.shipTo.company}</div>}
                    <div>{order?.shipTo?.street1}</div>
                    {order?.shipTo?.street2 && <div>{order.shipTo.street2}</div>}
                    <div>{order?.shipTo?.city}, {order?.shipTo?.state} {order?.shipTo?.postalCode}</div>
                  </div>
                </div>

                {/* Package + Shipping */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Package</h4>
                    <div className="text-sm space-y-1">
                      {suggestedBox?.boxName && (
                        <div><span className="text-gray-500">Box:</span> <span className="font-medium">{suggestedBox.boxName}</span></div>
                      )}
                      {shippedWeight != null && (
                        <div><span className="text-gray-500">Weight:</span> <span className="font-medium">{shippedWeight.toFixed(2)} lbs</span></div>
                      )}
                      {suggestedBox?.lengthInches && (
                        <div><span className="text-gray-500">Dims:</span> <span className="font-medium">{suggestedBox.lengthInches}×{suggestedBox.widthInches}×{suggestedBox.heightInches}&quot;</span></div>
                      )}
                    </div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Service</h4>
                    {preShoppedRate ? (
                      <div className="text-sm space-y-1">
                        <div className="font-medium">{preShoppedRate.serviceName || preShoppedRate.serviceCode}</div>
                        <div className="text-gray-500">{preShoppedRate.carrier}</div>
                        <div className="text-lg font-bold text-green-700">${preShoppedRate.price?.toFixed(2)}</div>
                        {preShoppedRate.deliveryDays && (
                          <div className="text-xs text-gray-400">{preShoppedRate.deliveryDays} day{preShoppedRate.deliveryDays !== 1 ? 's' : ''}</div>
                        )}
                      </div>
                    ) : (
                      <div className="text-sm text-amber-600">
                        No rate assigned. Rate shop this order first.
                      </div>
                    )}
                  </div>
                </div>

                {/* Station Selection */}
                <div className="border-t border-gray-200 pt-4">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Print Station</h4>

                  {loadingComputers ? (
                    <div className="text-sm text-gray-400">Loading stations...</div>
                  ) : computers.length === 0 ? (
                    <div className="text-sm text-amber-600 bg-amber-50 p-3 rounded-lg">
                      No PrintNode computers online. Configure printers in Settings.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {/* Computer/Station */}
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Station</label>
                        <select
                          value={selectedComputerName}
                          onChange={(e) => handleSelectComputer(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-1 focus:ring-green-500 focus:border-green-500 bg-white"
                        >
                          <option value="">Select a station...</option>
                          {computers.map((c) => (
                            <option key={c.id} value={c.name}>
                              {c.friendlyName || c.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Printer */}
                      {selectedComputer && selectedComputer.printers.length > 0 && (
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Printer</label>
                          <select
                            value={selectedPrinterId || ''}
                            onChange={(e) => handleSelectPrinter(parseInt(e.target.value, 10))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-1 focus:ring-green-500 focus:border-green-500 bg-white"
                          >
                            {selectedComputer.printers.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.friendlyName || p.name}{p.isDefault ? ' (default)' : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {selectedComputer && selectedComputer.printers.length === 0 && (
                        <div className="text-sm text-amber-600 bg-amber-50 p-2 rounded-lg">
                          No enabled printers on this station.
                        </div>
                      )}

                      {/* Scale (optional) */}
                      {selectedComputer && selectedComputer.scales.length > 0 && (
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Scale <span className="text-gray-400">(optional)</span></label>
                          <select
                            value={selectedScaleKey}
                            onChange={(e) => handleSelectScale(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-1 focus:ring-green-500 focus:border-green-500 bg-white"
                          >
                            <option value="">No scale</option>
                            {selectedComputer.scales.map((s) => {
                              const key = `${s.deviceName}:${s.deviceNum}`
                              return (
                                <option key={key} value={key}>
                                  {s.friendlyName || s.deviceName}
                                </option>
                              )
                            })}
                          </select>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Error */}
                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-between pt-2">
                  <button
                    onClick={onClose}
                    className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleBuyAndPrint}
                    disabled={!canBuy || buying}
                    className="px-6 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-semibold flex items-center gap-2"
                  >
                    {buying ? (
                      <>
                        <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Creating Label...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18.75 12h.008v.008h-.008V12zm-2.25 0h.008v.008h-.008V12z" />
                        </svg>
                        Buy &amp; Print Label
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
