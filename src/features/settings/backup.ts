import { z } from 'zod'
import { ALL_TABLES, db } from '../../db/db'
import { settingsFromRows, updateSettings } from '../../db/store'
import { AI_PROMPT_TEMPLATE } from '../import/importSchema'
import { formatPath } from '../import/parseImport'
import { DEFAULT_SETTINGS, PHASES, type AppEvent } from '../../db/types'

const projectRow = z.object({
  id: z.string(),
  title: z.string(),
  externalKey: z.string().optional(),
  url: z.string().optional(),
  summary: z.string().optional(),
  problem: z.string().optional(),
  cause: z.string().optional(),
  solution: z.string().optional(),
  targetDate: z.string().optional(),
  status: z.enum(['active', 'done', 'archived']),
  breadcrumb: z.object({ text: z.string(), updatedAt: z.number() }).optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
  completedAt: z.number().optional(),
})

const subtaskRow = z.object({
  id: z.string(),
  projectId: z.string(),
  order: z.number(),
  title: z.string(),
  description: z.string().optional(),
  phase: z.enum(PHASES).optional(),
  timeboxMinutes: z.number().optional(),
  notes: z.string(),
  status: z.enum(['todo', 'done']),
  createdAt: z.number(),
  completedAt: z.number().optional(),
})

const segmentRow = z.object({
  id: z.string(),
  kind: z.enum(['work', 'break']),
  projectId: z.string().optional(),
  subtaskId: z.string().optional(),
  startedAt: z.number(),
  endedAt: z.number().optional(),
})

const eventRow = z.object({
  seq: z.number().optional(),
  ts: z.number(),
  type: z.string(),
  projectId: z.string().optional(),
  subtaskId: z.string().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
})

const parkingRow = z.object({
  id: z.string(),
  text: z.string(),
  details: z.string().optional(),
  projectId: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
  done: z.boolean(),
  convertedTo: z.object({ kind: z.enum(['subtask', 'project']), id: z.string() }).optional(),
})

const keyValueRow = z.object({ key: z.string(), value: z.unknown() })

export const backupSchema = z.object({
  format: z.literal('momentum-backup'),
  version: z.literal(1),
  exportedAt: z.number(),
  tables: z.object({
    projects: z.array(projectRow),
    subtasks: z.array(subtaskRow),
    segments: z.array(segmentRow),
    events: z.array(eventRow),
    parkingLot: z.array(parkingRow),
    settings: z.array(keyValueRow),
    appState: z.array(keyValueRow),
  }),
})

export type Backup = z.infer<typeof backupSchema>

type SettingRow = { key: string; value: unknown }

/**
 * Every setting with the value in effect, defaults included, plus the AI prompt (the
 * built-in one if it hasn't been edited). The database only stores changed settings, but
 * the file should show them all.
 */
function settingsForBackup(rows: SettingRow[]): SettingRow[] {
  const settings = settingsFromRows(rows)
  const all = { ...settings, aiPromptTemplate: settings.aiPromptTemplate ?? AI_PROMPT_TEMPLATE }
  return Object.entries(all)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => ({ key, value }))
}

/**
 * The settings rows to store on restore: known settings with the right type, leaving out
 * any that just repeat a default. Those keep following the default, so an improved built-in
 * AI prompt still reaches someone who never edited it.
 */
function settingsToStore(rows: SettingRow[]): SettingRow[] {
  return rows.filter(({ key, value }) => {
    if (key === 'aiPromptTemplate') return typeof value === 'string' && value !== AI_PROMPT_TEMPLATE
    if (key === 'lastBackupAt') return typeof value === 'number'
    if (!(key in DEFAULT_SETTINGS)) return false
    const fallback = DEFAULT_SETTINGS[key as keyof typeof DEFAULT_SETTINGS]
    return typeof value === typeof fallback && value !== fallback
  })
}

export async function createBackup(now = Date.now()): Promise<Backup> {
  return db.transaction('r', ALL_TABLES.map((t) => db.table(t)), async () => ({
    format: 'momentum-backup' as const,
    version: 1 as const,
    exportedAt: now,
    tables: {
      projects: await db.projects.toArray(),
      subtasks: await db.subtasks.toArray(),
      segments: await db.segments.toArray(),
      events: await db.events.toArray(),
      parkingLot: await db.parkingLot.toArray(),
      settings: settingsForBackup(await db.settings.toArray()),
      appState: await db.appState.toArray(),
    },
  }))
}

/** Downloads every table as one JSON file and records the backup date. */
export async function downloadBackup(): Promise<void> {
  const now = Date.now()
  const backup = await createBackup(now)
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const stamp = new Date(now).toISOString().slice(0, 10)
  a.href = url
  a.download = `momentum-backup-${stamp}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  await updateSettings({ lastBackupAt: now })
}

export type ParsedBackup = { ok: true; backup: Backup } | { ok: false; error: string }

export function parseBackup(text: string): ParsedBackup {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return { ok: false, error: "This file isn't valid JSON." }
  }
  const result = backupSchema.safeParse(json)
  if (!result.success) {
    const issue = result.error.issues[0]
    return { ok: false, error: `This doesn't look like a Momentum backup (${formatPath(issue.path)}: ${issue.message}).` }
  }
  return { ok: true, backup: result.data }
}

/** Replaces all data, settings and the AI prompt with the backup's, atomically. */
export async function restoreBackup(backup: Backup): Promise<void> {
  const t = backup.tables
  await db.transaction('rw', ALL_TABLES.map((name) => db.table(name)), async () => {
    for (const name of ALL_TABLES) await db.table(name).clear()
    await db.projects.bulkAdd(t.projects)
    await db.subtasks.bulkAdd(t.subtasks)
    await db.segments.bulkAdd(t.segments)
    await db.events.bulkAdd(t.events as AppEvent[])
    await db.parkingLot.bulkAdd(t.parkingLot)
    await db.settings.bulkAdd(settingsToStore(t.settings))
    await db.appState.bulkAdd(t.appState)
  })
}
