import { beforeEach, describe, expect, it } from 'vitest'
import jsonSchema from '../../../schema/momentum-import-v1.schema.json'
import example from '../../../schema/example-import.json'
import { db } from '../../db/db'
import { resetDb } from '../../test/dbHelpers'
import { findDuplicates, importProjects } from './importProjects'
import { buildAiPrompt, importProjectSchema, importSubtaskSchema } from './importSchema'
import { parseImport, stripCodeFence } from './parseImport'

const exampleText = JSON.stringify(example)

beforeEach(resetDb)

describe('parseImport', () => {
  it('accepts the documented example', () => {
    const result = parseImport(exampleText)
    expect(result.ok).toBe(true)
  })

  it('tolerates a wrapping code fence and surrounding chatter', () => {
    const fenced = 'Here you go:\n```json\n' + exampleText + '\n```\nHope this helps'
    expect(stripCodeFence(fenced)).toBe(exampleText)
    expect(parseImport(fenced).ok).toBe(true)
  })

  it('treats blank input as empty, not an error', () => {
    expect(parseImport('   ').ok).toBe('empty')
  })

  it('gives a friendly message for broken JSON', () => {
    const result = parseImport('{ "schemaVersion": 1, ')
    expect(result.ok).toBe(false)
    if (result.ok === false) expect(result.errors[0]).toMatch(/^This isn't valid JSON yet/)
  })

  it('reports errors with paths', () => {
    const bad = structuredClone(example) as Record<string, unknown> & { projects: Record<string, unknown>[] }
    ;(bad.projects[0].subtasks as Record<string, unknown>[])[2].title = ''
    ;(bad.projects[0].subtasks as Record<string, unknown>[])[1].timeboxMinutes = 2.5
    bad.projects[0].colour = 'blue'
    bad.projects[0].url = 'not a url'
    const result = parseImport(JSON.stringify(bad))
    expect(result.ok).toBe(false)
    if (result.ok !== false) return
    expect(result.errors).toContain('projects[0].subtasks[2].title is empty')
    expect(result.errors).toContain('projects[0].subtasks[1].timeboxMinutes should be a whole number')
    expect(result.errors).toContain('projects[0] has an unknown field: "colour"')
    expect(result.errors.some((e) => e.startsWith('projects[0].url should be a full link'))).toBe(true)
  })

  it('reports missing required fields and wrong version', () => {
    const result = parseImport(JSON.stringify({ schemaVersion: 2, projects: [{ subtasks: [] }] }))
    if (result.ok !== false) throw new Error('expected errors')
    expect(result.errors).toContain('schemaVersion should be 1')
    expect(result.errors).toContain('projects[0].title is missing')
    expect(result.errors).toContain('projects[0].subtasks needs at least 1 item')
  })
})

describe('JSON Schema and Zod stay in sync', () => {
  it('has the same fields', () => {
    const projectProps = jsonSchema.properties.projects.items.properties
    expect(Object.keys(projectProps).sort()).toEqual(Object.keys(importProjectSchema.shape).sort())
    expect(Object.keys(projectProps.subtasks.items.properties).sort()).toEqual(
      Object.keys(importSubtaskSchema.shape).sort(),
    )
  })

  it('embeds the schema in the AI prompt', () => {
    const prompt = buildAiPrompt()
    expect(prompt).toContain('"$id": "momentum-import-v1"')
    expect(prompt).toContain('{{PASTE TICKET HERE}}')
    expect(prompt).not.toContain('{{SCHEMA}}')
  })
})

describe('importProjects', () => {
  it('creates projects and ordered subtasks, and logs the import', async () => {
    const result = parseImport(exampleText)
    if (result.ok !== true) throw new Error('invalid')
    const [id] = await importProjects(result.doc)
    const project = await db.projects.get(id)
    expect(project).toMatchObject({ title: example.projects[0].title, externalKey: 'SHOP-482', status: 'active' })
    const subtasks = await db.subtasks.where('projectId').equals(id).sortBy('order')
    expect(subtasks.map((s) => s.title)).toEqual(example.projects[0].subtasks.map((s) => s.title))
    const event = await db.events.where('type').equals('project_imported').first()
    expect(event?.data).toMatchObject({ subtaskCount: 6, totalTimeboxMinutes: 125 })
  })

  it('handles a duplicate externalKey by replacing subtasks or importing as new', async () => {
    const result = parseImport(exampleText)
    if (result.ok !== true) throw new Error('invalid')
    const [firstId] = await importProjects(result.doc)
    const dups = await findDuplicates(result.doc)
    expect(dups.get(0)?.id).toBe(firstId)

    const [replacedId] = await importProjects(result.doc, new Map([[0, 'replace']]))
    expect(replacedId).toBe(firstId)
    expect(await db.projects.count()).toBe(1)
    expect(await db.subtasks.where('projectId').equals(firstId).count()).toBe(6)

    const [newId] = await importProjects(result.doc, new Map([[0, 'new']]))
    expect(newId).not.toBe(firstId)
    expect(await db.projects.count()).toBe(2)
  })
})
