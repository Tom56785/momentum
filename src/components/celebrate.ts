import confetti from 'canvas-confetti'
import { getSettings } from '../db/store'

const COLOURS = ['#7c8cff', '#4fc3a1', '#f0b56a', '#b59cff', '#7fd8ff']

export function reducedMotion(): boolean {
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
  const { x, y } = originOf(origin)
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

function originOf(el?: HTMLElement | null): { x: number; y: number } {
  if (!el) return { x: 0.5, y: 0.6 }
  const r = el.getBoundingClientRect()
  return { x: (r.left + r.width / 2) / window.innerWidth, y: (r.top + r.height / 2) / window.innerHeight }
}

/** Finishing inside the timebox: a brighter, golden burst with stars, a step up from the normal one. */
export function celebrateEarly(origin?: HTMLElement | null): void {
  void chime('big')
  if (reducedMotion()) return
  const at = originOf(origin)
  const gold = ['#f0b56a', '#ffd88a', '#4fc3a1', '#7c8cff']
  void confetti({ particleCount: 70, spread: 90, startVelocity: 34, scalar: 0.9, ticks: 180, origin: at, colors: gold, disableForReducedMotion: true })
  setTimeout(() => {
    void confetti({ particleCount: 24, spread: 120, startVelocity: 24, scalar: 1.3, shapes: ['star'], ticks: 200, origin: at, colors: gold, disableForReducedMotion: true })
  }, 160)
}

/** Bigger, longer celebration for finishing a project or beating a challenge. */
export function celebrateBig(): void {
  void chime('big')
  if (reducedMotion()) return
  const end = Date.now() + 1200
  const frame = () => {
    void confetti({ particleCount: 6, angle: 60, spread: 60, origin: { x: 0, y: 0.7 }, colors: COLOURS, disableForReducedMotion: true })
    void confetti({ particleCount: 6, angle: 120, spread: 60, origin: { x: 1, y: 0.7 }, colors: COLOURS, disableForReducedMotion: true })
    if (Date.now() < end) requestAnimationFrame(frame)
  }
  frame()
  void confetti({ particleCount: 140, spread: 110, startVelocity: 42, origin: { x: 0.5, y: 0.5 }, colors: COLOURS, disableForReducedMotion: true })
  setTimeout(() => {
    void confetti({ particleCount: 40, spread: 140, startVelocity: 30, scalar: 1.3, shapes: ['star'], origin: { x: 0.5, y: 0.45 }, colors: COLOURS, disableForReducedMotion: true })
  }, 300)
}
