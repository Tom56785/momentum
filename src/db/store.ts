import { db } from './db'
import {
  DEFAULT_SETTINGS,
  IDLE_SESSION,
  type AppEvent,
  type AppStateKey,
  type AppStateMap,
  type EventType,
  type Session,
  type Settings,
} from './types'

export async function getAppState<K extends AppStateKey>(key: K): Promise<AppStateMap[K] | undefined> {
  const row = await db.appState.get(key)
  return row?.value as AppStateMap[K] | undefined
}

export async function setAppState<K extends AppStateKey>(key: K, value: AppStateMap[K]): Promise<void> {
  await db.appState.put({ key, value })
}

export async function deleteAppState(key: AppStateKey): Promise<void> {
  await db.appState.delete(key)
}

export async function getSession(): Promise<Session> {
  return (await getAppState('session')) ?? IDLE_SESSION
}

export function settingsFromRows(rows: { key: string; value: unknown }[]): Settings {
  const s: Record<string, unknown> = { ...DEFAULT_SETTINGS }
  for (const row of rows) {
    if (row.key in DEFAULT_SETTINGS || row.key === 'lastBackupAt') s[row.key] = row.value
  }
  return s as unknown as Settings
}

export async function getSettings(): Promise<Settings> {
  return settingsFromRows(await db.settings.toArray())
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  await db.settings.bulkPut(Object.entries(patch).map(([key, value]) => ({ key, value })))
}

type EventFields = Omit<AppEvent, 'seq' | 'ts' | 'type'> & { ts?: number }

export async function logEvent(type: EventType, fields: EventFields = {}): Promise<void> {
  await db.events.add({ ts: Date.now(), type, ...fields })
}
