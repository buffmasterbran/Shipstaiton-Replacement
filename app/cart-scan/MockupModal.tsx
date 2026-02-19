'use client'

import { useState } from 'react'

export function MockupButton({ url }: { url: string }) {
  const [open, setOpen] = useState(false)

  if (!url) return null

  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(true) }}
        className="text-xs font-medium text-purple-600 hover:text-purple-800 bg-purple-50 hover:bg-purple-100 px-2 py-1 rounded transition-colors"
      >
        View Mockup
      </button>
      {open && <MockupModal url={url} onClose={() => setOpen(false)} />}
    </>
  )
}

function MockupModal({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <span className="font-bold text-gray-800">Engraving Mockup</span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <div className="p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt="Engraving mockup"
            className="w-full h-auto rounded-lg"
            onError={(e) => {
              (e.target as HTMLImageElement).src = ''
              ;(e.target as HTMLImageElement).alt = 'Failed to load mockup'
            }}
          />
        </div>
      </div>
    </div>
  )
}
