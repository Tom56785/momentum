import { beforeEach, describe, expect, it } from 'vitest'
import { addSubtask, createProject, parkThought } from '../../db/actions'
import { db } from '../../db/db'
import { dispatch } from '../../db/session'
import { getSettings, updateSettings } from '../../db/store'
import { DEFAULT_SETTINGS } from '../../db/types'
import { resetDb } from '../../test/dbHelpers'
import { AI_PROMPT_TEMPLATE } from '../import/importSchema'
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

  it('writes every setting and the AI prompt into the file, defaults included', async () => {
    await updateSettings({ workIntervalMinutes: 30 })
    const { settings } = (await createBackup()).tables
    const keys = settings.map((r) => r.key)
    for (const key of Object.keys(DEFAULT_SETTINGS)) expect(keys).toContain(key)
    expect(settings).toContainEqual({ key: 'workIntervalMinutes', value: 30 })
    expect(settings).toContainEqual({ key: 'breakMinutes', value: DEFAULT_SETTINGS.breakMinutes })
    expect(settings).toContainEqual({ key: 'aiPromptTemplate', value: AI_PROMPT_TEMPLATE })
  })

  it('restores every setting and an edited prompt, replacing what was there', async () => {
    await updateSettings({ breakMinutes: 7, soundEnabled: true, aiPromptTemplate: 'My prompt {{SCHEMA}}' })
    const backup = await createBackup()

    // Changed since the backup, including back to a default and a fresh prompt edit.
    await updateSettings({ breakMinutes: DEFAULT_SETTINGS.breakMinutes, snoozeMinutes: 20, aiPromptTemplate: 'Other' })
    await restoreBackup(backup)

    const settings = await getSettings()
    expect(settings.breakMinutes).toBe(7)
    expect(settings.soundEnabled).toBe(true)
    expect(settings.snoozeMinutes).toBe(DEFAULT_SETTINGS.snoozeMinutes)
    expect(settings.aiPromptTemplate).toBe('My prompt {{SCHEMA}}')
  })

  it('keeps defaults following the built-in values after a restore', async () => {
    await restoreBackup(await createBackup())
    // Only changed settings are stored; the unedited prompt stays the built-in one.
    expect(await db.settings.toArray()).toEqual([])
    expect((await getSettings()).aiPromptTemplate).toBeUndefined()
  })

  it('ignores unknown or mistyped settings in a backup', async () => {
    const backup = await createBackup()
    backup.tables.settings.push({ key: 'timeboxPromptMinutesLeft', value: 5 }, { key: 'breakMinutes', value: 'lots' })
    backup.tables.settings = backup.tables.settings.filter((r) => !(r.key === 'breakMinutes' && typeof r.value === 'number'))
    await restoreBackup(backup)
    expect(await db.settings.toArray()).toEqual([])
    expect((await getSettings()).breakMinutes).toBe(DEFAULT_SETTINGS.breakMinutes)
  })

  it('rejects files that are not backups', () => {
    expect(parseBackup('nope')).toEqual({ ok: false, error: "This file isn't valid JSON." })
    const wrong = parseBackup(JSON.stringify({ schemaVersion: 1, projects: [] }))
    expect(wrong.ok).toBe(false)
  })
})
