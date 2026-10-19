import { describe, expect, it } from 'vitest'
import type { Challenge, Segment, Session, Subtask } from '../db/types'
import {
  adjacentTodo,
  beatEstimateMessage,
  beatTimeboxMinutes,
  earlyFinishMessage,
  earlyFinishMs,
  challengeLeftMs,
  isBreakOver,
  isChallengeTimeUp,
  isStaleSession,
  nextTodo,
  progress,
  projectEstimate,
  shouldPromptTimebox,
  shouldShowBreakPrompt,
  staleEndTime,
  timeboxLeftMs,
  timeboxPromptThresholdMs,
} from './rules'
import { formatClock, formatDuration, HOUR, MINUTE, segmentMs, workMs } from './time'

const T0 = 1_760_000_000_000
const settings = { breakPromptsEnabled: true, workIntervalMinutes: 25 }
const working: Session = { state: 'working', projectId: 'p', subtaskId: 's1', continuousWorkSince: T0 }

describe('segment time', () => {
  it('counts open segments up to now and never negative', () => {
    expect(segmentMs({ startedAt: T0 }, T0 + 5000)).toBe(5000)
    expect(segmentMs({ startedAt: T0, endedAt: T0 + 1000 }, T0 + 99999)).toBe(1000)
    expect(segmentMs({ startedAt: T0 + 10 }, T0)).toBe(0)
  })

  it('sums only work segments matching the filter', () => {
    const segs: Segment[] = [
      { id: 'a', kind: 'work', subtaskId: 's1', startedAt: T0, endedAt: T0 + MINUTE },
      { id: 'b', kind: 'break', startedAt: T0 + MINUTE, endedAt: T0 + 2 * MINUTE },
      { id: 'c', kind: 'work', subtaskId: 's2', startedAt: T0 + 2 * MINUTE, endedAt: T0 + 3 * MINUTE },
      { id: 'd', kind: 'work', subtaskId: 's1', startedAt: T0 + 3 * MINUTE },
    ]
    expect(workMs(segs, T0 + 5 * MINUTE)).toBe(4 * MINUTE)
    expect(workMs(segs, T0 + 5 * MINUTE, (s) => s.subtaskId === 's1')).toBe(3 * MINUTE)
  })

  it('formats durations', () => {
    expect(formatDuration(45_000)).toBe('45s')
    expect(formatDuration(12 * MINUTE)).toBe('12m')
    expect(formatDuration(HOUR + 5 * MINUTE)).toBe('1h 05m')
    expect(formatClock(4 * MINUTE + 7000)).toBe('4:07')
    expect(formatClock(-5)).toBe('0:00')
  })
})

describe('break prompt timing', () => {
  it('waits for the work interval', () => {
    expect(shouldShowBreakPrompt(working, settings, T0 + 24 * MINUTE)).toBe(false)
    expect(shouldShowBreakPrompt(working, settings, T0 + 25 * MINUTE)).toBe(true)
  })

  it('respects snooze', () => {
    const snoozed = { ...working, breakPromptSnoozedUntil: T0 + 35 * MINUTE }
    expect(shouldShowBreakPrompt(snoozed, settings, T0 + 30 * MINUTE)).toBe(false)
    expect(shouldShowBreakPrompt(snoozed, settings, T0 + 35 * MINUTE)).toBe(true)
  })

  it('only while working and enabled', () => {
    expect(shouldShowBreakPrompt({ ...working, state: 'paused' }, settings, T0 + HOUR)).toBe(false)
    expect(shouldShowBreakPrompt(working, { ...settings, breakPromptsEnabled: false }, T0 + HOUR)).toBe(false)
  })

  it('knows when the suggested break has passed', () => {
    expect(isBreakOver(T0, 5, T0 + 4 * MINUTE)).toBe(false)
    expect(isBreakOver(T0, 5, T0 + 5 * MINUTE)).toBe(true)
  })
})

describe('timeboxes', () => {
  it('computes time left without going below zero', () => {
    expect(timeboxLeftMs(undefined, 0)).toBeUndefined()
    expect(timeboxLeftMs(25, 10 * MINUTE)).toBe(15 * MINUTE)
    expect(timeboxLeftMs(25, 40 * MINUTE)).toBe(0)
  })

  const subtask = { id: 's1', timeboxMinutes: 25 }
  const base = { session: working, subtask, thresholdPercent: 30, challengeActive: false }

  it('prompts once when crossing the threshold, a percentage of the timebox left', () => {
    // 30% of 25 minutes is 7.5 minutes left, so 17.5 minutes in.
    expect(shouldPromptTimebox({ ...base, subtaskWorkMs: 17 * MINUTE })).toBe(false)
    expect(shouldPromptTimebox({ ...base, subtaskWorkMs: 17.5 * MINUTE })).toBe(true)
    const prompted = { ...working, timeboxPromptShownFor: ['s1'] }
    expect(shouldPromptTimebox({ ...base, session: prompted, subtaskWorkMs: 20 * MINUTE })).toBe(false)
  })

  it('scales with the timebox', () => {
    const long = { ...base, subtask: { id: 's1', timeboxMinutes: 60 } }
    expect(shouldPromptTimebox({ ...long, subtaskWorkMs: 41 * MINUTE })).toBe(false)
    expect(shouldPromptTimebox({ ...long, subtaskWorkMs: 42 * MINUTE })).toBe(true)
    const short = { ...base, subtask: { id: 's1', timeboxMinutes: 5 } }
    expect(shouldPromptTimebox({ ...short, subtaskWorkMs: 3 * MINUTE })).toBe(false)
    expect(shouldPromptTimebox({ ...short, subtaskWorkMs: 3.5 * MINUTE })).toBe(true)
    expect(timeboxPromptThresholdMs(10, 30)).toBe(3 * MINUTE)
  })

  it('does not prompt after time is up, when the threshold is under a minute, or during a challenge', () => {
    expect(shouldPromptTimebox({ ...base, subtaskWorkMs: 25 * MINUTE })).toBe(false)
    expect(shouldPromptTimebox({ ...base, subtask: { id: 's1', timeboxMinutes: 3 }, subtaskWorkMs: 2.5 * MINUTE })).toBe(false)
    expect(shouldPromptTimebox({ ...base, challengeActive: true, subtaskWorkMs: 21 * MINUTE })).toBe(false)
    expect(shouldPromptTimebox({ ...base, session: { ...working, state: 'paused' }, subtaskWorkMs: 21 * MINUTE })).toBe(false)
  })
})

describe('challenges', () => {
  const challenge: Challenge = { subtaskId: 's1', startedAt: T0, targetMinutes: 15, workMsAtStart: 10 * MINUTE }

  it('counts only work time since the challenge began', () => {
    expect(challengeLeftMs(challenge, 10 * MINUTE)).toBe(15 * MINUTE)
    expect(challengeLeftMs(challenge, 20 * MINUTE)).toBe(5 * MINUTE)
    expect(isChallengeTimeUp(challenge, 24 * MINUTE)).toBe(false)
    expect(isChallengeTimeUp(challenge, 25 * MINUTE)).toBe(true)
    expect(challengeLeftMs(challenge, 99 * MINUTE)).toBe(0)
  })

  it('beat-my-timebox uses the remaining timebox', () => {
    expect(beatTimeboxMinutes(25, 10 * MINUTE + 1)).toBe(15)
    expect(beatTimeboxMinutes(25, 25 * MINUTE)).toBeUndefined()
    expect(beatTimeboxMinutes(undefined, 0)).toBeUndefined()
  })
})

describe('stale sessions', () => {
  const open: Segment = { id: 'w1', kind: 'work', startedAt: T0 }
  const session: Session = { ...working, openSegmentId: 'w1' }

  it('flags work open for more than 4 hours', () => {
    expect(isStaleSession(session, open, T0 + 4 * HOUR)).toBe(false)
    expect(isStaleSession(session, open, T0 + 4 * HOUR + 1)).toBe(true)
    expect(isStaleSession({ ...session, staleResolvedFor: 'w1' }, open, T0 + 9 * HOUR)).toBe(false)
  })

  it('ends at the last user activity, never before the segment started', () => {
    const events = [
      { ts: T0 - 5, type: 'work_started' as const },
      { ts: T0 + 20 * MINUTE, type: 'time_revealed' as const },
      { ts: T0 + 3 * MINUTE, type: 'parking_lot_added' as const },
      { ts: T0 + 5 * HOUR, type: 'focus_entered' as const },
      { ts: T0 + 5 * HOUR, type: 'break_prompt_shown' as const },
    ]
    expect(staleEndTime(open, events)).toBe(T0 + 20 * MINUTE)
    expect(staleEndTime(open, [])).toBe(T0)
  })

  it('ignores a challenge that timed out by itself, but not one the user ended', () => {
    const timedOut = { ts: T0 + 25 * MINUTE, type: 'challenge_ended' as const, data: { outcome: 'timeUp' } }
    const cancelled = { ts: T0 + 26 * MINUTE, type: 'challenge_ended' as const, data: { outcome: 'cancelled' } }
    expect(staleEndTime(open, [{ ts: T0 + 5 * MINUTE, type: 'time_revealed' as const }, timedOut])).toBe(T0 + 5 * MINUTE)
    expect(staleEndTime(open, [timedOut, cancelled])).toBe(T0 + 26 * MINUTE)
  })
})

describe('subtask chain', () => {
  const mk = (id: string, order: number, status: Subtask['status'] = 'todo'): Subtask => ({
    id, order, status, projectId: 'p', title: id, notes: '', createdAt: T0,
  })
  const chain = [mk('c', 2), mk('a', 0, 'done'), mk('b', 1), mk('d', 3, 'done'), mk('e', 4)]

  it('finds the next todo, wrapping around', () => {
    expect(nextTodo(chain, 'b')?.id).toBe('c')
    expect(nextTodo(chain, 'c')?.id).toBe('e')
    expect(nextTodo(chain, 'e')?.id).toBe('b')
    expect(nextTodo(chain)?.id).toBe('b')
    expect(nextTodo([mk('x', 0)], 'x')).toBeUndefined()
  })

  it('moves to adjacent todos without wrapping', () => {
    expect(adjacentTodo(chain, 'c', 1)?.id).toBe('e')
    expect(adjacentTodo(chain, 'c', -1)?.id).toBe('b')
    expect(adjacentTodo(chain, 'b', -1)).toBeUndefined()
  })

  it('clamps progress to 0..1', () => {
    expect(progress([])).toEqual({ done: 0, total: 0, ratio: 0 })
    expect(progress(chain).ratio).toBeCloseTo(0.4)
  })
})

describe('finishing early', () => {
  it('is early only with tracked work and time left on the timebox', () => {
    expect(earlyFinishMs(25, 18 * MINUTE)).toBe(7 * MINUTE)
    expect(earlyFinishMs(25, 25 * MINUTE)).toBeUndefined()
    expect(earlyFinishMs(25, 0)).toBeUndefined()
    expect(earlyFinishMs(undefined, 5 * MINUTE)).toBeUndefined()
  })

  it('describes the time to spare', () => {
    expect(earlyFinishMessage(7 * MINUTE + 40_000)).toBe('Done with 7 min to spare')
    expect(earlyFinishMessage(30_000)).toBe('Done just inside your timebox')
  })
})

describe('project estimate', () => {
  it("adds up the steps' timeboxes, skipping steps without one", () => {
    expect(projectEstimate([{ timeboxMinutes: 25 }, {}, { timeboxMinutes: 50 }])).toEqual({ minutes: 75, steps: 2 })
    expect(projectEstimate([{}, {}])).toEqual({ minutes: 0, steps: 0 })
  })

  it('celebrates beating the estimate', () => {
    expect(beatEstimateMessage(25 * MINUTE + 40_000)).toBe('You beat your estimate by 25 min!')
    expect(beatEstimateMessage(HOUR + 5 * MINUTE)).toBe('You beat your estimate by 1h 05m!')
    expect(beatEstimateMessage(20_000)).toBe('You came in just under your estimate!')
  })
})
