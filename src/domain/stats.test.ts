import { describe, expect, it } from 'vitest'
import type { AppEvent, Segment, Subtask } from '../db/types'
import { summariseWeek, todaySummary, undoneCompletions } from './stats'
import { DAY, HOUR, MINUTE, startOfDay, startOfNextDay } from './time'

// Local-time anchors so hour/day buckets are timezone independent.
const MON = new Date('2026-10-12T00:00:00').getTime()
const at = (day: number, h: number, m = 0) => MON + day * DAY + h * HOUR + m * MINUTE

const subtasks: Subtask[] = [
  { id: 's1', projectId: 'p', order: 0, title: 'a', notes: '', status: 'done', createdAt: MON, phase: 'implement' },
  { id: 's2', projectId: 'p', order: 1, title: 'b', notes: '', status: 'todo', createdAt: MON },
]

const segments: Segment[] = [
  // Monday 09:30-10:30 implement (spans an hour boundary)
  { id: '1', kind: 'work', projectId: 'p', subtaskId: 's1', startedAt: at(0, 9, 30), endedAt: at(0, 10, 30) },
  { id: '2', kind: 'break', startedAt: at(0, 10, 30), endedAt: at(0, 10, 35) },
  // Tuesday 23:50 - Wednesday 00:10, no phase (spans midnight)
  { id: '3', kind: 'work', projectId: 'p', subtaskId: 's2', startedAt: at(1, 23, 50), endedAt: at(2, 0, 10) },
  // Before the window: ignored
  { id: '4', kind: 'work', projectId: 'p', subtaskId: 's2', startedAt: MON - HOUR, endedAt: MON - 30 * MINUTE },
]

const events: AppEvent[] = [
  { ts: at(0, 10), type: 'subtask_completed' },
  { ts: at(0, 10, 30), type: 'break_started' },
  { ts: at(0, 11), type: 'break_prompt_shown' },
  { ts: at(0, 11, 1), type: 'break_prompt_snoozed' },
  { ts: at(1, 9), type: 'challenge_ended', data: { outcome: 'beat' } },
  { ts: at(1, 10), type: 'challenge_ended', data: { outcome: 'timeUp' } },
  { ts: at(1, 11), type: 'challenge_ended', data: { outcome: 'cancelled' } },
  { ts: at(2, 9), type: 'project_completed' },
  { ts: MON - 1, type: 'subtask_completed' }, // outside window
]

describe('summariseWeek', () => {
  const week = summariseWeek({ segments, events, subtasks }, MON, MON + 7 * DAY, at(6, 12))

  it('totals work and breaks inside the window', () => {
    expect(week.totalWorkMs).toBe(80 * MINUTE)
    expect(week.totalBreakMs).toBe(5 * MINUTE)
  })

  it('splits work by day across midnight', () => {
    expect(week.workByDay).toEqual({
      '2026-10-12': 60 * MINUTE,
      '2026-10-13': 10 * MINUTE,
      '2026-10-14': 10 * MINUTE,
    })
  })

  it('splits work by phase and hour of day', () => {
    expect(week.workByPhase.implement).toBe(60 * MINUTE)
    expect(week.workByPhase.none).toBe(20 * MINUTE)
    expect(week.workByHour[9]).toBe(30 * MINUTE)
    expect(week.workByHour[10]).toBe(30 * MINUTE)
    expect(week.workByHour[23]).toBe(10 * MINUTE)
    expect(week.workByHour[0]).toBe(10 * MINUTE)
  })

  it('counts behaviour events', () => {
    expect(week.subtasksCompleted).toBe(1)
    expect(week.projectsCompleted).toBe(1)
    expect(week.breaks).toBe(1)
    expect(week.breakPromptsShown).toBe(1)
    expect(week.snoozes).toBe(1)
    expect(week.challenges).toEqual({ beat: 1, timeUp: 1, cancelled: 1 })
  })

  it('counts an open segment up to now', () => {
    const open: Segment = { id: 'o', kind: 'work', startedAt: at(3, 9) }
    const s = summariseWeek({ segments: [open], events: [], subtasks }, MON, MON + 7 * DAY, at(3, 9, 45))
    expect(s.totalWorkMs).toBe(45 * MINUTE)
  })
})

describe('todaySummary', () => {
  it('counts today only', () => {
    const today = todaySummary(segments, events, at(0, 18))
    expect(today).toEqual({ subtasksCompleted: 1, projectsCompleted: 0, focusMs: 60 * MINUTE })
  })
})

describe('reopened completions', () => {
  const e = (seq: number, ts: number, type: AppEvent['type'], ids: Partial<AppEvent> = {}): AppEvent => ({ seq, ts, type, ...ids })

  it('marks a completion undone only when a later reopen follows it', () => {
    const first = e(1, at(0, 9), 'subtask_completed', { subtaskId: 's1' })
    const reopen = e(2, at(0, 10), 'subtask_reopened', { subtaskId: 's1' })
    const again = e(3, at(0, 11), 'subtask_completed', { subtaskId: 's1' })
    const other = e(4, at(0, 11), 'subtask_completed', { subtaskId: 's2' })
    const undone = undoneCompletions([again, other, reopen, first])
    expect([...undone]).toEqual([first])
  })

  it('handles projects the same way', () => {
    const done = e(1, at(0, 9), 'project_completed', { projectId: 'p' })
    const reopened = e(2, at(0, 9, 5), 'project_reopened', { projectId: 'p' })
    expect([...undoneCompletions([done, reopened])]).toEqual([done])
  })

  it('counts a step completed, unticked and completed again once in Today', () => {
    const events = [
      e(1, at(0, 9), 'subtask_completed', { subtaskId: 's1' }),
      e(2, at(0, 9, 1), 'project_completed', { projectId: 'p' }),
      e(3, at(0, 9, 30), 'subtask_reopened', { subtaskId: 's1' }),
      e(4, at(0, 9, 30), 'project_reopened', { projectId: 'p' }),
      e(5, at(0, 10), 'subtask_completed', { subtaskId: 's1' }),
      e(6, at(0, 10), 'project_completed', { projectId: 'p' }),
    ]
    expect(todaySummary([], events, at(0, 18))).toMatchObject({ subtasksCompleted: 1, projectsCompleted: 1 })
    // Unticked and left undone: nothing counts.
    expect(todaySummary([], events.slice(0, 4), at(0, 18))).toMatchObject({ subtasksCompleted: 0, projectsCompleted: 0 })
  })

  it('skips a week completion reopened after the window ends', () => {
    const events = [
      e(1, at(2, 9), 'subtask_completed', { subtaskId: 's1' }),
      e(2, at(9, 9), 'subtask_reopened', { subtaskId: 's1' }),
    ]
    const week = summariseWeek({ segments: [], events, subtasks }, MON, MON + 7 * DAY, at(9, 12))
    expect(week.subtasksCompleted).toBe(0)
  })
})

describe('clock-change days', () => {
  it('Today covers the whole 25-hour day when the clocks go back', () => {
    // Europe/London (set in vitest config): clocks go back at 02:00 on 25 Oct 2026.
    const late = new Date('2026-10-25T23:30:00').getTime()
    expect(startOfNextDay(late) - startOfDay(late)).toBe(25 * HOUR)
    const events: AppEvent[] = [{ ts: late, type: 'subtask_completed', subtaskId: 's1' }]
    const segments: Segment[] = [{ id: 'w', kind: 'work', startedAt: late - 10 * MINUTE, endedAt: late }]
    expect(todaySummary(segments, events, late + MINUTE)).toEqual({
      subtasksCompleted: 1,
      projectsCompleted: 0,
      focusMs: 10 * MINUTE,
    })
  })
})
