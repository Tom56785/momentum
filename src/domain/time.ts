import type { Segment } from '../db/types'

export const MINUTE = 60_000
export const HOUR = 60 * MINUTE
export const DAY = 24 * HOUR

/** Duration of a segment, with an open segment counted up to `now`. Never negative. */
export function segmentMs(segment: Pick<Segment, 'startedAt' | 'endedAt'>, now: number): number {
  const end = segment.endedAt ?? now
  return Math.max(0, end - segment.startedAt)
}

/** Sum of work time across segments, optionally filtered. */
export function workMs(
  segments: readonly Segment[],
  now: number,
  filter: (s: Segment) => boolean = () => true,
): number {
  let total = 0
  for (const s of segments) {
    if (s.kind === 'work' && filter(s)) total += segmentMs(s, now)
  }
  return total
}

/** Overlap in ms between a segment and the window [from, to). */
export function overlapMs(segment: Pick<Segment, 'startedAt' | 'endedAt'>, from: number, to: number, now: number): number {
  const start = Math.max(segment.startedAt, from)
  const end = Math.min(segment.endedAt ?? now, to)
  return Math.max(0, end - start)
}

export function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Local midnight at the start of the next calendar day. */
export function startOfNextDay(ts: number): number {
  const d = new Date(startOfDay(ts))
  d.setDate(d.getDate() + 1)
  return d.getTime()
}

/** Formats a duration as e.g. "1h 05m", "12m" or "45s". */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  if (m > 0) return `${m}m`
  return `${s}s`
}

/** Formats a duration as a clock, e.g. "1:05:09" or "4:07". */
export function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  const ss = String(s).padStart(2, '0')
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${ss}`
  return `${m}:${ss}`
}

/** Remaining time as friendly text, rounding up to whole minutes. */
export function formatMinutesLeft(ms: number): string {
  const minutes = Math.ceil(Math.max(0, ms) / MINUTE)
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return m ? `${h}h ${m}m left` : `${h}h left`
  }
  return `${minutes} min left`
}
