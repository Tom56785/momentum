import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { setAppState, settingsFromRows } from '../db/store'
import {
  DEFAULT_SETTINGS,
  IDLE_SESSION,
  type AppStateKey,
  type AppStateMap,
  type Challenge,
  type Segment,
  type Session,
  type Settings,
} from '../db/types'
import { logEvent } from '../db/store'
import { sortByOrder } from '../domain/rules'

/**
 * useLiveQuery keyed by `key`. dexie-react-hooks keeps returning the previous result after
 * its deps change until the new query resolves, which would briefly show one step's data
 * for another. Results are tagged with the key they were fetched for; a stale one reads as
 * `fallback` (still loading).
 */
function useKeyedLiveQuery<T, F>(key: string, query: () => Promise<T>, fallback: F): T | F {
  const result = useLiveQuery(async () => ({ key, value: await query() }), [key])
  return result && result.key === key ? result.value : fallback
}

export function useAppState<K extends AppStateKey>(key: K): AppStateMap[K] | undefined {
  return useLiveQuery(async () => (await db.appState.get(key))?.value as AppStateMap[K] | undefined, [key])
}

export function useSession(): Session {
  return useAppState('session') ?? IDLE_SESSION
}

export function useChallenge(): Challenge | undefined {
  return useAppState('challenge')
}

export function useSettings(): Settings {
  return useLiveQuery(async () => settingsFromRows(await db.settings.toArray()), [], DEFAULT_SETTINGS)
}

/** The project, `null` if it doesn't exist, or `undefined` while loading. */
export function useProject(id: string | undefined) {
  return useKeyedLiveQuery(id ?? '', async () => (id ? ((await db.projects.get(id)) ?? null) : null), undefined)
}

export function useSubtasks(projectId: string | undefined) {
  return useKeyedLiveQuery(
    projectId ?? '',
    async () => (projectId ? sortByOrder(await db.subtasks.where('projectId').equals(projectId).toArray()) : []),
    undefined,
  )
}

export function useSegmentsFor(field: 'subtaskId' | 'projectId', id: string | undefined): Segment[] {
  return useKeyedLiveQuery(
    `${field}:${id ?? ''}`,
    async () => (id ? db.segments.where(field).equals(id).toArray() : []),
    NO_SEGMENTS,
  )
}

export function useSegment(id: string | undefined): Segment | undefined {
  return useKeyedLiveQuery(id ?? '', async () => (id ? db.segments.get(id) : undefined), undefined)
}

const NO_SEGMENTS: Segment[] = []

export function useOpenParkingCount(): number {
  return useLiveQuery(() => db.parkingLot.filter((p) => !p.done).count(), [], 0)
}

export type RevealKind = 'work' | 'timers'

/** Persisted "show time" toggles. Work time defaults to the setting until the user chooses. */
export function useReveal(): {
  work: boolean
  timers: boolean
  toggle: (kind: RevealKind, what?: 'work' | 'timebox' | 'challenge') => void
  set: (patch: Partial<Record<RevealKind, boolean>>) => void
} {
  const stored = useAppState('reveal')
  const settings = useSettings()
  const work = stored?.work ?? settings.showWorkTimeByDefault
  const timers = stored?.timers ?? false
  const set = (patch: Partial<Record<RevealKind, boolean>>) => {
    void setAppState('reveal', { work, timers, ...patch })
  }
  const toggle = (kind: RevealKind, what: 'work' | 'timebox' | 'challenge' = kind === 'work' ? 'work' : 'timebox') => {
    const next = !(kind === 'work' ? work : timers)
    set({ [kind]: next })
    if (next) void logEvent('time_revealed', { data: { what } })
  }
  return { work, timers, toggle, set }
}
