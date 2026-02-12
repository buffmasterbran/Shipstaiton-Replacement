'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'

interface PrintNodePrinter {
  id: number
  name: string
  state: string
  friendlyName: string
  enabled: boolean
  isDefault: boolean
  computerFriendlyName: string
  computer: { id: number; name: string; state: string }
}

interface ScaleInfo {
  deviceName: string
  deviceNum: number
  computerId: number
  vendor: string
  product: string
  measurement: Record<string, number>
}

interface WeightReading {
  weight: string
  rawValue: number
  unit: string
  massOz: number | null
  ageOfData: number
}

export default function PrintersSettingsPage() {
  const [pnConfigured, setPnConfigured] = useState(false)
  const [pnPrinters, setPnPrinters] = useState<PrintNodePrinter[]>([])
  const [pnGrouped, setPnGrouped] = useState<Record<string, PrintNodePrinter[]>>({})
  const [pnLoading, setPnLoading] = useState(true)
  const [pnMessage, setPnMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [pnTestingId, setPnTestingId] = useState<number | null>(null)
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Accordion + search state
  const [expandedStations, setExpandedStations] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')

  // Delete station state
  const [deleteTarget, setDeleteTarget] = useState<{ computerName: string; computerId: number } | null>(null)
  const [deleteCode, setDeleteCode] = useState('')
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Scales state
  const [scales, setScales] = useState<Record<number, ScaleInfo[]>>({}) // computerId -> scales
  const [scalesLoading, setScalesLoading] = useState(false)
  const [weightReadings, setWeightReadings] = useState<Record<string, WeightReading | null>>({}) // "computerId-deviceName-deviceNum" -> reading
  const [scaleFriendlyNames, setScaleFriendlyNames] = useState<Record<string, string>>({}) // "computerId-deviceName-deviceNum" -> friendly name
  const [pollingScales, setPollingScales] = useState<Set<string>>(new Set()) // keys of scales being live-polled
  const pollingIntervalsRef = useRef<Record<string, ReturnType<typeof setInterval>>>({}) // track intervals per scale key

  useEffect(() => {
    fetch('/api/printnode?action=printers')
      .then(r => r.json())
      .then((data) => {
        setPnConfigured(data.configured || false)
        setPnPrinters(data.printers || [])
        setPnGrouped(data.grouped || {})

        // Fetch scales for all computers
        if (data.configured) {
          setScalesLoading(true)
          fetch('/api/printnode?action=scales')
            .then(r => r.json())
            .then((scaleData) => {
              const parsed: Record<number, ScaleInfo[]> = {}
              if (scaleData.scales) {
                for (const [compId, scaleList] of Object.entries(scaleData.scales)) {
                  parsed[parseInt(compId, 10)] = scaleList as ScaleInfo[]
                }
              }
              setScales(parsed)
              if (scaleData.friendlyNames) {
                setScaleFriendlyNames(scaleData.friendlyNames)
              }
            })
            .catch(() => setScales({}))
            .finally(() => setScalesLoading(false))
        }
      })
      .catch(() => {
        setPnConfigured(false)
        setPnPrinters([])
      })
      .finally(() => setPnLoading(false))
  }, [])

  // Rebuild grouped map from flat printers list
  const rebuildGrouped = useCallback((printers: PrintNodePrinter[]) => {
    const grouped: Record<string, PrintNodePrinter[]> = {}
    for (const p of printers) {
      const key = p.computer.name
      if (!grouped[key]) grouped[key] = []
      grouped[key].push(p)
    }
    return grouped
  }, [])

  // Auto-save: persist current printer state to DB
  const persistPrinters = useCallback(async (printers: PrintNodePrinter[]) => {
    setAutoSaveStatus('saving')
    if (autoSaveTimer.current) {
      clearTimeout(autoSaveTimer.current)
      autoSaveTimer.current = null
    }
    try {
      const printerConfigs = printers.map((p) => ({
        printNodeId: p.id,
        name: p.name || '',
        friendlyName: p.friendlyName || '',
        computerName: p.computer.name,
        computerFriendlyName: p.computerFriendlyName || '',
        computerId: p.computer.id,
        enabled: p.enabled !== false,
        isDefault: p.isDefault === true,
      }))
      const res = await fetch('/api/printnode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save-settings', printers: printerConfigs }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      setAutoSaveStatus('saved')
      autoSaveTimer.current = setTimeout(() => setAutoSaveStatus('idle'), 2000)
    } catch (err: any) {
      setAutoSaveStatus('error')
      setPnMessage({ type: 'error', text: err.message || 'Failed to auto-save' })
      autoSaveTimer.current = setTimeout(() => setAutoSaveStatus('idle'), 4000)
    }
  }, [])

  // Toggle enabled and immediately persist
  const handleToggleEnabled = useCallback((printerId: number) => {
    setPnPrinters(prev => {
      const updated = prev.map(p =>
        p.id === printerId ? { ...p, enabled: !p.enabled } : p
      )
      setPnGrouped(rebuildGrouped(updated))
      persistPrinters(updated)
      return updated
    })
  }, [rebuildGrouped, persistPrinters])

  // Set default and immediately persist
  const handleSetDefault = useCallback((printerId: number, computerName: string) => {
    setPnPrinters(prev => {
      const updated = prev.map(p =>
        p.computer.name === computerName
          ? { ...p, isDefault: p.id === printerId }
          : p
      )
      setPnGrouped(rebuildGrouped(updated))
      persistPrinters(updated)
      return updated
    })
  }, [rebuildGrouped, persistPrinters])

  // Update printer friendly name locally (saves on blur)
  const handleFriendlyNameChange = useCallback((printerId: number, val: string) => {
    setPnPrinters(prev => {
      const updated = prev.map(p =>
        p.id === printerId ? { ...p, friendlyName: val } : p
      )
      setPnGrouped(rebuildGrouped(updated))
      return updated
    })
  }, [rebuildGrouped])

  // Update computer friendly name locally for all printers on that computer (saves on blur)
  const handleComputerNameChange = useCallback((computerName: string, val: string) => {
    setPnPrinters(prev => {
      const updated = prev.map(p =>
        p.computer.name === computerName ? { ...p, computerFriendlyName: val } : p
      )
      setPnGrouped(rebuildGrouped(updated))
      return updated
    })
  }, [rebuildGrouped])

  // Save on blur (for any text input)
  const handleBlurSave = useCallback(() => {
    setPnPrinters(prev => {
      persistPrinters(prev)
      return prev
    })
  }, [persistPrinters])

  // Fetch a single weight reading (used by polling)
  const fetchScaleWeight = useCallback(async (computerId: number, deviceName: string, deviceNum: number) => {
    const key = `${computerId}-${deviceName}-${deviceNum}`
    try {
      const res = await fetch('/api/printnode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get-weight', computerId, deviceName, deviceNum }),
      })
      const data = await res.json()
      if (!res.ok) {
        setWeightReadings(prev => ({ ...prev, [key]: null }))
        return
      }
      setWeightReadings(prev => ({
        ...prev,
        [key]: {
          weight: data.weight,
          rawValue: data.rawValue,
          unit: data.unit,
          massOz: data.massOz,
          ageOfData: data.ageOfData,
        },
      }))
    } catch {
      // Silently fail during polling -- don't spam error messages
    }
  }, [])

  // Toggle live polling for a specific scale
  const toggleScalePolling = useCallback((computerId: number, deviceName: string, deviceNum: number) => {
    const key = `${computerId}-${deviceName}-${deviceNum}`

    setPollingScales(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        // Stop polling
        next.delete(key)
        if (pollingIntervalsRef.current[key]) {
          clearInterval(pollingIntervalsRef.current[key])
          delete pollingIntervalsRef.current[key]
        }
      } else {
        // Start polling: immediate fetch + interval
        next.add(key)
        fetchScaleWeight(computerId, deviceName, deviceNum)
        pollingIntervalsRef.current[key] = setInterval(() => {
          fetchScaleWeight(computerId, deviceName, deviceNum)
        }, 500)
      }
      return next
    })
  }, [fetchScaleWeight])

  // Cleanup all polling intervals on unmount
  useEffect(() => {
    return () => {
      Object.values(pollingIntervalsRef.current).forEach(clearInterval)
      pollingIntervalsRef.current = {}
    }
  }, [])

  // Refresh scales list
  const handleRefreshScales = useCallback(async () => {
    setScalesLoading(true)
    try {
      const res = await fetch('/api/printnode?action=scales')
      const data = await res.json()
      const parsed: Record<number, ScaleInfo[]> = {}
      if (data.scales) {
        for (const [compId, scaleList] of Object.entries(data.scales)) {
          parsed[parseInt(compId, 10)] = scaleList as ScaleInfo[]
        }
      }
      setScales(parsed)
    } catch {
      // silently fail
    } finally {
      setScalesLoading(false)
    }
  }, [])

  // Update scale friendly name locally
  const handleScaleNameChange = useCallback((scaleKey: string, val: string) => {
    setScaleFriendlyNames(prev => ({ ...prev, [scaleKey]: val }))
  }, [])

  // Save scale friendly name to DB on blur
  const handleScaleNameBlur = useCallback(async (computerId: number, deviceName: string, deviceNum: number) => {
    const key = `${computerId}-${deviceName}-${deviceNum}`
    const friendlyName = scaleFriendlyNames[key] || ''
    try {
      await fetch('/api/printnode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save-scale-name', computerId, deviceName, deviceNum, friendlyName }),
      })
    } catch {
      // silently fail - non-critical
    }
  }, [scaleFriendlyNames])

  // Delete entire station (computer) with access code verification
  const handleDeleteStation = useCallback(async () => {
    if (!deleteTarget) return
    if (deleteCode !== '8989') {
      setDeleteError('Invalid access code')
      return
    }
    setDeleting(true)
    setDeleteError(null)
    try {
      const res = await fetch('/api/printnode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete-station',
          computerName: deleteTarget.computerName,
          computerId: deleteTarget.computerId,
          accessCode: deleteCode,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Delete failed')

      // Log the PrintNode API response for confirmation
      if (data.printNodeResponse) {
        console.log('[Delete Station] PrintNode API response:', data.printNodeResponse)
      }

      // Remove printers for this computer from local state
      setPnPrinters(prev => {
        const updated = prev.filter(p => p.computer.name !== deleteTarget.computerName)
        setPnGrouped(rebuildGrouped(updated))
        return updated
      })
      setPnMessage({ type: 'success', text: `Station "${deleteTarget.computerName}" deleted (${data.deleted} printer config(s) removed)` })
      setDeleteTarget(null)
      setDeleteCode('')
    } catch (err: any) {
      setDeleteError(err.message || 'Delete failed')
    } finally {
      setDeleting(false)
    }
  }, [deleteTarget, deleteCode, rebuildGrouped])

  // Toggle accordion for a station
  const toggleStation = useCallback((computerName: string) => {
    setExpandedStations(prev => {
      const next = new Set(prev)
      if (next.has(computerName)) next.delete(computerName)
      else next.add(computerName)
      return next
    })
  }, [])

  // Expand/collapse all
  const expandAll = useCallback(() => {
    setExpandedStations(new Set(Object.keys(pnGrouped)))
  }, [pnGrouped])

  const collapseAll = useCallback(() => {
    setExpandedStations(new Set())
  }, [])

  // Filter stations by search query (matches computer name, friendly name, or printer names)
  const filteredGrouped = useMemo(() => {
    if (!searchQuery.trim()) return pnGrouped
    const q = searchQuery.toLowerCase()
    const filtered: Record<string, PrintNodePrinter[]> = {}
    for (const [computerName, printers] of Object.entries(pnGrouped)) {
      const computerFriendly = printers[0]?.computerFriendlyName || ''
      const computerMatch = computerName.toLowerCase().includes(q) || computerFriendly.toLowerCase().includes(q)
      const matchingPrinters = printers.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.friendlyName || '').toLowerCase().includes(q)
      )
      if (computerMatch || matchingPrinters.length > 0) {
        filtered[computerName] = printers // Show all printers if computer or any printer matches
      }
    }
    return filtered
  }, [pnGrouped, searchQuery])

  const stationCount = Object.keys(pnGrouped).length
  const filteredCount = Object.keys(filteredGrouped).length

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Printers</h1>
        {autoSaveStatus === 'saving' && (
          <span className="text-xs text-gray-400 animate-pulse">Saving...</span>
        )}
        {autoSaveStatus === 'saved' && (
          <span className="text-xs text-green-600">Saved</span>
        )}
        {autoSaveStatus === 'error' && (
          <span className="text-xs text-red-600">Save failed</span>
        )}
      </div>

      <div className="bg-white rounded-lg shadow p-6 max-w-4xl">
        <p className="text-sm text-gray-500 mb-4">
          Connect to PrintNode for direct thermal label printing. Install the PrintNode desktop client on each shipping computer.
          Shippers will select their computer on the Cart Scan page to print labels.
          Changes save automatically.
        </p>

        {/* Connection Status */}
        <div className="flex items-center gap-2 mb-6">
          <div className={`w-3 h-3 rounded-full ${pnLoading ? 'bg-yellow-400' : pnConfigured ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className={`text-sm font-medium ${pnLoading ? 'text-yellow-600' : pnConfigured ? 'text-green-700' : 'text-red-600'}`}>
            {pnLoading
              ? 'Connecting to PrintNode...'
              : pnConfigured
                ? `Connected (${pnPrinters.length} printer${pnPrinters.length !== 1 ? 's' : ''} across ${Object.keys(pnGrouped).length} computer${Object.keys(pnGrouped).length !== 1 ? 's' : ''})`
                : 'Not configured — add PRINT_NODE to environment variables'}
          </span>
        </div>

        {pnMessage && (
          <div className={`mb-4 p-3 rounded-lg text-sm ${pnMessage.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
            {pnMessage.text}
            <button onClick={() => setPnMessage(null)} className="ml-2 underline">Dismiss</button>
          </div>
        )}

        {pnConfigured && !pnLoading && (
          <>
            {/* Search + Expand/Collapse controls */}
            {stationCount > 0 && (
              <div className="flex items-center gap-3 mb-4">
                <div className="relative flex-1">
                  <svg xmlns="http://www.w3.org/2000/svg" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                  </svg>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search stations or printers..."
                    className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={expandAll} className="px-2 py-1.5 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors" title="Expand all">
                    Expand All
                  </button>
                  <span className="text-gray-300">|</span>
                  <button onClick={collapseAll} className="px-2 py-1.5 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors" title="Collapse all">
                    Collapse All
                  </button>
                </div>
              </div>
            )}

            {searchQuery && filteredCount === 0 && (
              <div className="text-center text-sm text-gray-500 py-8">
                No stations or printers match &ldquo;{searchQuery}&rdquo;
              </div>
            )}

            {searchQuery && filteredCount > 0 && filteredCount < stationCount && (
              <div className="text-xs text-gray-400 mb-2">
                Showing {filteredCount} of {stationCount} station{stationCount !== 1 ? 's' : ''}
              </div>
            )}

            {Object.entries(filteredGrouped).map(([computerName, printers]) => {
              const computerState = printers[0]?.computer.state || 'unknown'
              const enabledCount = printers.filter((p) => p.enabled !== false).length
              const computerFriendlyName = printers[0]?.computerFriendlyName || ''
              const isExpanded = expandedStations.has(computerName)

              return (
                <div key={computerName} className="mb-3 border border-gray-200 rounded-lg overflow-hidden">
                  {/* Computer Header (clickable accordion) */}
                  <div
                    className="flex items-center gap-2 px-4 py-3 bg-gray-100 cursor-pointer select-none hover:bg-gray-150"
                    onClick={() => toggleStation(computerName)}
                  >
                    {/* Chevron */}
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className={`h-4 w-4 text-gray-500 shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                    </svg>

                    <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${computerState === 'connected' ? 'bg-green-500' : 'bg-gray-400'}`} />

                    {/* Editable computer display name (stop propagation so clicks don't toggle accordion) */}
                    <input
                      type="text"
                      value={computerFriendlyName}
                      onChange={(e) => handleComputerNameChange(computerName, e.target.value)}
                      onBlur={handleBlurSave}
                      onClick={(e) => e.stopPropagation()}
                      placeholder={computerName}
                      className="text-sm font-bold text-gray-800 bg-transparent border-b border-transparent hover:border-gray-400 focus:border-green-500 focus:outline-none px-0 py-0 w-48 placeholder:text-gray-800 placeholder:font-bold"
                      title={`PrintNode name: ${computerName}. Type to set a display name.`}
                    />

                    {computerFriendlyName && (
                      <span className="text-xs text-gray-400" title="Original PrintNode computer name">
                        ({computerName})
                      </span>
                    )}

                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      computerState === 'connected' ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'
                    }`}>
                      {computerState}
                    </span>
                    <span className="text-xs text-gray-500 ml-auto">
                      {enabledCount} of {printers.length} printer{printers.length !== 1 ? 's' : ''} enabled
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget({ computerName, computerId: printers[0]?.computer.id }); setDeleteCode(''); setDeleteError(null) }}
                      className="ml-2 p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors shrink-0"
                      title="Delete this station"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>

                  {/* Printer Rows + Scales (collapsible) */}
                  {isExpanded && (
                    <div>
                      <div className="divide-y divide-gray-100">
                        {printers.map((printer) => (
                          <div key={printer.id} className={`flex items-center gap-3 px-4 py-3 ${printer.enabled === false ? 'bg-gray-50 opacity-60' : 'bg-white'}`}>
                            <button
                              onClick={() => handleToggleEnabled(printer.id)}
                              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${
                                printer.enabled !== false ? 'bg-green-500' : 'bg-gray-300'
                              }`}
                              title={printer.enabled !== false ? 'Enabled (click to disable)' : 'Disabled (click to enable)'}
                            >
                              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                                printer.enabled !== false ? 'translate-x-4' : 'translate-x-1'
                              }`} />
                            </button>

                            <div className={`w-2 h-2 rounded-full shrink-0 ${printer.state === 'online' ? 'bg-green-500' : 'bg-gray-400'}`} />

                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-gray-900">{printer.name}</div>
                              <div className="text-xs text-gray-500">ID: {printer.id} &middot; {printer.state}</div>
                            </div>

                            <input
                              type="text"
                              placeholder="Friendly name..."
                              value={printer.friendlyName || ''}
                              onChange={(e) => handleFriendlyNameChange(printer.id, e.target.value)}
                              onBlur={handleBlurSave}
                              className="w-40 px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                            />

                            <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer shrink-0" title="Set as default printer for this computer">
                              <input
                                type="radio"
                                name={`default-${computerName}`}
                                checked={printer.isDefault === true}
                                onChange={() => handleSetDefault(printer.id, computerName)}
                                className="accent-green-600"
                              />
                              Default
                            </label>

                            <button
                              onClick={async () => {
                                setPnTestingId(printer.id)
                                setPnMessage(null)
                                try {
                                  const res = await fetch('/api/printnode', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ action: 'test-print', printerId: printer.id }),
                                  })
                                  const data = await res.json()
                                  if (!res.ok) throw new Error(data.error || 'Test print failed')
                                  setPnMessage({ type: 'success', text: `Test print sent to ${printer.name} (Job #${data.jobId})` })
                                } catch (err: any) {
                                  setPnMessage({ type: 'error', text: err.message || 'Test print failed' })
                                } finally {
                                  setPnTestingId(null)
                                }
                              }}
                              disabled={pnTestingId === printer.id}
                              className="px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors disabled:opacity-50 shrink-0"
                            >
                              {pnTestingId === printer.id ? 'Sending...' : 'Test Print'}
                            </button>
                          </div>
                        ))}
                      </div>

                      {/* Scales Section */}
                      {(() => {
                        const computerId = printers[0]?.computer.id
                        const computerScales = computerId ? (scales[computerId] || []) : []
                        return (
                          <div className="border-t border-gray-200 bg-amber-50/50 px-4 py-3">
                            <div className="flex items-center gap-2 mb-2">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-amber-600" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1.323l3.954 1.582 1.599-.8a1 1 0 01.894 1.79l-1.233.617 1.738 5.42a1 1 0 01-.285 1.05A3.989 3.989 0 0115 15a3.989 3.989 0 01-2.667-1.017 1 1 0 01-.285-1.05l1.715-5.349L10 6.022 6.237 7.584l1.715 5.349a1 1 0 01-.285 1.05A3.989 3.989 0 015 15a3.989 3.989 0 01-2.667-1.017 1 1 0 01-.285-1.05l1.738-5.42-1.233-.617a1 1 0 01.894-1.79l1.599.8L9 4.323V3a1 1 0 011-1zm-5 8.274l-.818 2.552c.25.112.526.174.818.174.292 0 .569-.062.818-.174L5 10.274zm10 0l-.818 2.552c.25.112.526.174.818.174.292 0 .569-.062.818-.174L15 10.274z" clipRule="evenodd" />
                              </svg>
                              <span className="text-xs font-bold text-amber-800">Scales</span>
                              {scalesLoading && (
                                <span className="text-xs text-amber-600 animate-pulse">Loading...</span>
                              )}
                              <button
                                onClick={handleRefreshScales}
                                disabled={scalesLoading}
                                className="ml-auto text-xs text-amber-600 hover:text-amber-800 hover:underline disabled:opacity-50"
                                title="Refresh scale data"
                              >
                                Refresh Scales
                              </button>
                            </div>

                            {computerScales.length === 0 ? (
                              <div className="text-xs text-gray-500 italic">
                                {computerState === 'connected'
                                  ? 'No active scales detected. Scale data is only available for ~45 seconds after a reading.'
                                  : 'Computer is disconnected — scales unavailable.'}
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {computerScales.map((scale) => {
                                  const scaleKey = `${computerId}-${scale.deviceName}-${scale.deviceNum}`
                                  const reading = weightReadings[scaleKey]

                                  // Parse the initial measurement from the scale list
                                  const initialMeasurement = scale.measurement || {}
                                  let initialWeight = ''
                                  if (initialMeasurement.oz !== undefined) {
                                    initialWeight = `${(initialMeasurement.oz / 1_000_000_000).toFixed(1)}oz`
                                  } else if (initialMeasurement.lb !== undefined) {
                                    initialWeight = `${(initialMeasurement.lb / 1_000_000_000).toFixed(2)}lb`
                                  } else if (initialMeasurement.g !== undefined) {
                                    initialWeight = `${(initialMeasurement.g / 1_000_000_000).toFixed(1)}g`
                                  } else if (initialMeasurement.kg !== undefined) {
                                    initialWeight = `${(initialMeasurement.kg / 1_000_000_000).toFixed(3)}kg`
                                  }

                                  const friendlyName = scaleFriendlyNames[scaleKey] || ''

                                  return (
                                    <div key={scaleKey} className="flex items-center gap-3 bg-white rounded-lg px-3 py-2 border border-amber-200">
                                      <div className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                          <input
                                            type="text"
                                            value={friendlyName}
                                            onChange={(e) => handleScaleNameChange(scaleKey, e.target.value)}
                                            onBlur={() => handleScaleNameBlur(computerId, scale.deviceName, scale.deviceNum)}
                                            placeholder={scale.deviceName}
                                            className="text-sm font-medium text-gray-900 bg-transparent border-b border-transparent hover:border-gray-400 focus:border-amber-500 focus:outline-none px-0 py-0 w-48 placeholder:text-gray-900 placeholder:font-medium"
                                            title={`PrintNode name: ${scale.deviceName}. Type to set a display name.`}
                                          />
                                          {friendlyName && (
                                            <span className="text-xs text-gray-400 truncate" title={scale.deviceName}>
                                              ({scale.deviceName.length > 30 ? scale.deviceName.slice(0, 30) + '...' : scale.deviceName})
                                            </span>
                                          )}
                                        </div>
                                        <div className="text-xs text-gray-500">
                                          {scale.vendor} &middot; Device #{scale.deviceNum}
                                        </div>
                                      </div>

                                      {/* Weight display */}
                                      <div className="text-right mr-2">
                                        {reading ? (
                                          <div>
                                            <span className={`text-lg font-bold ${pollingScales.has(scaleKey) ? 'text-green-700' : 'text-amber-700'}`}>{reading.weight}</span>
                                            <div className="text-xs text-gray-400">
                                              {pollingScales.has(scaleKey) ? 'live' : `${reading.ageOfData}ms ago`}
                                            </div>
                                          </div>
                                        ) : initialWeight ? (
                                          <div>
                                            <span className="text-sm font-medium text-gray-600">{initialWeight}</span>
                                            <div className="text-xs text-gray-400">cached</div>
                                          </div>
                                        ) : (
                                          <span className="text-xs text-gray-400">No reading</span>
                                        )}
                                      </div>

                                      <button
                                        onClick={() => toggleScalePolling(computerId, scale.deviceName, scale.deviceNum)}
                                        className={`px-3 py-1.5 text-xs font-medium border rounded-lg transition-colors shrink-0 flex items-center gap-1.5 ${
                                          pollingScales.has(scaleKey)
                                            ? 'text-green-700 bg-green-100 hover:bg-green-200 border-green-300'
                                            : 'text-amber-700 bg-amber-100 hover:bg-amber-200 border-amber-300'
                                        }`}
                                      >
                                        {pollingScales.has(scaleKey) && (
                                          <span className="relative flex h-2 w-2">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                                          </span>
                                        )}
                                        {pollingScales.has(scaleKey) ? 'LIVE' : 'Start Live'}
                                      </button>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )
                      })()}
                    </div>
                  )}
                </div>
              )
            })}
          </>
        )}
      </div>

      {/* Delete Station Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-600" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-gray-900">Delete Station</h2>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-red-800">
                You are about to permanently delete <span className="font-bold">{deleteTarget?.computerName}</span> and all its printer configurations.
                This action cannot be undone.
              </p>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Enter access code to confirm
              </label>
              <input
                type="password"
                value={deleteCode}
                onChange={(e) => { setDeleteCode(e.target.value); setDeleteError(null) }}
                onKeyDown={(e) => e.key === 'Enter' && handleDeleteStation()}
                placeholder="Access code"
                className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-red-500 focus:outline-none text-center text-lg tracking-widest"
                autoFocus
              />
              {deleteError && (
                <p className="text-sm text-red-600 mt-1">{deleteError}</p>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setDeleteTarget(null); setDeleteCode(''); setDeleteError(null) }}
                disabled={deleting}
                className="flex-1 py-2.5 bg-gray-100 text-gray-700 font-bold rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteStation}
                disabled={deleting || !deleteCode}
                className="flex-1 py-2.5 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete Station'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
