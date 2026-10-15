import type { AppEvent, Challenge, Segment, Session, Settings, Subtask } from '../db/types'
import { HOUR, MINUTE } from './time'

// ---- Break prompts ----

export function continuousWorkMs(session: Session, now: number): number {
  if (session.state !== 'working' || session.continuousWorkSince === undefined) return 0
  return Math.max(0, now - session.continuousWorkSince)
}

export function shouldShowBreakPrompt(
  session: Session,
  settings: Pick<Settings, 'breakPromptsEnabled' | 'workIntervalMinutes'>,
  now: number,
): boolean {
  if (!settings.breakPromptsEnabled) return false
  if (session.state !== 'working' || session.continuousWorkSince === undefined) return false
  if (now - session.continuousWorkSince < settings.workIntervalMinutes * MINUTE) return false
  return now >= (session.breakPromptSnoozedUntil ?? 0)
}

/** True once the suggested break length has passed. */
export function isBreakOver(breakStartedAt: number, breakMinutes: number, now: number): boolean {
  return now - breakStartedAt >= breakMinutes * MINUTE
}

// ---- Timeboxes ----

/** Time left on a timebox; never below zero. Undefined when there is no timebox. */
export function timeboxLeftMs(timeboxMinutes: number | undefined, subtaskWorkMs: number): number | undefined {
  if (!timeboxMinutes) return undefined
  return Math.max(0, timeboxMinutes * MINUTE - subtaskWorkMs)
}

/**
 * Whether to fire the one-time "nearly at your timebox" prompt: work is running on the
 * subtask, it has crossed the threshold, time is not yet up, and it was not prompted before.
 */
export function shouldPromptTimebox(args: {
  session: Session
  subtask: Pick<Subtask, 'id' | 'timeboxMinutes'>
  subtaskWorkMs: number
  thresholdMinutes: number
  challengeActive: boolean
}): boolean {
  const { session, subtask, subtaskWorkMs, thresholdMinutes, challengeActive } = args
  if (challengeActive) return false
  if (session.state !== 'working' || session.subtaskId !== subtask.id) return false
  if (!subtask.timeboxMinutes || subtask.timeboxMinutes <= thresholdMinutes) return false
  if (session.timeboxPromptShownFor?.includes(subtask.id)) return false
  const left = timeboxLeftMs(subtask.timeboxMinutes, subtaskWorkMs) ?? 0
  return left > 0 && left <= thresholdMinutes * MINUTE
}

// ---- Challenges ----

/** Work time spent during the challenge. Paused time does not count. */
export function challengeElapsedMs(challenge: Challenge, subtaskWorkMsNow: number): number {
  return Math.max(0, subtaskWorkMsNow - challenge.workMsAtStart)
}

export function challengeLeftMs(challenge: Challenge, subtaskWorkMsNow: number): number {
  return Math.max(0, challenge.targetMinutes * MINUTE - challengeElapsedMs(challenge, subtaskWorkMsNow))
}

export function isChallengeTimeUp(challenge: Challenge, subtaskWorkMsNow: number): boolean {
  return challengeLeftMs(challenge, subtaskWorkMsNow) <= 0
}

/** Minutes for a "beat my timebox" challenge, or undefined if there is no time left to beat. */
export function beatTimeboxMinutes(timeboxMinutes: number | undefined, subtaskWorkMs: number): number | undefined {
  const left = timeboxLeftMs(timeboxMinutes, subtaskWorkMs)
  if (!left) return undefined
  return Math.max(1, Math.ceil(left / MINUTE))
}

// ---- Stale sessions ----

export const STALE_AFTER_MS = 4 * HOUR

export function isStaleSession(session: Session, openSegment: Segment | undefined, now: number): boolean {
  if (session.state !== 'working' || !openSegment || openSegment.endedAt !== undefined) return false
  if (session.staleResolvedFor === openSegment.id) return false
  return now - openSegment.startedAt > STALE_AFTER_MS
}

/** Events the app logs by itself (on load or on a timer); they are not evidence the user was working. */
const PASSIVE_EVENTS: ReadonlySet<AppEvent['type']> = new Set([
  'focus_entered',
  'breadcrumb_shown',
  'break_prompt_shown',
  'timebox_prompt_shown',
  'stale_session_resolved',
])

function isPassive(e: Pick<AppEvent, 'type' | 'data'>): boolean {
  // A challenge running out is logged by a timer, not by the user.
  if (e.type === 'challenge_ended' && e.data?.outcome === 'timeUp') return true
  return PASSIVE_EVENTS.has(e.type)
}

/** When to end a stale segment: the last user activity, never before the segment began. */
export function staleEndTime(openSegment: Segment, events: readonly Pick<AppEvent, 'ts' | 'type' | 'data'>[]): number {
  let last = openSegment.startedAt
  for (const e of events) if (e.ts > last && !isPassive(e)) last = e.ts
  return last
}

// ---- Subtask chain ----

export function sortByOrder<T extends { order: number }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.order - b.order)
}

/** Next incomplete subtask after `currentId` in chain order, wrapping to earlier ones. */
export function nextTodo(subtasks: readonly Subtask[], currentId?: string): Subtask | undefined {
  const sorted = sortByOrder(subtasks)
  const idx = currentId ? sorted.findIndex((s) => s.id === currentId) : -1
  const after = sorted.slice(idx + 1).find((s) => s.status === 'todo' && s.id !== currentId)
  return after ?? sorted.find((s) => s.status === 'todo' && s.id !== currentId)
}

export function firstTodo(subtasks: readonly Subtask[]): Subtask | undefined {
  return sortByOrder(subtasks).find((s) => s.status === 'todo')
}

/** Neighbouring incomplete subtask in the given direction, without wrapping. */
export function adjacentTodo(subtasks: readonly Subtask[], currentId: string | undefined, dir: 1 | -1): Subtask | undefined {
  const todos = sortByOrder(subtasks).filter((s) => s.status === 'todo' || s.id === currentId)
  const idx = todos.findIndex((s) => s.id === currentId)
  if (idx === -1) return undefined
  const candidate = todos[idx + dir]
  return candidate?.status === 'todo' ? candidate : undefined
}

export function progress(subtasks: readonly Pick<Subtask, 'status'>[]): { done: number; total: number; ratio: number } {
  const total = subtasks.length
  const done = subtasks.filter((s) => s.status === 'done').length
  const ratio = total === 0 ? 0 : Math.min(1, Math.max(0, done / total))
  return { done, total, ratio }
}

// ---- Finishing early ----

/** Time to spare when a step is completed inside its timebox, or undefined if not early. */
export function earlyFinishMs(timeboxMinutes: number | undefined, subtaskWorkMs: number): number | undefined {
  // A step completed without any tracked work isn't "early"; we just don't know.
  if (subtaskWorkMs <= 0) return undefined
  const left = timeboxLeftMs(timeboxMinutes, subtaskWorkMs)
  return left !== undefined && left > 0 ? left : undefined
}

export function earlyFinishMessage(spareMs: number): string {
  const minutes = Math.floor(spareMs / MINUTE)
  if (minutes < 1) return 'Done just inside your timebox'
  return `Done with ${minutes} min to spare`
}
