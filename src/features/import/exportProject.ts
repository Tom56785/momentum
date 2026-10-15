import { z } from 'zod'
import type { Project, Subtask } from '../../db/types'
import { importDocumentSchema, type ImportDocument } from './importSchema'

const MAX_TITLE = 200

function text(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function title(value: string): string {
  const t = value.trim()
  return t.length > MAX_TITLE ? `${t.slice(0, MAX_TITLE - 1)}…` : t
}

/** Keeps a value only if it passes the given schema (e.g. a URL typed by hand that isn't one). */
function valid(value: string | undefined, schema: z.ZodType<string>): string | undefined {
  const v = text(value)
  return v !== undefined && schema.safeParse(v).success ? v : undefined
}

/**
 * Builds an import-format (schemaVersion 1) document for one project, so it can be
 * re-imported or shared. Values that wouldn't pass the import schema are dropped rather than
 * producing a file that can't be imported. Returns undefined for a project with no steps,
 * since the schema requires at least one.
 */
export function projectToImportDoc(project: Project, subtasks: readonly Subtask[]): ImportDocument | undefined {
  if (subtasks.length === 0) return undefined
  const doc: ImportDocument = {
    schemaVersion: 1,
    projects: [
      {
        title: title(project.title) || 'Untitled project',
        externalKey: text(project.externalKey),
        url: valid(project.url, z.url()),
        summary: text(project.summary),
        problem: text(project.problem),
        cause: text(project.cause),
        solution: text(project.solution),
        targetDate: valid(project.targetDate, z.iso.date()),
        subtasks: [...subtasks]
          .sort((a, b) => a.order - b.order)
          .map((s) => ({
            title: title(s.title) || 'Untitled step',
            description: text(s.description),
            phase: s.phase,
            timeboxMinutes:
              s.timeboxMinutes && Number.isInteger(s.timeboxMinutes) && s.timeboxMinutes >= 1 && s.timeboxMinutes <= 480
                ? s.timeboxMinutes
                : undefined,
          })),
      },
    ],
  }
  // Belt and braces: never hand out a file the importer would reject.
  return importDocumentSchema.parse(JSON.parse(JSON.stringify(doc)))
}

/** A filesystem-friendly name, e.g. "SHOP-482.json" or "fix-duplicate-emails.json". */
export function exportFileName(project: Project): string {
  const slug = (project.externalKey || project.title)
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  // Ticket keys keep their case (SHOP-482); titles become lower-case slugs.
  return `${(project.externalKey ? slug : slug.toLowerCase()) || 'project'}.json`
}

export function downloadJson(fileName: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
