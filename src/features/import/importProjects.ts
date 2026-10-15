import { db, newId } from '../../db/db'
import { applyAction, SESSION_TABLES } from '../../db/session'
import { getSession, logEvent } from '../../db/store'
import type { Project, Subtask } from '../../db/types'
import type { ImportDocument, ImportProject } from './importSchema'
import { totalTimeboxMinutes } from './parseImport'

export type DuplicateChoice = 'replace' | 'new'

/** Existing active-or-not projects that share an externalKey with the import, by index. */
export async function findDuplicates(doc: ImportDocument): Promise<Map<number, Project>> {
  const found = new Map<number, Project>()
  for (const [i, p] of doc.projects.entries()) {
    if (!p.externalKey) continue
    const existing = await db.projects.where('externalKey').equals(p.externalKey).first()
    if (existing) found.set(i, existing)
  }
  return found
}

function projectFields(p: ImportProject) {
  return {
    title: p.title,
    externalKey: p.externalKey,
    url: p.url,
    summary: p.summary,
    problem: p.problem,
    cause: p.cause,
    solution: p.solution,
    targetDate: p.targetDate,
  }
}

function buildSubtasks(projectId: string, p: ImportProject, now: number): Subtask[] {
  return p.subtasks.map((s, order) => ({
    id: newId(),
    projectId,
    order,
    title: s.title,
    description: s.description,
    phase: s.phase,
    timeboxMinutes: s.timeboxMinutes,
    notes: '',
    status: 'todo',
    createdAt: now,
  }))
}

/**
 * Creates everything in one transaction. For projects whose externalKey already exists,
 * `choices` decides between replacing that project's subtasks or importing as new.
 * Returns the IDs of the created or updated projects, in document order.
 */
export async function importProjects(
  doc: ImportDocument,
  choices: Map<number, DuplicateChoice> = new Map(),
): Promise<string[]> {
  return db.transaction('rw', [db.projects, db.subtasks, ...SESSION_TABLES], async () => {
    const ids: string[] = []
    const now = Date.now()
    for (const [i, p] of doc.projects.entries()) {
      const existing = p.externalKey
        ? await db.projects.where('externalKey').equals(p.externalKey).first()
        : undefined
      const choice = existing ? (choices.get(i) ?? 'new') : 'new'
      let projectId: string
      if (existing && choice === 'replace') {
        projectId = existing.id
        // The session may point at a subtask that is about to be replaced.
        if ((await getSession()).projectId === projectId) await applyAction({ type: 'clear' })
        await db.subtasks.where('projectId').equals(projectId).delete()
        if (existing.status === 'done') {
          await logEvent('project_reopened', { ts: now, projectId, data: { reason: 'reimported' } })
        }
        await db.projects.update(projectId, {
          ...projectFields(p),
          status: 'active',
          completedAt: undefined,
          updatedAt: now,
        })
      } else {
        projectId = newId()
        await db.projects.add({ ...projectFields(p), id: projectId, status: 'active', createdAt: now, updatedAt: now })
      }
      await db.subtasks.bulkAdd(buildSubtasks(projectId, p, now))
      await logEvent('project_imported', {
        ts: now,
        projectId,
        data: { subtaskCount: p.subtasks.length, totalTimeboxMinutes: totalTimeboxMinutes(p), replaced: choice === 'replace' },
      })
      ids.push(projectId)
    }
    return ids
  })
}
