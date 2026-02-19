'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import {
  format,
  startOfDay,
  endOfDay,
  subDays,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  subMonths,
  addMonths,
  isSameDay,
  isSameMonth,
  isWithinInterval,
  isBefore,
  isAfter,
  getDaysInMonth,
  getDay,
} from 'date-fns'

interface DateRangePickerProps {
  startDate: string   // 'YYYY-MM-DD' or ''
  endDate: string     // 'YYYY-MM-DD' or ''
  onChangeStart: (d: string) => void
  onChangeEnd: (d: string) => void
}

interface Preset {
  label: string
  getRange: () => [Date, Date]
}

function parseDate(s: string): Date | null {
  if (!s) return null
  const d = new Date(s + 'T00:00:00')
  return isNaN(d.getTime()) ? null : d
}

function toStr(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

export default function DateRangePicker({ startDate, endDate, onChangeStart, onChangeEnd }: DateRangePickerProps) {
  const [open, setOpen] = useState(false)
  const [selecting, setSelecting] = useState<'start' | 'end' | null>(null)
  const [hovered, setHovered] = useState<Date | null>(null)
  const [viewMonth, setViewMonth] = useState(() => {
    const sd = parseDate(startDate)
    return sd || new Date()
  })
  const containerRef = useRef<HTMLDivElement>(null)

  const today = useMemo(() => startOfDay(new Date()), [])

  const presets: Preset[] = useMemo(() => [
    { label: 'Today', getRange: () => [today, today] },
    { label: 'Yesterday', getRange: () => { const y = subDays(today, 1); return [y, y] } },
    { label: 'Last 7 Days', getRange: () => [subDays(today, 6), today] },
    { label: 'Last 30 Days', getRange: () => [subDays(today, 29), today] },
    { label: 'This Week', getRange: () => [startOfWeek(today, { weekStartsOn: 0 }), endOfWeek(today, { weekStartsOn: 0 })] },
    { label: 'Last Week', getRange: () => { const s = subDays(startOfWeek(today, { weekStartsOn: 0 }), 7); return [s, subDays(startOfWeek(today, { weekStartsOn: 0 }), 1)] } },
    { label: 'This Month', getRange: () => [startOfMonth(today), endOfMonth(today)] },
    { label: 'Last Month', getRange: () => { const lm = subMonths(today, 1); return [startOfMonth(lm), endOfMonth(lm)] } },
  ], [today])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setSelecting(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Parse dates from string props (stable across renders via useMemo on strings)
  const sd = useMemo(() => parseDate(startDate), [startDate])
  const ed = useMemo(() => parseDate(endDate), [endDate])

  const handleDayClick = useCallback((day: Date) => {
    if (!selecting || selecting === 'start') {
      onChangeStart(toStr(day))
      onChangeEnd('')
      setSelecting('end')
    } else {
      const currentSd = parseDate(startDate)
      if (currentSd && isBefore(day, currentSd)) {
        onChangeStart(toStr(day))
        onChangeEnd(toStr(currentSd))
      } else {
        onChangeEnd(toStr(day))
      }
      setSelecting(null)
      setOpen(false)
    }
  }, [selecting, startDate, onChangeStart, onChangeEnd])

  const applyPreset = useCallback((preset: Preset) => {
    const [s, e] = preset.getRange()
    onChangeStart(toStr(s))
    onChangeEnd(toStr(e))
    setSelecting(null)
    setOpen(false)
  }, [onChangeStart, onChangeEnd])

  const clearDates = useCallback(() => {
    onChangeStart('')
    onChangeEnd('')
    setSelecting(null)
    setOpen(false)
  }, [onChangeStart, onChangeEnd])

  const displayText = useMemo(() => {
    if (sd && ed) {
      try {
        if (isSameDay(sd, ed)) return format(sd, 'MMM d, yyyy')
        if (sd.getFullYear() === ed.getFullYear()) {
          if (isSameMonth(sd, ed)) return `${format(sd, 'MMM d')} – ${format(ed, 'd, yyyy')}`
          return `${format(sd, 'MMM d')} – ${format(ed, 'MMM d, yyyy')}`
        }
        return `${format(sd, 'MMM d, yyyy')} – ${format(ed, 'MMM d, yyyy')}`
      } catch { return 'All dates' }
    }
    if (sd && !ed && selecting === 'end') {
      try { return `${format(sd, 'MMM d, yyyy')} – ...` } catch { return 'All dates' }
    }
    return 'All dates'
  }, [startDate, endDate, selecting]) // eslint-disable-line react-hooks/exhaustive-deps

  const activePreset = useMemo(() => {
    if (!sd || !ed) return null
    try {
      return presets.find(p => {
        const [ps, pe] = p.getRange()
        return isSameDay(sd, ps) && isSameDay(ed, pe)
      })?.label || null
    } catch { return null }
  }, [startDate, endDate, presets]) // eslint-disable-line react-hooks/exhaustive-deps

  const leftMonth = viewMonth
  const rightMonth = addMonths(viewMonth, 1)

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => { setOpen(!open); if (!open) setSelecting('start') }}
        className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-sm font-medium transition-colors ${
          sd || ed
            ? 'border-green-300 bg-green-50 text-green-800 hover:bg-green-100'
            : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
        }`}
      >
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span>{displayText}</span>
        {(sd || ed) && (
          <span
            onClick={(e) => { e.stopPropagation(); clearDates() }}
            className="ml-1 text-green-600 hover:text-green-800 cursor-pointer"
          >
            ✕
          </span>
        )}
      </button>

      {/* Popover */}
      {open && (
        <div className="absolute top-full left-0 mt-2 z-50 bg-white rounded-xl shadow-xl border border-gray-200 flex">
          {/* Presets Sidebar */}
          <div className="w-36 border-r border-gray-100 p-2 flex flex-col gap-0.5">
            <button
              onClick={clearDates}
              className={`text-left px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                !sd && !ed ? 'bg-green-100 text-green-800' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              All Dates
            </button>
            {presets.map(p => (
              <button
                key={p.label}
                onClick={() => applyPreset(p)}
                className={`text-left px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  activePreset === p.label ? 'bg-green-100 text-green-800' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Calendars */}
          <div className="p-3 flex gap-4">
            <CalendarMonth
              month={leftMonth}
              sd={sd}
              ed={ed}
              hovered={hovered}
              selecting={selecting}
              today={today}
              onDayClick={handleDayClick}
              onDayHover={setHovered}
              onPrev={() => setViewMonth(subMonths(viewMonth, 1))}
              showPrev
            />
            <CalendarMonth
              month={rightMonth}
              sd={sd}
              ed={ed}
              hovered={hovered}
              selecting={selecting}
              today={today}
              onDayClick={handleDayClick}
              onDayHover={setHovered}
              onNext={() => setViewMonth(addMonths(viewMonth, 1))}
              showNext
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Calendar Month Sub-component
// ============================================================================

interface CalendarMonthProps {
  month: Date
  sd: Date | null
  ed: Date | null
  hovered: Date | null
  selecting: 'start' | 'end' | null
  today: Date
  onDayClick: (d: Date) => void
  onDayHover: (d: Date | null) => void
  onPrev?: () => void
  onNext?: () => void
  showPrev?: boolean
  showNext?: boolean
}

const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

function safeWithinInterval(day: Date, start: Date, end: Date): boolean {
  try {
    if (isBefore(end, start)) return false
    return isWithinInterval(day, { start, end })
  } catch {
    return false
  }
}

function CalendarMonth({ month, sd, ed, hovered, selecting, today, onDayClick, onDayHover, onPrev, onNext, showPrev, showNext }: CalendarMonthProps) {
  const year = month.getFullYear()
  const mo = month.getMonth()
  const daysInMonth = getDaysInMonth(month)
  const startDow = getDay(new Date(year, mo, 1))

  const cells: (Date | null)[] = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, mo, d))

  const rangeEnd = selecting === 'end' && sd && hovered && isAfter(hovered, sd) ? hovered : ed

  return (
    <div className="w-[252px]">
      {/* Month Header */}
      <div className="flex items-center justify-between mb-2 px-1">
        {showPrev ? (
          <button onClick={onPrev} className="p-1 rounded hover:bg-gray-100 text-gray-500">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
        ) : <div className="w-6" />}
        <span className="text-sm font-semibold text-gray-800">{format(month, 'MMMM yyyy')}</span>
        {showNext ? (
          <button onClick={onNext} className="p-1 rounded hover:bg-gray-100 text-gray-500">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
        ) : <div className="w-6" />}
      </div>

      {/* DOW Headers */}
      <div className="grid grid-cols-7 mb-1">
        {DOW.map(d => (
          <div key={d} className="text-center text-[10px] font-medium text-gray-400 py-1">{d}</div>
        ))}
      </div>

      {/* Days Grid */}
      <div className="grid grid-cols-7">
        {cells.map((day, i) => {
          if (!day) return <div key={`blank-${i}`} className="h-8" />

          const isToday = isSameDay(day, today)
          const isStart = sd ? isSameDay(day, sd) : false
          const isEnd = rangeEnd ? isSameDay(day, rangeEnd) : false
          const inRange = sd && rangeEnd ? safeWithinInterval(day, startOfDay(sd), endOfDay(rangeEnd)) : false
          const isHoverRange = selecting === 'end' && sd && hovered && !ed && isAfter(hovered, sd)
            ? safeWithinInterval(day, startOfDay(sd), endOfDay(hovered))
            : false

          let bgClass: string
          if (isStart || isEnd) {
            bgClass = 'bg-green-600 text-white font-semibold'
          } else if (inRange) {
            bgClass = 'bg-green-100 text-green-900'
          } else if (isHoverRange) {
            bgClass = 'bg-green-50 text-green-800'
          } else if (isToday) {
            bgClass = 'text-green-600 font-semibold'
          } else {
            bgClass = 'text-gray-700 hover:bg-gray-100'
          }

          let spanClass = ''
          if (inRange && !isStart && !isEnd) {
            spanClass = 'before:absolute before:inset-y-0 before:left-0 before:right-0 before:bg-green-100 before:-z-10'
          }
          if (isStart && inRange && !isEnd) {
            spanClass = 'before:absolute before:inset-y-0 before:left-1/2 before:right-0 before:bg-green-100 before:-z-10'
          }
          if (isEnd && inRange && !isStart) {
            spanClass = 'before:absolute before:inset-y-0 before:left-0 before:right-1/2 before:bg-green-100 before:-z-10'
          }

          return (
            <div
              key={day.getTime()}
              className={`h-8 w-8 flex items-center justify-center text-xs cursor-pointer transition-colors relative rounded-full ${bgClass} ${spanClass}`}
              onClick={() => onDayClick(day)}
              onMouseEnter={() => onDayHover(day)}
              onMouseLeave={() => onDayHover(null)}
            >
              {day.getDate()}
            </div>
          )
        })}
      </div>
    </div>
  )
}
