import { challengeElapsedMs, nextTodo, sortByOrder } from '../domain/rules'
import type { Via } from '../domain/session'
import { MINUTE, workMs } from '../domain/time'
import { db, newId } from './db'
import { applyAction, dispatch, SESSION_TABLES } from './session'
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

export async function setProjectStatus(id: string, status: Project['status']): Promise<void> {
  const now = Date.now()
  await db.projects.update(id, {
    status,
    updatedAt: now,
    completedAt: status === 'done' ? now : undefined,
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

export async function clearBreadcrumb(projectId: string): Promise<void> {
  await db.projects.update(projectId, { breadcrumb: undefined })
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
  await db.transaction('rw', db.subtasks, db.projects, async () => {
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
    const project = await db.projects.get(projectId)
    // Adding work to a finished project re-opens it.
    if (project?.status === 'done') await db.projects.update(projectId, { status: 'active', completedAt: undefined })
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
    await db.projects.update(subtask.projectId, { updatedAt: Date.now() })
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
  nextSubtaskId?: string
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
    if (session.subtaskId === id) {
      await applyAction({ type: 'complete', nextSubtaskId: next?.id }, via, now)
    }

    await db.subtasks.update(id, { status: 'done', completedAt: now })
    const subtaskSegments = await db.segments.where('subtaskId').equals(id).toArray()
    const subtaskWorkMs = workMs(subtaskSegments, now)
    await logEvent('subtask_completed', {
      ts: now,
      projectId: subtask.projectId,
      subtaskId: id,
      data: { workMs: subtaskWorkMs, timeboxMinutes: subtask.timeboxMinutes, phase: subtask.phase },
    })

    const result: CompleteResult = { nextSubtaskId: next?.id, projectCompleted: false }

    const challenge = await getAppState('challenge')
    if (challenge?.subtaskId === id) {
      const elapsedMs = challengeElapsedMs(challenge, subtaskWorkMs)
      const outcome = elapsedMs <= challenge.targetMinutes * MINUTE ? 'beat' : 'timeUp'
      const phase: Phase = subtask.phase ?? 'other'
      let newPersonalBest = false
      if (outcome === 'beat') {
        const bests = (await getAppState('personalBests')) ?? {}
        if (bests[phase] === undefined || elapsedMs < (bests[phase] ?? Infinity)) {
          newPersonalBest = true
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
      const projectSegments = await db.segments.where('projectId').equals(subtask.projectId).toArray()
      const totalWorkMs = workMs(projectSegments, now)
      await db.projects.update(subtask.projectId, { status: 'done', completedAt: now, updatedAt: now })
      await logEvent('project_completed', { ts: now, projectId: subtask.projectId, data: { totalWorkMs } })
      result.projectCompleted = true
      result.totalWorkMs = totalWorkMs
    } else {
      await db.projects.update(subtask.projectId, { updatedAt: now })
    }
    return result
  })
}

/** Marks a done subtask as to-do again (re-opening its project if needed). */
export async function reopenSubtask(id: string): Promise<void> {
  await db.transaction('rw', db.subtasks, db.projects, async () => {
    const subtask = await db.subtasks.get(id)
    if (!subtask) return
    await db.subtasks.update(id, { status: 'todo', completedAt: undefined })
    const project = await db.projects.get(subtask.projectId)
    if (project?.status === 'done') {
      await db.projects.update(project.id, { status: 'active', completedAt: undefined, updatedAt: Date.now() })
    }
  })
}

// ---------------------------------------------------------------- focus

/** Points the session at a project when entering focus, choosing its next incomplete subtask. */
export async function enterFocus(projectId: string): Promise<void> {
  await db.transaction('rw', [db.subtasks, db.projects, ...SESSION_TABLES], async () => {
    const session = await getSession()
    const chain = await projectSubtasks(projectId)
    const current = session.projectId === projectId ? chain.find((s) => s.id === session.subtaskId) : undefined
    const target = current?.status === 'todo' ? current : nextTodo(chain)
    await applyAction({ type: 'target', projectId, subtaskId: target?.id })
    await logEvent('focus_entered', { projectId, subtaskId: target?.id })
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

export async function startChallenge(
  subtaskId: string,
  targetMinutes: number,
  subtaskWorkMs: number,
  source: 'manual' | 'timeboxPrompt',
): Promise<void> {
  const challenge: Challenge = { subtaskId, startedAt: Date.now(), targetMinutes, workMsAtStart: subtaskWorkMs }
  const subtask = await db.subtasks.get(subtaskId)
  await db.transaction('rw', db.appState, db.events, async () => {
    await setAppState('challenge', challenge)
    await logEvent('challenge_started', {
      projectId: subtask?.projectId,
      subtaskId,
      data: { targetMinutes, source },
    })
  })
}

/** Ends the active challenge without a win: cancelled by the user, or time ran out. */
export async function endChallenge(outcome: 'cancelled' | 'timeUp', subtaskWorkMs: number): Promise<void> {
  await db.transaction('rw', db.appState, db.events, db.subtasks, async () => {
    const challenge = await getAppState('challenge')
    if (!challenge) return
    const subtask = await db.subtasks.get(challenge.subtaskId)
    await deleteAppState('challenge')
    await logEvent('challenge_ended', {
      projectId: subtask?.projectId,
      subtaskId: challenge.subtaskId,
      data: { outcome, elapsedMs: challengeElapsedMs(challenge, subtaskWorkMs), targetMinutes: challenge.targetMinutes },
    })
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
  const item = await db.parkingLot.get(id)
  if (!item?.projectId) return undefined
  const subtaskId = await addSubtask(item.projectId, { title: item.text, description: item.details })
  await updateParkingItem(id, { done: true, convertedTo: { kind: 'subtask', id: subtaskId } })
  return subtaskId
}

/** Creates a project titled with the item, with its notes as the summary. */
export async function parkingItemToProject(id: string): Promise<string | undefined> {
  const item = await db.parkingLot.get(id)
  if (!item) return undefined
  const projectId = await createProject({ title: item.text, summary: item.details || undefined })
  await updateParkingItem(id, { done: true, convertedTo: { kind: 'project', id: projectId } })
  return projectId
}

export { dispatch }
