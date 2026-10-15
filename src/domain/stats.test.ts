import { describe, expect, it } from 'vitest'
import type { AppEvent, Segment, Subtask } from '../db/types'
import { summariseWeek, todaySummary } from './stats'
import { DAY, HOUR, MINUTE } from './time'

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
