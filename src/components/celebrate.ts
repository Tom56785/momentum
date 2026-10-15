import confetti from 'canvas-confetti'
import { getSettings } from '../db/store'

const COLOURS = ['#7c8cff', '#4fc3a1', '#f0b56a', '#b59cff', '#7fd8ff']

function reducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

/** A soft two-note chime via Web Audio, only when sound is enabled in settings. */
export async function chime(kind: 'small' | 'big' | 'soft' = 'small'): Promise<void> {
  const settings = await getSettings()
  if (!settings.soundEnabled) return
  try {
    const ctx = new AudioContext()
    const notes = kind === 'big' ? [523.25, 659.25, 783.99] : kind === 'soft' ? [440, 554.37] : [587.33, 783.99]
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      const start = ctx.currentTime + i * 0.12
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(0.12, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.6)
      osc.connect(gain).connect(ctx.destination)
      osc.start(start)
      osc.stop(start + 0.65)
    })
    setTimeout(() => void ctx.close(), 1500)
  } catch {
    // Audio is a nice-to-have.
  }
}

/** Small burst from an element (or the centre) for completing a subtask. */
export function celebrateSmall(origin?: HTMLElement | null): void {
  void chime('small')
  if (reducedMotion()) return
  let x = 0.5
  let y = 0.6
  if (origin) {
    const r = origin.getBoundingClientRect()
    x = (r.left + r.width / 2) / window.innerWidth
    y = (r.top + r.height / 2) / window.innerHeight
  }
  void confetti({
    particleCount: 45,
    spread: 70,
    startVelocity: 28,
    gravity: 0.9,
    scalar: 0.8,
    ticks: 140,
    origin: { x, y },
    colors: COLOURS,
    disableForReducedMotion: true,
  })
}

/** Bigger, longer celebration for finishing a project or beating a challenge. */
export function celebrateBig(): void {
  void chime('big')
  if (reducedMotion()) return
  const end = Date.now() + 900
  const frame = () => {
    void confetti({ particleCount: 6, angle: 60, spread: 60, origin: { x: 0, y: 0.7 }, colors: COLOURS, disableForReducedMotion: true })
    void confetti({ particleCount: 6, angle: 120, spread: 60, origin: { x: 1, y: 0.7 }, colors: COLOURS, disableForReducedMotion: true })
    if (Date.now() < end) requestAnimationFrame(frame)
  }
  frame()
  void confetti({ particleCount: 120, spread: 100, startVelocity: 40, origin: { x: 0.5, y: 0.55 }, colors: COLOURS, disableForReducedMotion: true })
}
