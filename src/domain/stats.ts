import type { AppEvent, Phase, Segment, Subtask } from '../db/types'
import { HOUR, overlapMs, startOfDay, startOfNextDay } from './time'

/**
 * Completion events that a later reopen undid: a subtask_completed followed by a
 * subtask_reopened for the same step, or a project_completed followed by a
 * project_reopened for the same project. Counts should skip these, so a step that was
 * unticked and completed again counts once, at its final completion.
 */
export function undoneCompletions(events: readonly AppEvent[]): Set<AppEvent> {
  const ordered = [...events].sort((a, b) => a.ts - b.ts || (a.seq ?? 0) - (b.seq ?? 0))
  const lastStep = new Map<string, AppEvent>()
  const lastProject = new Map<string, AppEvent>()
  const undone = new Set<AppEvent>()
  for (const e of ordered) {
    if (e.type === 'subtask_completed' && e.subtaskId) lastStep.set(e.subtaskId, e)
    else if (e.type === 'project_completed' && e.projectId) lastProject.set(e.projectId, e)
    else if (e.type === 'subtask_reopened' && e.subtaskId) {
      const done = lastStep.get(e.subtaskId)
      if (done) undone.add(done)
      lastStep.delete(e.subtaskId)
    } else if (e.type === 'project_reopened' && e.projectId) {
      const done = lastProject.get(e.projectId)
      if (done) undone.add(done)
      lastProject.delete(e.projectId)
    }
  }
  return undone
}

export interface TodaySummary {
  subtasksCompleted: number
  projectsCompleted: number
  focusMs: number
}

export function todaySummary(
  segments: readonly Segment[],
  events: readonly AppEvent[],
  now: number,
): TodaySummary {
  const from = startOfDay(now)
  const to = startOfNextDay(now)
  let focusMs = 0
  for (const s of segments) if (s.kind === 'work') focusMs += overlapMs(s, from, to, now)
  const undone = undoneCompletions(events)
  const inDay = events.filter((e) => e.ts >= from && e.ts < to && !undone.has(e))
  return {
    subtasksCompleted: inDay.filter((e) => e.type === 'subtask_completed').length,
    projectsCompleted: inDay.filter((e) => e.type === 'project_completed').length,
    focusMs,
  }
}

export interface WeekSummary {
  start: number
  end: number
  totalWorkMs: number
  totalBreakMs: number
  /** Work ms per local day, keyed by YYYY-MM-DD. */
  workByDay: Record<string, number>
  /** Work ms per subtask phase ("none" when unset). */
  workByPhase: Record<Phase | 'none', number>
  /** Work ms per local hour of day, index 0-23. */
  workByHour: number[]
  subtasksCompleted: number
  projectsCompleted: number
  breaks: number
  breakPromptsShown: number
  snoozes: number
  challenges: { beat: number; timeUp: number; cancelled: number }
}

function dayKey(ts: number): string {
  const d = new Date(ts)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** Splits [from, to) into pieces at local hour boundaries. */
function hourPieces(from: number, to: number): { hour: number; day: string; ms: number }[] {
  const pieces: { hour: number; day: string; ms: number }[] = []
  let t = from
  while (t < to) {
    const d = new Date(t)
    d.setMinutes(0, 0, 0)
    const nextHour = Math.min(d.getTime() + HOUR, to)
    pieces.push({ hour: new Date(t).getHours(), day: dayKey(t), ms: nextHour - t })
    t = nextHour
  }
  return pieces
}

/**
 * Totals for the window [start, end): work by day, phase and hour of day, break counts,
 * snooze counts and challenge outcomes. Segments are clipped to the window. Pass events up
 * to now (not just to `end`), so completions reopened after the window are still skipped.
 */
export function summariseWeek(
  data: { segments: readonly Segment[]; events: readonly AppEvent[]; subtasks: readonly Subtask[] },
  start: number,
  end: number,
  now: number = Date.now(),
): WeekSummary {
  const phaseOf = new Map(data.subtasks.map((s) => [s.id, s.phase]))
  const summary: WeekSummary = {
    start,
    end,
    totalWorkMs: 0,
    totalBreakMs: 0,
    workByDay: {},
    workByPhase: { understand: 0, investigate: 0, implement: 0, test: 0, review: 0, deploy: 0, other: 0, none: 0 },
    workByHour: Array.from({ length: 24 }, () => 0),
    subtasksCompleted: 0,
    projectsCompleted: 0,
    breaks: 0,
    breakPromptsShown: 0,
    snoozes: 0,
    challenges: { beat: 0, timeUp: 0, cancelled: 0 },
  }

  for (const seg of data.segments) {
    const from = Math.max(seg.startedAt, start)
    const to = Math.min(seg.endedAt ?? now, end)
    if (to <= from) continue
    if (seg.kind === 'break') {
      summary.totalBreakMs += to - from
      continue
    }
    summary.totalWorkMs += to - from
    const phase = (seg.subtaskId && phaseOf.get(seg.subtaskId)) || 'none'
    summary.workByPhase[phase] += to - from
    for (const piece of hourPieces(from, to)) {
      summary.workByHour[piece.hour] += piece.ms
      summary.workByDay[piece.day] = (summary.workByDay[piece.day] ?? 0) + piece.ms
    }
  }

  const undone = undoneCompletions(data.events)
  for (const e of data.events) {
    if (e.ts < start || e.ts >= end || undone.has(e)) continue
    switch (e.type) {
      case 'subtask_completed':
        summary.subtasksCompleted++
        break
      case 'project_completed':
        summary.projectsCompleted++
        break
      case 'break_started':
        summary.breaks++
        break
      case 'break_prompt_shown':
        summary.breakPromptsShown++
        break
      case 'break_prompt_snoozed':
        summary.snoozes++
        break
      case 'challenge_ended': {
        const outcome = e.data?.outcome
        if (outcome === 'beat' || outcome === 'timeUp' || outcome === 'cancelled') summary.challenges[outcome]++
        break
      }
      default:
        break
    }
  }
  return summary
}
