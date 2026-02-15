import { useState, useEffect, useCallback, useRef } from 'react'

export function useTimer() {
  const [elapsed, setElapsed] = useState(0)
  const [running, setRunning] = useState(false)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  const start = useCallback(() => {
    setRunning(true)
    setElapsed(0)
  }, [])

  const pause = useCallback(() => setRunning(false), [])
  const resume = useCallback(() => setRunning(true), [])
  const reset = useCallback(() => { setRunning(false); setElapsed(0) }, [])

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => setElapsed(prev => prev + 1), 1000)
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [running])

  return { elapsed, running, start, pause, resume, reset }
}
