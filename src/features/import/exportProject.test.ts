import { beforeEach, describe, expect, it } from 'vitest'
import example from '../../../schema/example-import.json'
import { db } from '../../db/db'
import type { Project, Subtask } from '../../db/types'
import { resetDb } from '../../test/dbHelpers'
import { exportFileName, projectToImportDoc } from './exportProject'
import { importProjects } from './importProjects'
import { AI_PROMPT_TEMPLATE, buildAiPrompt, IMPORT_JSON_SCHEMA_TEXT } from './importSchema'
import { parseImport } from './parseImport'

beforeEach(resetDb)

const project = (fields: Partial<Project> = {}): Project => ({
  id: 'p',
  title: 'Fix login',
  status: 'active',
  createdAt: 0,
  updatedAt: 0,
  ...fields,
})

const step = (order: number, fields: Partial<Subtask> = {}): Subtask => ({
  id: `s${order}`,
  projectId: 'p',
  order,
  title: `Step ${order}`,
  notes: 'private notes are not exported',
  status: 'todo',
  createdAt: 0,
  ...fields,
})

describe('projectToImportDoc', () => {
  it('round-trips an imported project', async () => {
    const parsed = parseImport(JSON.stringify(example))
    if (parsed.ok !== true) throw new Error('example should parse')
    const [id] = await importProjects(parsed.doc)
    const stored = (await db.projects.get(id))!
    const subtasks = await db.subtasks.where('projectId').equals(id).toArray()
    const exported = projectToImportDoc(stored, subtasks)
    expect(exported).toEqual(parsed.doc)
    // And the file text imports cleanly again.
    expect(parseImport(JSON.stringify(exported)).ok).toBe(true)
  })

  it('keeps chain order and leaves out progress and notes', () => {
    const doc = projectToImportDoc(project(), [step(2, { status: 'done' }), step(0), step(1)])!
    expect(doc.projects[0].subtasks.map((s) => s.title)).toEqual(['Step 0', 'Step 1', 'Step 2'])
    expect(JSON.stringify(doc)).not.toContain('private notes')
    expect(JSON.stringify(doc)).not.toContain('done')
  })

  it('drops values the importer would reject instead of producing a broken file', () => {
    const doc = projectToImportDoc(
      project({ url: 'not a link', targetDate: '22/10/2026', summary: '   ', title: 'x'.repeat(250) }),
      [step(0, { timeboxMinutes: 600 }), step(1, { timeboxMinutes: 25, title: '  ' })],
    )!
    const p = doc.projects[0]
    expect(p.url).toBeUndefined()
    expect(p.targetDate).toBeUndefined()
    expect(p.summary).toBeUndefined()
    expect(p.title).toHaveLength(200)
    expect(p.subtasks[0].timeboxMinutes).toBeUndefined()
    expect(p.subtasks[1]).toMatchObject({ title: 'Untitled step', timeboxMinutes: 25 })
  })

  it('returns nothing for a project without steps', () => {
    expect(projectToImportDoc(project(), [])).toBeUndefined()
  })
})

describe('exportFileName', () => {
  it('uses the ticket key, or a slug of the title', () => {
    expect(exportFileName(project({ externalKey: 'SHOP-482' }))).toBe('SHOP-482.json')
    expect(exportFileName(project({ title: 'Fix duplicate emails!' }))).toBe('fix-duplicate-emails.json')
    expect(exportFileName(project({ title: '???' }))).toBe('project.json')
  })
})

describe('buildAiPrompt', () => {
  it('fills the schema into the default or a custom template', () => {
    expect(buildAiPrompt()).toBe(AI_PROMPT_TEMPLATE.replace('{{SCHEMA}}', IMPORT_JSON_SCHEMA_TEXT.trim()))
    const custom = buildAiPrompt('Short version.\n{{SCHEMA}}\nThanks')
    expect(custom.startsWith('Short version.\n{')).toBe(true)
    expect(custom).toContain('"$id": "momentum-import-v1"')
    expect(custom.endsWith('Thanks')).toBe(true)
    expect(buildAiPrompt('No schema here')).toBe('No schema here')
  })
})
