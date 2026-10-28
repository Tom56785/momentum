import type { AppEvent, Segment, Session } from '../db/types'
import { continuousWorkMs } from './rules'
import { MINUTE } from './time'

export type Via = 'focus' | 'globalBar' | 'shortcut' | 'exitDialog' | 'prompt' | 'button' | 'staleSession'

export type SessionAction =
  /** Start work on the given (or current) subtask. From a break this behaves like resume. */
  | { type: 'start'; projectId?: string; subtaskId?: string }
  | { type: 'stop' }
  /**
   * The current subtask was completed; continue on `nextSubtaskId` if any. Work on it
   * counts from `startNextAt` when given (after the finished step's celebration moment).
   */
  | { type: 'complete'; nextSubtaskId?: string; startNextAt?: number }
  | { type: 'switch'; subtaskId: string }
  /** Point the session at a project (entering focus). Never starts the timer. */
  | { type: 'target'; projectId: string; subtaskId?: string }
  | { type: 'startBreak' }
  | { type: 'resume' }
  /** Exit focus and stop the timer: close whatever is open. */
  | { type: 'exitStop' }
  /** Forget the session entirely (hides the global timer bar). */
  | { type: 'clear' }
  | { type: 'breakPromptShown' }
  | { type: 'snooze'; snoozeMinutes: number }
  | { type: 'timeboxPromptShown'; subtaskId: string }
  /** Stale session answer: end the open work segment at `endAt`. */
  | { type: 'endStale'; endAt: number }
  | { type: 'keepStale' }

export interface TransitionContext {
  now: number
  breakMinutes: number
  newId: () => string
  /** The currently open segment, if any (used for break lengths). */
  openSegment?: Segment
  via?: Via
}

export type NewEvent = Omit<AppEvent, 'seq'>

export interface Transition {
  session: Session
  /** Close every open segment at this time before opening a new one. */
  closeAt?: number
  open?: Segment
  events: NewEvent[]
}

function workSegment(ctx: TransitionContext, projectId: string, subtaskId: string): Segment {
  return { id: ctx.newId(), kind: 'work', projectId, subtaskId, startedAt: ctx.now }
}

function breakSegment(ctx: TransitionContext): Segment {
  return { id: ctx.newId(), kind: 'break', startedAt: ctx.now }
}

/** The session after the open segment closes at `at` and nothing new opens. */
function paused(s: Session, at: number): Session {
  return { ...s, state: 'paused', openSegmentId: undefined, lastStoppedAt: at }
}

/** Fields reset whenever an unbroken stretch of work ends. */
function resetContinuity(s: Session): Session {
  return {
    ...s,
    continuousWorkSince: undefined,
    breakPromptSnoozedUntil: undefined,
    breakPromptShownAt: undefined,
  }
}

/** Continuous-work start when (re)starting work: a pause of at least the break length counts as a break. */
function continuityOnStart(s: Session, ctx: TransitionContext): Session {
  const pausedLongEnough =
    s.lastStoppedAt !== undefined && ctx.now - s.lastStoppedAt >= ctx.breakMinutes * MINUTE
  if (pausedLongEnough || s.continuousWorkSince === undefined) {
    return { ...resetContinuity(s), continuousWorkSince: ctx.now }
  }
  return s
}

function breakMs(ctx: TransitionContext): number | undefined {
  const seg = ctx.openSegment
  return seg?.kind === 'break' ? Math.max(0, ctx.now - seg.startedAt) : undefined
}

function ev(
  ctx: TransitionContext,
  type: NewEvent['type'],
  s: Session,
  data?: Record<string, unknown>,
  ts = ctx.now,
): NewEvent {
  return { ts, type, projectId: s.projectId, subtaskId: s.subtaskId, data }
}

/**
 * Pure session state machine. Takes the current session and an action and returns the
 * new session plus the segment changes and events the caller must persist atomically.
 */
export function transition(session: Session, action: SessionAction, ctx: TransitionContext): Transition {
  const s = session
  const via = ctx.via ?? 'focus'
  const same: Transition = { session: s, events: [] }

  switch (action.type) {
    case 'start': {
      const projectId = action.projectId ?? s.projectId
      const subtaskId = action.subtaskId ?? s.subtaskId
      if (!projectId || !subtaskId) return same
      if (s.state === 'break') {
        return transition({ ...s, projectId, subtaskId }, { type: 'resume' }, ctx)
      }
      if (s.state === 'working') {
        if (s.projectId === projectId && s.subtaskId === subtaskId) return same
        const open = workSegment(ctx, projectId, subtaskId)
        return { session: { ...s, projectId, subtaskId, openSegmentId: open.id }, closeAt: ctx.now, open, events: [] }
      }
      const open = workSegment(ctx, projectId, subtaskId)
      const next: Session = {
        ...continuityOnStart(s, ctx),
        state: 'working',
        projectId,
        subtaskId,
        openSegmentId: open.id,
        lastStoppedAt: undefined,
      }
      return { session: next, closeAt: ctx.now, open, events: [ev(ctx, 'work_started', next, { via })] }
    }

    case 'stop': {
      if (s.state !== 'working') return same
      return { session: paused(s, ctx.now), closeAt: ctx.now, events: [ev(ctx, 'work_stopped', s, { via })] }
    }

    case 'complete': {
      if (s.state === 'working') {
        if (action.nextSubtaskId && s.projectId) {
          // A segment starting later counts nothing until then, and closes empty if left sooner.
          const open = {
            ...workSegment(ctx, s.projectId, action.nextSubtaskId),
            startedAt: Math.max(ctx.now, action.startNextAt ?? ctx.now),
          }
          const next: Session = { ...s, subtaskId: action.nextSubtaskId, openSegmentId: open.id }
          return { session: next, closeAt: ctx.now, open, events: [] }
        }
        // Nothing left: stop, and stop pointing at the finished step.
        return {
          session: { ...paused(s, ctx.now), subtaskId: undefined },
          closeAt: ctx.now,
          events: [ev(ctx, 'work_stopped', s, { via })],
        }
      }
      return { session: { ...s, subtaskId: action.nextSubtaskId }, events: [] }
    }

    case 'switch': {
      if (action.subtaskId === s.subtaskId) return same
      const events = [ev(ctx, 'subtask_switched', { ...s, subtaskId: action.subtaskId }, { fromSubtaskId: s.subtaskId })]
      if (s.state === 'working' && s.projectId) {
        const open = workSegment(ctx, s.projectId, action.subtaskId)
        return {
          session: { ...s, subtaskId: action.subtaskId, openSegmentId: open.id },
          closeAt: ctx.now,
          open,
          events,
        }
      }
      return { session: { ...s, subtaskId: action.subtaskId }, events }
    }

    case 'target': {
      if (s.projectId === action.projectId) {
        // Same project: keep the running subtask; otherwise move to the requested one
        // (or to none, when every step is done).
        if (s.state === 'working' || s.state === 'break' || s.subtaskId === action.subtaskId) return same
        return { session: { ...s, subtaskId: action.subtaskId }, events: [] }
      }
      const base: Session = { ...s, projectId: action.projectId, subtaskId: action.subtaskId }
      if (s.state === 'working') {
        return { session: paused(base, ctx.now), closeAt: ctx.now, events: [ev(ctx, 'work_stopped', s, { via })] }
      }
      if (s.state === 'break') {
        return {
          session: paused(base, ctx.now),
          closeAt: ctx.now,
          events: [ev(ctx, 'break_ended', s, { via, breakMs: breakMs(ctx) })],
        }
      }
      return { session: base, events: [] }
    }

    case 'startBreak': {
      if (s.state === 'break') return same
      const open = breakSegment(ctx)
      const events: NewEvent[] = []
      if (s.state === 'working') events.push(ev(ctx, 'work_stopped', s, { via }))
      const next: Session = {
        ...resetContinuity(s),
        state: 'break',
        openSegmentId: open.id,
        lastStoppedAt: undefined,
      }
      events.push(ev(ctx, 'break_started', next, { via }))
      return { session: next, closeAt: ctx.now, open, events }
    }

    case 'resume': {
      if (s.state !== 'break') return same
      const events: NewEvent[] = [ev(ctx, 'break_ended', s, { via, breakMs: breakMs(ctx) })]
      if (!s.projectId || !s.subtaskId) {
        return { session: paused(s, ctx.now), closeAt: ctx.now, events }
      }
      const open = workSegment(ctx, s.projectId, s.subtaskId)
      const next: Session = {
        ...resetContinuity(s),
        state: 'working',
        openSegmentId: open.id,
        continuousWorkSince: ctx.now,
        lastStoppedAt: undefined,
      }
      events.push(ev(ctx, 'work_started', next, { via }))
      return { session: next, closeAt: ctx.now, open, events }
    }

    case 'exitStop': {
      if (s.state === 'working') return transition(s, { type: 'stop' }, ctx)
      if (s.state === 'break') {
        return {
          session: paused(s, ctx.now),
          closeAt: ctx.now,
          events: [ev(ctx, 'break_ended', s, { via, breakMs: breakMs(ctx) })],
        }
      }
      return same
    }

    case 'clear': {
      const events: NewEvent[] = []
      if (s.state === 'working') events.push(ev(ctx, 'work_stopped', s, { via }))
      if (s.state === 'break') events.push(ev(ctx, 'break_ended', s, { via, breakMs: breakMs(ctx) }))
      return { session: { state: 'idle' }, closeAt: s.state === 'idle' ? undefined : ctx.now, events }
    }

    case 'breakPromptShown': {
      if (s.breakPromptShownAt !== undefined) return same
      return {
        session: { ...s, breakPromptShownAt: ctx.now },
        events: [ev(ctx, 'break_prompt_shown', s, { continuousWorkMs: continuousWorkMs(s, ctx.now) })],
      }
    }

    case 'snooze': {
      return {
        session: {
          ...s,
          breakPromptSnoozedUntil: ctx.now + action.snoozeMinutes * MINUTE,
          breakPromptShownAt: undefined,
        },
        events: [ev(ctx, 'break_prompt_snoozed', s, { continuousWorkMs: continuousWorkMs(s, ctx.now) })],
      }
    }

    case 'timeboxPromptShown': {
      const shown = s.timeboxPromptShownFor ?? []
      if (shown.includes(action.subtaskId)) return same
      return { session: { ...s, timeboxPromptShownFor: [...shown, action.subtaskId] }, events: [] }
    }

    case 'endStale': {
      if (s.state !== 'working') return same
      return {
        session: paused(s, action.endAt),
        closeAt: action.endAt,
        events: [ev(ctx, 'work_stopped', s, { via: 'staleSession' }, action.endAt)],
      }
    }

    case 'keepStale': {
      return { session: { ...s, staleResolvedFor: s.openSegmentId }, events: [] }
    }
  }
}
