import { describe, expect, it } from 'vitest'
import type { Segment, Session } from '../db/types'
import { transition, type SessionAction, type TransitionContext } from './session'
import { MINUTE } from './time'

const T0 = 1_760_000_000_000

function ctx(now: number, extra: Partial<TransitionContext> = {}): TransitionContext {
  let n = 0
  return { now, breakMinutes: 5, newId: () => `seg-${++n}`, ...extra }
}

function run(session: Session, action: SessionAction, now: number, extra?: Partial<TransitionContext>) {
  return transition(session, action, ctx(now, extra))
}

const idle: Session = { state: 'idle' }

describe('session transitions', () => {
  it('start from idle opens a work segment and sets continuity', () => {
    const t = run(idle, { type: 'start', projectId: 'p', subtaskId: 's1' }, T0)
    expect(t.session.state).toBe('working')
    expect(t.open).toMatchObject({ kind: 'work', projectId: 'p', subtaskId: 's1', startedAt: T0 })
    expect(t.session.openSegmentId).toBe(t.open?.id)
    expect(t.session.continuousWorkSince).toBe(T0)
    expect(t.closeAt).toBe(T0) // always closes strays before opening
    expect(t.events.map((e) => e.type)).toEqual(['work_started'])
  })

  it('start without a target does nothing', () => {
    const t = run(idle, { type: 'start' }, T0)
    expect(t.session).toBe(idle)
    expect(t.open).toBeUndefined()
  })

  it('stop closes the segment and pauses', () => {
    const working = run(idle, { type: 'start', projectId: 'p', subtaskId: 's1' }, T0).session
    const t = run(working, { type: 'stop' }, T0 + 10 * MINUTE)
    expect(t.session.state).toBe('paused')
    expect(t.session.openSegmentId).toBeUndefined()
    expect(t.session.lastStoppedAt).toBe(T0 + 10 * MINUTE)
    expect(t.closeAt).toBe(T0 + 10 * MINUTE)
    expect(t.events.map((e) => e.type)).toEqual(['work_stopped'])
  })

  it('stop when not working is a no-op', () => {
    expect(run(idle, { type: 'stop' }, T0).session).toBe(idle)
  })

  it('completing mid-session moves the open segment to the next subtask', () => {
    const working = run(idle, { type: 'start', projectId: 'p', subtaskId: 's1' }, T0).session
    const t = run(working, { type: 'complete', nextSubtaskId: 's2' }, T0 + 7 * MINUTE)
    expect(t.session.state).toBe('working')
    expect(t.session.subtaskId).toBe('s2')
    expect(t.closeAt).toBe(T0 + 7 * MINUTE)
    expect(t.open).toMatchObject({ subtaskId: 's2', startedAt: T0 + 7 * MINUTE })
    expect(t.session.continuousWorkSince).toBe(T0) // continuity carries over
  })

  it('completing with a later start opens the next segment from then', () => {
    const working = run(idle, { type: 'start', projectId: 'p', subtaskId: 's1' }, T0).session
    const t = run(working, { type: 'complete', nextSubtaskId: 's2', startNextAt: T0 + 3000 }, T0)
    expect(t.closeAt).toBe(T0)
    expect(t.open).toMatchObject({ subtaskId: 's2', startedAt: T0 + 3000 })
  })

  it('completing the last subtask while working pauses and lets go of the finished step', () => {
    const working = run(idle, { type: 'start', projectId: 'p', subtaskId: 's1' }, T0).session
    const t = run(working, { type: 'complete' }, T0 + MINUTE)
    expect(t.session.state).toBe('paused')
    expect(t.session.subtaskId).toBeUndefined()
    expect(t.session.projectId).toBe('p')
    expect(t.open).toBeUndefined()
    expect(t.closeAt).toBe(T0 + MINUTE)
  })

  it('completing the last subtask while paused lets go of it too', () => {
    const paused: Session = { state: 'paused', projectId: 'p', subtaskId: 's1' }
    const t = run(paused, { type: 'complete' }, T0)
    expect(t.session.subtaskId).toBeUndefined()
    // ...so start has nothing to start on.
    expect(run(t.session, { type: 'start' }, T0).session).toBe(t.session)
  })

  it('targeting a project with no steps left clears a stale pointer', () => {
    const paused: Session = { state: 'paused', projectId: 'p', subtaskId: 'done-step' }
    expect(run(paused, { type: 'target', projectId: 'p' }, T0).session.subtaskId).toBeUndefined()
  })

  it('completing while paused just moves the pointer', () => {
    const paused: Session = { state: 'paused', projectId: 'p', subtaskId: 's1' }
    const t = run(paused, { type: 'complete', nextSubtaskId: 's2' }, T0)
    expect(t.session).toMatchObject({ state: 'paused', subtaskId: 's2' })
    expect(t.closeAt).toBeUndefined()
  })

  it('switching while working re-opens the segment on the new subtask', () => {
    const working = run(idle, { type: 'start', projectId: 'p', subtaskId: 's1' }, T0).session
    const t = run(working, { type: 'switch', subtaskId: 's3' }, T0 + MINUTE)
    expect(t.session.subtaskId).toBe('s3')
    expect(t.open?.subtaskId).toBe('s3')
    expect(t.events[0]).toMatchObject({ type: 'subtask_switched', data: { fromSubtaskId: 's1' } })
  })

  it('switching while paused changes the subtask without segments', () => {
    const paused: Session = { state: 'paused', projectId: 'p', subtaskId: 's1' }
    const t = run(paused, { type: 'switch', subtaskId: 's2' }, T0)
    expect(t.session.subtaskId).toBe('s2')
    expect(t.open).toBeUndefined()
    expect(t.closeAt).toBeUndefined()
  })

  it('break closes work, opens a break segment and clears continuity', () => {
    const working = run(idle, { type: 'start', projectId: 'p', subtaskId: 's1' }, T0).session
    const t = run(working, { type: 'startBreak' }, T0 + 25 * MINUTE, { via: 'prompt' })
    expect(t.session.state).toBe('break')
    expect(t.open).toMatchObject({ kind: 'break', startedAt: T0 + 25 * MINUTE })
    expect(t.open?.projectId).toBeUndefined()
    expect(t.session.continuousWorkSince).toBeUndefined()
    expect(t.events.map((e) => e.type)).toEqual(['work_stopped', 'break_started'])
    expect(t.events[1].data).toEqual({ via: 'prompt' })
  })

  it('resume closes the break and restarts work on the same subtask', () => {
    const onBreak: Session = { state: 'break', projectId: 'p', subtaskId: 's1', openSegmentId: 'b1' }
    const openSegment: Segment = { id: 'b1', kind: 'break', startedAt: T0 }
    const t = run(onBreak, { type: 'resume' }, T0 + 6 * MINUTE, { openSegment })
    expect(t.session.state).toBe('working')
    expect(t.open).toMatchObject({ kind: 'work', subtaskId: 's1' })
    expect(t.session.continuousWorkSince).toBe(T0 + 6 * MINUTE)
    expect(t.events[0]).toMatchObject({ type: 'break_ended', data: { breakMs: 6 * MINUTE } })
  })

  it('start during a break behaves like resume', () => {
    const onBreak: Session = { state: 'break', projectId: 'p', subtaskId: 's1' }
    const t = run(onBreak, { type: 'start' }, T0)
    expect(t.session.state).toBe('working')
    expect(t.events.map((e) => e.type)).toEqual(['break_ended', 'work_started'])
  })

  it('a short pause keeps continuous work going', () => {
    const working = run(idle, { type: 'start', projectId: 'p', subtaskId: 's1' }, T0).session
    const paused = run(working, { type: 'stop' }, T0 + 10 * MINUTE).session
    const t = run(paused, { type: 'start' }, T0 + 12 * MINUTE)
    expect(t.session.continuousWorkSince).toBe(T0)
  })

  it('a pause of at least the break length counts as a break', () => {
    const working = run(idle, { type: 'start', projectId: 'p', subtaskId: 's1' }, T0).session
    const snoozed = { ...working, breakPromptSnoozedUntil: T0 + 99 * MINUTE }
    const paused = run(snoozed, { type: 'stop' }, T0 + 10 * MINUTE).session
    const t = run(paused, { type: 'start' }, T0 + 15 * MINUTE)
    expect(t.session.continuousWorkSince).toBe(T0 + 15 * MINUTE)
    expect(t.session.breakPromptSnoozedUntil).toBeUndefined()
  })

  it('exit-stop closes whatever is open', () => {
    const working = run(idle, { type: 'start', projectId: 'p', subtaskId: 's1' }, T0).session
    expect(run(working, { type: 'exitStop' }, T0 + MINUTE).session.state).toBe('paused')
    const onBreak: Session = { state: 'break', projectId: 'p', subtaskId: 's1' }
    const t = run(onBreak, { type: 'exitStop' }, T0)
    expect(t.session.state).toBe('paused')
    expect(t.closeAt).toBe(T0)
  })

  it('targeting another project while working pauses instead of moving the timer', () => {
    const working = run(idle, { type: 'start', projectId: 'p', subtaskId: 's1' }, T0).session
    const t = run(working, { type: 'target', projectId: 'q', subtaskId: 'x1' }, T0 + MINUTE)
    expect(t.session).toMatchObject({ state: 'paused', projectId: 'q', subtaskId: 'x1' })
    expect(t.closeAt).toBe(T0 + MINUTE)
    expect(t.open).toBeUndefined()
  })

  it('targeting the running project keeps the timer on its subtask', () => {
    const working = run(idle, { type: 'start', projectId: 'p', subtaskId: 's1' }, T0).session
    const t = run(working, { type: 'target', projectId: 'p', subtaskId: 's2' }, T0)
    expect(t.session).toBe(working)
  })

  it('snooze sets the snooze time and logs it', () => {
    const working = run(idle, { type: 'start', projectId: 'p', subtaskId: 's1' }, T0).session
    const t = run(working, { type: 'snooze', snoozeMinutes: 10 }, T0 + 25 * MINUTE)
    expect(t.session.breakPromptSnoozedUntil).toBe(T0 + 35 * MINUTE)
    expect(t.events[0]).toMatchObject({ type: 'break_prompt_snoozed', data: { continuousWorkMs: 25 * MINUTE } })
  })

  it('break prompt shown is recorded once', () => {
    const working = run(idle, { type: 'start', projectId: 'p', subtaskId: 's1' }, T0).session
    const shown = run(working, { type: 'breakPromptShown' }, T0 + 25 * MINUTE)
    expect(shown.events).toHaveLength(1)
    expect(run(shown.session, { type: 'breakPromptShown' }, T0 + 26 * MINUTE).events).toHaveLength(0)
  })

  it('timebox prompt is recorded once per subtask', () => {
    const s1 = run(idle, { type: 'timeboxPromptShown', subtaskId: 'a' }, T0).session
    const s2 = run(s1, { type: 'timeboxPromptShown', subtaskId: 'a' }, T0)
    expect(s2.session).toBe(s1)
    expect(s1.timeboxPromptShownFor).toEqual(['a'])
  })

  it('stale sessions can be ended at the last activity or kept', () => {
    const working = run(idle, { type: 'start', projectId: 'p', subtaskId: 's1' }, T0).session
    const ended = run(working, { type: 'endStale', endAt: T0 + 30 * MINUTE }, T0 + 600 * MINUTE)
    expect(ended.closeAt).toBe(T0 + 30 * MINUTE)
    expect(ended.session.state).toBe('paused')
    expect(ended.events).toEqual([
      { ts: T0 + 30 * MINUTE, type: 'work_stopped', projectId: 'p', subtaskId: 's1', data: { via: 'staleSession' } },
    ])
    const kept = run(working, { type: 'keepStale' }, T0 + 600 * MINUTE)
    expect(kept.session.staleResolvedFor).toBe(working.openSegmentId)
    expect(kept.closeAt).toBeUndefined()
  })

  it('clear forgets the session and closes open segments', () => {
    const working = run(idle, { type: 'start', projectId: 'p', subtaskId: 's1' }, T0).session
    const t = run(working, { type: 'clear' }, T0 + MINUTE)
    expect(t.session).toEqual({ state: 'idle' })
    expect(t.closeAt).toBe(T0 + MINUTE)
  })
})
