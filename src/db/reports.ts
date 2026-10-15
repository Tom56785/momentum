import { summariseWeek, type WeekSummary } from '../domain/stats'
import { db } from './db'
import { getSession } from './store'
import type { Segment } from './types'

/**
 * Segments that overlap [from, to), however long ago they started: closed ones that ended
 * after `from`, plus the session's open segment. Uses the endedAt index, so it stays cheap.
 */
export async function segmentsOverlapping(from: number, to: number): Promise<Segment[]> {
  const closed = await db.segments
    .where('endedAt')
    .above(from)
    .filter((s) => s.startedAt < to)
    .toArray()
  const session = await getSession()
  const open = session.openSegmentId ? await db.segments.get(session.openSegmentId) : undefined
  if (open && open.endedAt === undefined && open.startedAt < to) closed.push(open)
  return closed
}

/**
 * Loads the data for [start, end) and summarises it. Not shown in the v1 UI; it exists so
 * later reports (and the backup export) can build on the same numbers.
 */
export async function loadWeekSummary(start: number, end: number): Promise<WeekSummary> {
  const segments = await segmentsOverlapping(start, end)
  // Events after the window too, so completions reopened later are not counted.
  const events = await db.events.where('ts').aboveOrEqual(start).toArray()
  const subtasks = await db.subtasks.toArray()
  return summariseWeek({ segments, events, subtasks }, start, end)
}
