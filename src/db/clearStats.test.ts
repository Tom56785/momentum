import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb } from '../test/dbHelpers'
import { addSubtask, clearStats, completeSubtask, createProject, parkThought, startChallenge } from './actions'
import { db } from './db'
import { dispatch } from './session'
import { getAppState, getSession, setAppState, updateSettings } from './store'

beforeEach(resetDb)

describe('clearStats', () => {
  it('clears time, history, personal bests and the session, and keeps everything else', async () => {
    const projectId = await createProject({ title: 'Keep me' })
    const first = await addSubtask(projectId, { title: 'Done step', timeboxMinutes: 10 })
    const second = await addSubtask(projectId, { title: 'Running step', timeboxMinutes: 10 })
    // Beating a challenge sets a personal best; a second challenge is left running.
    await dispatch({ type: 'start', projectId, subtaskId: first })
    await startChallenge(first, 5, 'manual')
    await completeSubtask(first, 'button')
    await dispatch({ type: 'start', projectId, subtaskId: second })
    await startChallenge(second, 5, 'manual')
    await parkThought('Keep this thought', projectId)
    await updateSettings({ breakMinutes: 7 })
    await setAppState('reveal', { work: true, timers: false })
    expect(await getAppState('personalBests')).toBeDefined()
    expect(await getAppState('challenge')).toBeDefined()
    expect(await db.events.count()).toBeGreaterThan(0)

    await clearStats()

    expect(await db.segments.count()).toBe(0)
    expect(await db.events.count()).toBe(0)
    expect(await getAppState('personalBests')).toBeUndefined()
    expect(await getAppState('challenge')).toBeUndefined()
    expect((await getSession()).state).toBe('idle')

    expect((await db.projects.get(projectId))?.title).toBe('Keep me')
    expect((await db.subtasks.get(first))?.status).toBe('done')
    expect(await db.subtasks.count()).toBe(2)
    expect(await db.parkingLot.count()).toBe(1)
    expect((await db.settings.get('breakMinutes'))?.value).toBe(7)
    expect(await getAppState('reveal')).toEqual({ work: true, timers: false })
  })
})
