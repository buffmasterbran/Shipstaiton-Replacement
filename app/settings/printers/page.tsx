'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

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

export default function PrintersSettingsPage() {
  const [pnConfigured, setPnConfigured] = useState(false)
  const [pnPrinters, setPnPrinters] = useState<PrintNodePrinter[]>([])
  const [pnGrouped, setPnGrouped] = useState<Record<string, PrintNodePrinter[]>>({})
  const [pnLoading, setPnLoading] = useState(true)
  const [pnMessage, setPnMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [pnTestingId, setPnTestingId] = useState<number | null>(null)
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    fetch('/api/printnode?action=printers')
      .then(r => r.json())
      .then((data) => {
        setPnConfigured(data.configured || false)
        setPnPrinters(data.printers || [])
        setPnGrouped(data.grouped || {})
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
            {Object.entries(pnGrouped).map(([computerName, printers]) => {
              const computerState = printers[0]?.computer.state || 'unknown'
              const enabledCount = printers.filter((p) => p.enabled !== false).length
              // Get computer friendly name from any printer in this group (all share it)
              const computerFriendlyName = printers[0]?.computerFriendlyName || ''

              return (
                <div key={computerName} className="mb-6 border border-gray-200 rounded-lg overflow-hidden">
                  {/* Computer Header */}
                  <div className="flex items-center gap-2 px-4 py-3 bg-gray-100">
                    <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${computerState === 'connected' ? 'bg-green-500' : 'bg-gray-400'}`} />

                    {/* Editable computer display name */}
                    <input
                      type="text"
                      value={computerFriendlyName}
                      onChange={(e) => handleComputerNameChange(computerName, e.target.value)}
                      onBlur={handleBlurSave}
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
                  </div>

                  {/* Printer Rows */}
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
                </div>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}
