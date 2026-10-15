import { challengeElapsedMs, earlyFinishMs, nextTodo, sortByOrder } from '../domain/rules'
import type { Via } from '../domain/session'
import { MINUTE, workMs } from '../domain/time'
import { db, newId } from './db'
import { applyAction, dispatch, endChallengeInTx, SESSION_TABLES, subtaskWorkMs } from './session'
import { deleteAppState, getAppState, getSession, logEvent, setAppState } from './store'
import type { Challenge, ParkingLotItem, Phase, Project, Subtask } from './types'

// ---------------------------------------------------------------- projects

export type ProjectFields = Partial<
  Pick<Project, 'title' | 'externalKey' | 'url' | 'summary' | 'problem' | 'cause' | 'solution' | 'targetDate'>
>

export async function createProject(fields: ProjectFields & { title: string }): Promise<string> {
  const now = Date.now()
  const id = newId()
  await db.transaction('rw', db.projects, db.events, async () => {
    await db.projects.add({ ...fields, id, status: 'active', createdAt: now, updatedAt: now })
    await logEvent('project_created', { projectId: id, data: { source: 'manual' } })
  })
  return id
}

export async function updateProject(id: string, patch: Partial<Omit<Project, 'id'>>): Promise<void> {
  await db.projects.update(id, { ...patch, updatedAt: Date.now() })
}

/**
 * Marks a project done and logs project_completed with its total work time.
 * Must run inside a transaction that includes projects and SESSION_TABLES.
 */
async function markProjectComplete(projectId: string, now: number): Promise<number> {
  const totalWorkMs = workMs(await db.segments.where('projectId').equals(projectId).toArray(), now)
  await db.projects.update(projectId, { status: 'done', completedAt: now, updatedAt: now })
  await logEvent('project_completed', { ts: now, projectId, data: { totalWorkMs } })
  return totalWorkMs
}

/**
 * If the project had been completed, record that it's open again: clear completedAt, log
 * project_reopened (so reports skip the earlier completion), and make a 'done' project
 * 'active'. An archived project stays archived. Must run inside a transaction with
 * projects and events.
 */
export async function reopenProjectIfCompleted(
  projectId: string,
  reason: 'subtaskAdded' | 'subtaskReopened' | 'undone' | 'reimported' | 'restored',
  now = Date.now(),
): Promise<void> {
  const project = await db.projects.get(projectId)
  if (!project || project.completedAt === undefined) return
  await db.projects.update(projectId, {
    status: project.status === 'done' ? 'active' : project.status,
    completedAt: undefined,
    updatedAt: now,
  })
  await logEvent('project_reopened', { ts: now, projectId, data: { reason } })
}

/** Archives a project. A running timer on it is stopped first. */
export async function archiveProject(id: string): Promise<void> {
  await db.transaction('rw', [db.projects, ...SESSION_TABLES], async () => {
    if ((await getSession()).projectId === id) await applyAction({ type: 'clear' })
    // completedAt is kept, so restoring a finished project brings it back as done.
    await db.projects.update(id, { status: 'archived', updatedAt: Date.now() })
  })
}

/**
 * Brings an archived project back: as 'done' if it was completed and every step is still
 * done, otherwise as 'active' (logging a reopen if it had been completed).
 */
export async function restoreProject(id: string): Promise<void> {
  await db.transaction('rw', [db.projects, db.subtasks, db.events], async () => {
    const project = await db.projects.get(id)
    if (!project || project.status !== 'archived') return
    const now = Date.now()
    const chain = await projectSubtasks(id)
    const allDone = chain.length > 0 && chain.every((s) => s.status === 'done')
    if (project.completedAt !== undefined && allDone) {
      await db.projects.update(id, { status: 'done', updatedAt: now })
      return
    }
    await reopenProjectIfCompleted(id, 'restored', now)
    await db.projects.update(id, { status: 'active', updatedAt: now })
  })
}

/** Deletes a project and its subtasks. Segments and events are kept as history. */
export async function deleteProject(id: string): Promise<void> {
  await db.transaction('rw', [db.projects, db.subtasks, db.parkingLot, ...SESSION_TABLES], async () => {
    const session = await getSession()
    if (session.projectId === id) await applyAction({ type: 'clear' })
    await db.subtasks.where('projectId').equals(id).delete()
    await db.parkingLot.filter((p) => p.projectId === id).modify({ projectId: undefined })
    await db.projects.delete(id)
  })
}

export async function saveBreadcrumb(projectId: string, text: string): Promise<void> {
  const trimmed = text.trim()
  await db.transaction('rw', db.projects, db.events, async () => {
    await db.projects.update(projectId, {
      breadcrumb: trimmed ? { text: trimmed, updatedAt: Date.now() } : undefined,
    })
    await logEvent('breadcrumb_saved', { projectId, data: { length: trimmed.length } })
  })
}

// ---------------------------------------------------------------- subtasks

export async function projectSubtasks(projectId: string): Promise<Subtask[]> {
  return sortByOrder(await db.subtasks.where('projectId').equals(projectId).toArray())
}

export async function addSubtask(
  projectId: string,
  fields: { title: string; description?: string; phase?: Phase; timeboxMinutes?: number },
): Promise<string> {
  const id = newId()
  await db.transaction('rw', db.subtasks, db.projects, db.events, async () => {
    const existing = await projectSubtasks(projectId)
    const order = existing.length ? existing[existing.length - 1].order + 1 : 0
    await db.subtasks.add({
      id,
      projectId,
      order,
      title: fields.title,
      description: fields.description,
      phase: fields.phase,
      timeboxMinutes: fields.timeboxMinutes,
      notes: '',
      status: 'todo',
      createdAt: Date.now(),
    })
    // Adding work to a finished project re-opens it.
    await reopenProjectIfCompleted(projectId, 'subtaskAdded')
    await db.projects.update(projectId, { updatedAt: Date.now() })
  })
  return id
}

export async function updateSubtask(id: string, patch: Partial<Omit<Subtask, 'id' | 'projectId'>>): Promise<void> {
  await db.subtasks.update(id, patch)
}

export async function deleteSubtask(id: string): Promise<void> {
  await db.transaction('rw', [db.subtasks, db.projects, ...SESSION_TABLES], async () => {
    const subtask = await db.subtasks.get(id)
    if (!subtask) return
    const session = await getSession()
    if (session.subtaskId === id) {
      const remaining = (await projectSubtasks(subtask.projectId)).filter((s) => s.id !== id)
      const next = nextTodo(remaining)
      if (next) await applyAction({ type: 'switch', subtaskId: next.id })
      else await applyAction({ type: 'clear' })
    }
    await db.subtasks.delete(id)
    const now = Date.now()
    // Deleting the last step that was left to do finishes the project.
    const remaining = await projectSubtasks(subtask.projectId)
    const project = await db.projects.get(subtask.projectId)
    const finished = remaining.length > 0 && remaining.every((s) => s.status === 'done')
    if (finished && project?.status === 'active') await markProjectComplete(subtask.projectId, now)
    else await db.projects.update(subtask.projectId, { updatedAt: now })
  })
}

/** Moves a subtask to a new index in its chain and renumbers the chain. */
export async function moveSubtask(id: string, toIndex: number): Promise<void> {
  await db.transaction('rw', db.subtasks, async () => {
    const subtask = await db.subtasks.get(id)
    if (!subtask) return
    const chain = (await projectSubtasks(subtask.projectId)).filter((s) => s.id !== id)
    const index = Math.max(0, Math.min(chain.length, toIndex))
    chain.splice(index, 0, subtask)
    await Promise.all(chain.map((s, i) => (s.order === i ? undefined : db.subtasks.update(s.id, { order: i }))))
  })
}

export interface CompleteResult {
  /** The step that was completed (undefined if nothing changed). */
  subtaskId?: string
  nextSubtaskId?: string
  /** Work was running and stopped because nothing was left (so undo can resume it). */
  stoppedWork?: boolean
  /** The personal best this completion replaced, so undo can restore it (null: there was none). */
  personalBestBefore?: number | null
  /** Time to spare on the step's timebox, when it was finished early. */
  earlyByMs?: number
  projectCompleted: boolean
  totalWorkMs?: number
  challenge?: { outcome: 'beat' | 'timeUp'; elapsedMs: number; newPersonalBest: boolean; phase: Phase }
}

/**
 * Marks a subtask done. If it is the session's current subtask, work moves on to the next
 * one (time stays attributed correctly). Completes the project when nothing is left.
 */
export async function completeSubtask(id: string, via: Via = 'focus'): Promise<CompleteResult> {
  return db.transaction('rw', [db.subtasks, db.projects, ...SESSION_TABLES], async () => {
    const subtask = await db.subtasks.get(id)
    if (!subtask || subtask.status === 'done') return { projectCompleted: false }
    const now = Date.now()
    const chain = await projectSubtasks(subtask.projectId)
    const next = nextTodo(chain, id)

    const session = await getSession()
    const stoppedWork = session.subtaskId === id && session.state === 'working' && !next
    if (session.subtaskId === id) {
      await applyAction({ type: 'complete', nextSubtaskId: next?.id }, via, now)
    }

    await db.subtasks.update(id, { status: 'done', completedAt: now })
    const workOnSubtask = await subtaskWorkMs(id, now)
    await logEvent('subtask_completed', {
      ts: now,
      projectId: subtask.projectId,
      subtaskId: id,
      data: { workMs: workOnSubtask, timeboxMinutes: subtask.timeboxMinutes, phase: subtask.phase },
    })

    const result: CompleteResult = {
      subtaskId: id,
      stoppedWork,
      nextSubtaskId: next?.id,
      earlyByMs: earlyFinishMs(subtask.timeboxMinutes, workOnSubtask),
      projectCompleted: false,
    }

    const challenge = await getAppState('challenge')
    if (challenge?.subtaskId === id) {
      const elapsedMs = challengeElapsedMs(challenge, workOnSubtask)
      const outcome = elapsedMs <= challenge.targetMinutes * MINUTE ? 'beat' : 'timeUp'
      const phase: Phase = subtask.phase ?? 'other'
      let newPersonalBest = false
      if (outcome === 'beat') {
        const bests = (await getAppState('personalBests')) ?? {}
        if (bests[phase] === undefined || elapsedMs < (bests[phase] ?? Infinity)) {
          newPersonalBest = true
          result.personalBestBefore = bests[phase] ?? null
          await setAppState('personalBests', { ...bests, [phase]: elapsedMs })
        }
      }
      await deleteAppState('challenge')
      await logEvent('challenge_ended', {
        ts: now,
        projectId: subtask.projectId,
        subtaskId: id,
        data: { outcome, elapsedMs, phase, targetMinutes: challenge.targetMinutes, newPersonalBest },
      })
      result.challenge = { outcome, elapsedMs, newPersonalBest, phase }
    }

    if (!next) {
      result.projectCompleted = true
      result.totalWorkMs = await markProjectComplete(subtask.projectId, now)
    } else {
      await db.projects.update(subtask.projectId, { updatedAt: now })
    }
    return result
  })
}

/**
 * Marks a done subtask as to-do again (re-opening its project if needed). The reopen is
 * logged so reports can ignore the completion it undid instead of counting the step twice.
 */
export async function reopenSubtask(id: string): Promise<void> {
  await db.transaction('rw', db.subtasks, db.projects, db.events, async () => {
    const subtask = await db.subtasks.get(id)
    if (subtask?.status === 'done') await reopenSubtaskInTx(subtask, 'subtaskReopened', Date.now())
  })
}

/** Must run inside a transaction with subtasks, projects and events. */
async function reopenSubtaskInTx(subtask: Subtask, reason: 'subtaskReopened' | 'undone', now: number): Promise<void> {
  await db.subtasks.update(subtask.id, { status: 'todo', completedAt: undefined })
  await logEvent('subtask_reopened', { ts: now, projectId: subtask.projectId, subtaskId: subtask.id, data: { reason } })
  await reopenProjectIfCompleted(subtask.projectId, reason, now)
}

/**
 * Undoes a completion from the focus screen: the step is to-do again (logged as a reopen,
 * so reports skip the completion), a personal best it set is restored, a project it
 * finished is reopened, and the session goes back to the step. If finishing the project
 * had stopped the timer, work resumes on the step.
 */
export async function undoCompletion(result: CompleteResult): Promise<void> {
  const id = result.subtaskId
  if (!id) return
  await db.transaction('rw', [db.subtasks, db.projects, ...SESSION_TABLES], async () => {
    const subtask = await db.subtasks.get(id)
    if (!subtask || subtask.status !== 'done') return
    const now = Date.now()
    await reopenSubtaskInTx(subtask, 'undone', now)

    if (result.challenge?.newPersonalBest && result.personalBestBefore !== undefined) {
      const bests = { ...((await getAppState('personalBests')) ?? {}) }
      if (result.personalBestBefore === null) delete bests[result.challenge.phase]
      else bests[result.challenge.phase] = result.personalBestBefore
      await setAppState('personalBests', bests)
    }

    const session = await getSession()
    if (session.projectId !== subtask.projectId) return
    if (session.subtaskId !== id) await applyAction({ type: 'switch', subtaskId: id }, 'focus', now)
    if (result.stoppedWork && (await getSession()).state === 'paused') {
      await applyAction({ type: 'start', projectId: subtask.projectId, subtaskId: id }, 'focus', now)
    }
  })
}

// ---------------------------------------------------------------- focus

/**
 * Points the session at a project when entering focus. Uses `preferredSubtaskId` if it's a
 * step still to do (switching to it even if work is running on another step of this
 * project), otherwise the step already in progress, otherwise the next one to do.
 * Never starts the timer.
 */
export async function enterFocus(projectId: string, preferredSubtaskId?: string): Promise<void> {
  await db.transaction('rw', [db.subtasks, db.projects, ...SESSION_TABLES], async () => {
    const session = await getSession()
    const chain = await projectSubtasks(projectId)
    const preferred = chain.find((s) => s.id === preferredSubtaskId && s.status === 'todo')
    if (preferred && session.projectId === projectId) {
      await applyAction({ type: 'switch', subtaskId: preferred.id })
    } else {
      const current = session.projectId === projectId ? chain.find((s) => s.id === session.subtaskId) : undefined
      const target = preferred ?? (current?.status === 'todo' ? current : nextTodo(chain))
      await applyAction({ type: 'target', projectId, subtaskId: target?.id })
    }
    await logEvent('focus_entered', { projectId, subtaskId: (await getSession()).subtaskId })
  })
}

export async function exitFocus(projectId: string, breadcrumb: string, stopTimer: boolean): Promise<void> {
  await db.transaction('rw', [db.projects, ...SESSION_TABLES], async () => {
    if (stopTimer) await applyAction({ type: 'exitStop' }, 'exitDialog')
    await saveBreadcrumb(projectId, breadcrumb)
    await logEvent('focus_exited', { projectId, data: { timerKeptRunning: !stopTimer } })
  })
}

// ---------------------------------------------------------------- challenges

/**
 * Starts a challenge on the session's current step. Any existing challenge is ended first
 * (logged as cancelled), so there is never more than one.
 */
export async function startChallenge(
  subtaskId: string,
  targetMinutes: number,
  source: 'manual' | 'timeboxPrompt',
): Promise<void> {
  await db.transaction('rw', [db.subtasks, ...SESSION_TABLES], async () => {
    const now = Date.now()
    const subtask = await db.subtasks.get(subtaskId)
    await endChallengeInTx('cancelled', subtask?.projectId, now)
    const challenge: Challenge = {
      subtaskId,
      startedAt: now,
      targetMinutes,
      workMsAtStart: await subtaskWorkMs(subtaskId, now),
    }
    await setAppState('challenge', challenge)
    await logEvent('challenge_started', {
      ts: now,
      projectId: subtask?.projectId,
      subtaskId,
      data: { targetMinutes, source },
    })
  })
}

/** Ends the active challenge without a win: cancelled by the user, or time ran out. */
export async function endChallenge(outcome: 'cancelled' | 'timeUp'): Promise<void> {
  await db.transaction('rw', [db.subtasks, ...SESSION_TABLES], async () => {
    const challenge = await getAppState('challenge')
    if (!challenge) return
    const subtask = await db.subtasks.get(challenge.subtaskId)
    await endChallengeInTx(outcome, subtask?.projectId)
  })
}

// ---------------------------------------------------------------- parking lot

export async function parkThought(text: string, projectId?: string): Promise<string> {
  const now = Date.now()
  const id = newId()
  const trimmed = text.trim()
  await db.transaction('rw', db.parkingLot, db.events, async () => {
    await db.parkingLot.add({ id, text: trimmed, projectId, createdAt: now, updatedAt: now, done: false })
    await logEvent('parking_lot_added', { projectId, data: { length: trimmed.length } })
  })
  return id
}

export async function updateParkingItem(id: string, patch: Partial<Omit<ParkingLotItem, 'id'>>): Promise<void> {
  await db.parkingLot.update(id, { ...patch, updatedAt: Date.now() })
}

export async function deleteParkingItem(id: string): Promise<void> {
  await db.parkingLot.delete(id)
}

/** Appends the item to its linked project's chain and marks it done with a link. */
export async function parkingItemToSubtask(id: string): Promise<string | undefined> {
  // One transaction that skips items already done, so a double press can't add it twice.
  return db.transaction('rw', db.parkingLot, db.subtasks, db.projects, db.events, async () => {
    const item = await db.parkingLot.get(id)
    if (!item?.projectId || item.done) return undefined
    const subtaskId = await addSubtask(item.projectId, { title: item.text, description: item.details })
    await updateParkingItem(id, { done: true, convertedTo: { kind: 'subtask', id: subtaskId } })
    return subtaskId
  })
}

/** Creates a project titled with the item, with its notes as the summary. */
export async function parkingItemToProject(id: string): Promise<string | undefined> {
  return db.transaction('rw', db.parkingLot, db.projects, db.events, async () => {
    const item = await db.parkingLot.get(id)
    if (!item || item.done) return undefined
    const projectId = await createProject({ title: item.text, summary: item.details || undefined })
    await updateParkingItem(id, { done: true, convertedTo: { kind: 'project', id: projectId } })
    return projectId
  })
}

export { dispatch }
