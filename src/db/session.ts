import { challengeElapsedMs } from '../domain/rules'
import { transition, type SessionAction, type Via } from '../domain/session'
import { workMs } from '../domain/time'
import { db, newId } from './db'
import { deleteAppState, getAppState, getSession, getSettings, logEvent, setAppState } from './store'
import type { Session } from './types'

/** Tables every session write touches; transactions that call `applyAction` must include them. */
export const SESSION_TABLES = [db.appState, db.segments, db.events, db.settings] as const

/**
 * Closes every open segment (the known one plus any stray ones) at `at`.
 * This is the single guard for "at most one open segment".
 */
async function closeOpenSegments(at: number, knownId?: string): Promise<void> {
  const recent = await db.segments.orderBy('startedAt').reverse().limit(25).toArray()
  const ids = new Set(recent.filter((s) => s.endedAt === undefined).map((s) => s.id))
  if (knownId) ids.add(knownId)
  for (const id of ids) {
    const seg = await db.segments.get(id)
    if (seg && seg.endedAt === undefined) {
      await db.segments.update(id, { endedAt: Math.max(seg.startedAt, at) })
    }
  }
}

/** Work time on one subtask, from its segments. */
export async function subtaskWorkMs(subtaskId: string, now = Date.now()): Promise<number> {
  return workMs(await db.segments.where('subtaskId').equals(subtaskId).toArray(), now)
}

/**
 * Ends the active challenge without a win (cancelled, or time ran out), computing its
 * elapsed work time from segments. Must run inside a transaction with SESSION_TABLES.
 */
export async function endChallengeInTx(
  outcome: 'cancelled' | 'timeUp',
  projectId?: string,
  now = Date.now(),
): Promise<void> {
  const challenge = await getAppState('challenge')
  if (!challenge) return
  const elapsedMs = challengeElapsedMs(challenge, await subtaskWorkMs(challenge.subtaskId, now))
  await deleteAppState('challenge')
  await logEvent('challenge_ended', {
    ts: now,
    projectId,
    subtaskId: challenge.subtaskId,
    data: { outcome, elapsedMs, targetMinutes: challenge.targetMinutes },
  })
}

/** Applies a session action. Must run inside a transaction that includes SESSION_TABLES. */
export async function applyAction(action: SessionAction, via?: Via, now = Date.now()): Promise<Session> {
  const session = await getSession()
  const settings = await getSettings()
  const openSegment = session.openSegmentId ? await db.segments.get(session.openSegmentId) : undefined
  const t = transition(session, action, { now, breakMinutes: settings.breakMinutes, newId, openSegment, via })
  if (t.session === session && t.closeAt === undefined && !t.open) return session
  if (t.closeAt !== undefined || t.open) await closeOpenSegments(t.closeAt ?? now, session.openSegmentId)
  if (t.open) await db.segments.add(t.open)
  await setAppState('session', t.session)
  if (t.events.length) await db.events.bulkAdd(t.events)

  // A challenge only lives on the session's current step. When the session moves off it
  // (switch, delete, another project, clear), end it quietly. Completing the step is the
  // exception: completeSubtask settles the challenge itself, as a win or not.
  if (action.type !== 'complete') {
    const challenge = await getAppState('challenge')
    if (challenge && challenge.subtaskId !== t.session.subtaskId) {
      await endChallengeInTx('cancelled', session.projectId, now)
    }
  }
  return t.session
}

/** Runs a session action atomically, so two tabs can never open two segments. */
export function dispatch(action: SessionAction, via?: Via): Promise<Session> {
  // The callback must be an async function so Dexie keeps the transaction zone across awaits.
  return db.transaction('rw', [...SESSION_TABLES], async () => applyAction(action, via))
}
