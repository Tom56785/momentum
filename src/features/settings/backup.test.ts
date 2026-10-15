import { beforeEach, describe, expect, it } from 'vitest'
import { addSubtask, createProject, parkThought } from '../../db/actions'
import { db } from '../../db/db'
import { dispatch } from '../../db/session'
import { updateSettings } from '../../db/store'
import { resetDb } from '../../test/dbHelpers'
import { createBackup, parseBackup, restoreBackup } from './backup'

beforeEach(resetDb)

async function seed() {
  const projectId = await createProject({ title: 'Backup me', externalKey: 'BK-1' })
  const subtaskId = await addSubtask(projectId, { title: 'Step', timeboxMinutes: 15, phase: 'test' })
  await dispatch({ type: 'start', projectId, subtaskId })
  await dispatch({ type: 'stop' })
  await parkThought('A stray thought', projectId)
  await updateSettings({ workIntervalMinutes: 30 })
}

describe('backup round-trip', () => {
  it('exports and restores every table exactly', async () => {
    await seed()
    const backup = await createBackup()
    const json = JSON.stringify(backup)

    await resetDb()
    await createProject({ title: 'Will be replaced' })

    const parsed = parseBackup(json)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    await restoreBackup(parsed.backup)

    const after = await createBackup(backup.exportedAt)
    expect(after).toEqual(backup)
    expect(await db.projects.count()).toBe(1)
    expect((await db.projects.toArray())[0].title).toBe('Backup me')
  })

  it('rejects files that are not backups', () => {
    expect(parseBackup('nope')).toEqual({ ok: false, error: "This file isn't valid JSON." })
    const wrong = parseBackup(JSON.stringify({ schemaVersion: 1, projects: [] }))
    expect(wrong.ok).toBe(false)
  })
})
