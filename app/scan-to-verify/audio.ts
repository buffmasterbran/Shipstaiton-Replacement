// ---------------------------------------------------------------------------
// Audio helpers
// ---------------------------------------------------------------------------

function playBeep(frequency: number, duration: number, type: OscillatorType = 'sine') {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.value = frequency
    gain.gain.value = 0.3
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
    osc.stop(ctx.currentTime + duration)
  } catch {
    // Silently fail
  }
}

export function playSuccessSound() {
  playBeep(880, 0.1)
  setTimeout(() => playBeep(1320, 0.15), 100)
}

export function playErrorSound() {
  playBeep(200, 0.3, 'sawtooth')
  setTimeout(() => playBeep(150, 0.3, 'sawtooth'), 150)
}

export function playAllVerifiedSound() {
  playBeep(660, 0.12)
  setTimeout(() => playBeep(880, 0.12), 120)
  setTimeout(() => playBeep(1100, 0.2), 240)
}
