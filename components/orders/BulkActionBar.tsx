'use client'

import { useState, useRef, useEffect } from 'react'
import type { BoxConfig, CarrierService } from '@/hooks/useReferenceData'
import { RATE_SHOP_VALUE } from '@/components/ui/ServiceSelect'

interface BulkActionBarProps {
  count: number
  boxes: BoxConfig[]
  carrierServices: CarrierService[]
  progress: { done: number; total: number; action: string } | null
  onChangeBox: (boxId: string) => void
  onChangeService: (serviceCode: string) => void
  onGetRates: () => void
  onReingest: () => void
  onValidateAddresses: () => void
  onHold: () => void
  onDelete: () => void
  onClear: () => void
}

function DropdownPicker({ label, children, icon }: { label: string; children: React.ReactNode; icon?: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
      >
        {icon}
        {label}
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto min-w-[220px]">
          {children}
        </div>
      )}
    </div>
  )
}

export default function BulkActionBar({
  count, boxes, carrierServices, progress,
  onChangeBox, onChangeService, onGetRates, onReingest, onValidateAddresses, onHold, onDelete, onClear,
}: BulkActionBarProps) {
  const btnCls = 'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors'
  const isRunning = progress !== null

  return (
    <div className="bg-blue-50 border-b border-blue-200 px-4 py-2.5 flex items-center gap-2 flex-wrap">
      <span className="text-sm font-semibold text-blue-800">{count} selected</span>

      {progress && (
        <span className="text-xs text-blue-600 animate-pulse">
          {progress.action}... {progress.done}/{progress.total}
        </span>
      )}

      <div className="flex-1" />

      <DropdownPicker label="Change Box" icon={<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" /></svg>}>
        {boxes.map(b => (
          <button key={b.id} onClick={() => onChangeBox(b.id)} disabled={isRunning}
            className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50 transition-colors disabled:opacity-50">
            <span className="font-medium">{b.name}</span>
            <span className="text-gray-400 ml-1">({b.lengthInches}x{b.widthInches}x{b.heightInches})</span>
          </button>
        ))}
      </DropdownPicker>

      <DropdownPicker label="Change Service" icon={<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.125-.504 1.125-1.125v-1.5c0-1.036-.84-1.875-1.875-1.875H19.5m-12.75 0h12.75" /></svg>}>
        <button onClick={() => onChangeService(RATE_SHOP_VALUE)} disabled={isRunning}
          className="w-full text-left px-3 py-2 text-xs hover:bg-amber-50 transition-colors disabled:opacity-50 border-b border-gray-100">
          <span className="font-medium">⚡ Rate Shopping</span>
          <span className="text-gray-400 ml-1">(auto-select best rate)</span>
        </button>
        {(() => {
          const groups = new Map<string, { label: string; services: typeof carrierServices }>()
          const order: string[] = []
          for (const s of carrierServices) {
            let g = groups.get(s.carrierId)
            if (!g) {
              g = { label: s.accountNickname || s.carrierName, services: [] }
              groups.set(s.carrierId, g)
              order.push(s.carrierId)
            }
            g.services.push(s)
          }
          return order.map(id => {
            const g = groups.get(id)!
            return (
              <div key={id}>
                <div className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider bg-gray-50">{g.label}</div>
                {g.services.map(s => (
                  <button key={`${s.carrierId}:${s.serviceCode}`} onClick={() => onChangeService(s.serviceCode)} disabled={isRunning}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50 transition-colors disabled:opacity-50">
                    <span className="font-medium">{s.serviceName}</span>
                  </button>
                ))}
              </div>
            )
          })
        })()}
      </DropdownPicker>

      <button onClick={onGetRates} disabled={isRunning} className={`${btnCls} bg-green-100 text-green-700 border border-green-300 hover:bg-green-200 disabled:opacity-50`}>
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
        Get Rates
      </button>

      <button onClick={onReingest} disabled={isRunning} className={`${btnCls} bg-purple-100 text-purple-700 border border-purple-300 hover:bg-purple-200 disabled:opacity-50`}>
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" /></svg>
        Re-run Ingest
      </button>

      <button onClick={onValidateAddresses} disabled={isRunning} className={`${btnCls} bg-blue-100 text-blue-700 border border-blue-300 hover:bg-blue-200 disabled:opacity-50`}>
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
        Validate Addresses
      </button>

      <button onClick={onHold} disabled={isRunning} className={`${btnCls} bg-yellow-100 text-yellow-700 border border-yellow-300 hover:bg-yellow-200 disabled:opacity-50`}>
        Hold
      </button>

      <button onClick={onDelete} disabled={isRunning} className={`${btnCls} bg-red-100 text-red-700 border border-red-300 hover:bg-red-200 disabled:opacity-50`}>
        Delete
      </button>

      <button onClick={onClear} className="text-xs text-blue-600 hover:text-blue-800 underline ml-1">
        Clear
      </button>
    </div>
  )
}
