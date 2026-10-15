import { summariseWeek, type WeekSummary } from '../domain/stats'
import { DAY } from '../domain/time'
import { db } from './db'

/**
 * Loads the data for [start, end) and summarises it. Not shown in the v1 UI; it exists so
 * later reports (and the backup export) can build on the same numbers.
 */
export async function loadWeekSummary(start: number, end: number): Promise<WeekSummary> {
  // Segments that began up to a day before the window may still overlap it.
  const segments = await db.segments.where('startedAt').between(start - DAY, end, true, false).toArray()
  const events = await db.events.where('ts').between(start, end, true, false).toArray()
  const subtasks = await db.subtasks.toArray()
  return summariseWeek({ segments, events, subtasks }, start, end)
}
