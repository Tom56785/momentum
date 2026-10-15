import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetDb } from '../test/dbHelpers'
import { MINUTE } from '../domain/time'
import {
  addSubtask,
  completeSubtask,
  createProject,
  enterFocus,
  exitFocus,
  moveSubtask,
  parkingItemToProject,
  parkingItemToSubtask,
  parkThought,
  projectSubtasks,
  startChallenge,
} from './actions'
import { db } from './db'
import { dispatch } from './session'
import { getAppState, getSession } from './store'

const T0 = new Date('2026-10-15T09:00:00').getTime()

async function openSegments() {
  return (await db.segments.toArray()).filter((s) => s.endedAt === undefined)
}

async function setupProject(titles = ['one', 'two', 'three']) {
  const projectId = await createProject({ title: 'Project' })
  const ids: string[] = []
  for (const title of titles) ids.push(await addSubtask(projectId, { title, timeboxMinutes: 25, phase: 'implement' }))
  return { projectId, ids }
}

beforeEach(async () => {
  await resetDb()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('session store', () => {
  it('keeps at most one open segment, even with stray ones', async () => {
    const { projectId, ids } = await setupProject()
    await db.segments.add({ id: 'stray', kind: 'work', startedAt: T0 - MINUTE })
    await dispatch({ type: 'start', projectId, subtaskId: ids[0] })
    vi.setSystemTime(T0 + 5 * MINUTE)
    await dispatch({ type: 'switch', subtaskId: ids[1] })
    vi.setSystemTime(T0 + 6 * MINUTE)
    await dispatch({ type: 'startBreak' })
    const open = await openSegments()
    expect(open).toHaveLength(1)
    expect(open[0].kind).toBe('break')
    expect((await db.segments.get('stray'))?.endedAt).toBe(T0)
  })

  it('concurrent starts cannot open two segments', async () => {
    const { projectId, ids } = await setupProject()
    await Promise.all([
      dispatch({ type: 'start', projectId, subtaskId: ids[0] }),
      dispatch({ type: 'start', projectId, subtaskId: ids[1] }),
    ])
    expect(await openSegments()).toHaveLength(1)
  })

  it('logs work events with via', async () => {
    const { projectId, ids } = await setupProject()
    await dispatch({ type: 'start', projectId, subtaskId: ids[0] }, 'globalBar')
    await dispatch({ type: 'stop' }, 'shortcut')
    const events = await db.events.where('type').anyOf('work_started', 'work_stopped').toArray()
    expect(events.map((e) => [e.type, e.data?.via])).toEqual([
      ['work_started', 'globalBar'],
      ['work_stopped', 'shortcut'],
    ])
  })
})

describe('completing subtasks', () => {
  it('attributes time correctly when completing mid-session', async () => {
    const { projectId, ids } = await setupProject()
    await dispatch({ type: 'start', projectId, subtaskId: ids[0] })
    vi.setSystemTime(T0 + 10 * MINUTE)
    const result = await completeSubtask(ids[0])
    expect(result.nextSubtaskId).toBe(ids[1])
    vi.setSystemTime(T0 + 15 * MINUTE)
    await dispatch({ type: 'stop' })

    const segs = await db.segments.toArray()
    const bySubtask = (id: string) => segs.filter((s) => s.subtaskId === id).reduce((n, s) => n + (s.endedAt! - s.startedAt), 0)
    expect(bySubtask(ids[0])).toBe(10 * MINUTE)
    expect(bySubtask(ids[1])).toBe(5 * MINUTE)

    const completed = await db.events.where('type').equals('subtask_completed').first()
    expect(completed?.data).toMatchObject({ workMs: 10 * MINUTE, timeboxMinutes: 25, phase: 'implement' })
  })

  it('completes the project after the last subtask', async () => {
    const { projectId, ids } = await setupProject(['only'])
    await dispatch({ type: 'start', projectId, subtaskId: ids[0] })
    vi.setSystemTime(T0 + 20 * MINUTE)
    const result = await completeSubtask(ids[0])
    expect(result.projectCompleted).toBe(true)
    expect(result.totalWorkMs).toBe(20 * MINUTE)
    expect((await db.projects.get(projectId))?.status).toBe('done')
    expect((await getSession()).state).toBe('paused')
    expect(await db.events.where('type').equals('project_completed').count()).toBe(1)
  })

  it('records a challenge win and personal best', async () => {
    const { projectId, ids } = await setupProject()
    await dispatch({ type: 'start', projectId, subtaskId: ids[0] })
    await startChallenge(ids[0], 15, 0, 'manual')
    vi.setSystemTime(T0 + 12 * MINUTE)
    const result = await completeSubtask(ids[0])
    expect(result.challenge).toMatchObject({ outcome: 'beat', elapsedMs: 12 * MINUTE, newPersonalBest: true })
    expect(await getAppState('personalBests')).toEqual({ implement: 12 * MINUTE })
    expect(await getAppState('challenge')).toBeUndefined()

    // A slower win is not a new best.
    await startChallenge(ids[1], 15, 0, 'manual')
    vi.setSystemTime(T0 + 26 * MINUTE)
    const second = await completeSubtask(ids[1])
    expect(second.challenge).toMatchObject({ outcome: 'beat', newPersonalBest: false })
  })
})

describe('focus entry and exit', () => {
  it('targets the next incomplete subtask without starting the timer', async () => {
    const { projectId, ids } = await setupProject()
    await completeSubtask(ids[0])
    await enterFocus(projectId)
    const session = await getSession()
    expect(session).toMatchObject({ state: 'idle', projectId, subtaskId: ids[1] })
    expect(await openSegments()).toHaveLength(0)
  })

  it('exit saves the breadcrumb and optionally stops the timer', async () => {
    const { projectId, ids } = await setupProject()
    await dispatch({ type: 'start', projectId, subtaskId: ids[0] })
    await exitFocus(projectId, '  check the retry header  ', false)
    expect((await getSession()).state).toBe('working')
    expect((await db.projects.get(projectId))?.breadcrumb?.text).toBe('check the retry header')
    await exitFocus(projectId, '', true)
    expect((await getSession()).state).toBe('paused')
    expect((await db.projects.get(projectId))?.breadcrumb).toBeUndefined()
  })
})

describe('subtask chain editing', () => {
  it('reorders and renumbers', async () => {
    const { projectId, ids } = await setupProject()
    await moveSubtask(ids[2], 0)
    expect((await projectSubtasks(projectId)).map((s) => s.title)).toEqual(['three', 'one', 'two'])
    expect((await projectSubtasks(projectId)).map((s) => s.order)).toEqual([0, 1, 2])
  })
})

describe('parking lot conversions', () => {
  it('adds an item as a subtask at the end of its project', async () => {
    const { projectId } = await setupProject()
    const itemId = await parkThought('  Check logging config ', projectId)
    const subtaskId = await parkingItemToSubtask(itemId)
    const chain = await projectSubtasks(projectId)
    expect(chain.at(-1)).toMatchObject({ id: subtaskId, title: 'Check logging config' })
    expect(await db.parkingLot.get(itemId)).toMatchObject({ done: true, convertedTo: { kind: 'subtask', id: subtaskId } })
  })

  it('turns an item into a project with notes as summary', async () => {
    const itemId = await parkThought('Upgrade the build tool')
    await db.parkingLot.update(itemId, { details: 'Current version is old' })
    const projectId = await parkingItemToProject(itemId)
    expect(await db.projects.get(projectId!)).toMatchObject({ title: 'Upgrade the build tool', summary: 'Current version is old' })
  })
})
