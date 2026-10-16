import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb } from '../test/dbHelpers'
import { addSubtask, createProject } from './actions'
import { db } from './db'
import {
  createTag,
  deleteTag,
  ensureTags,
  newTagNames,
  normaliseTagName,
  randomTagColor,
  renameTag,
  setTagColor,
  tagUsage,
  toggleSubtaskTag,
} from './tags'

beforeEach(resetDb)

describe('tags', () => {
  it('normalises names and picks a random #rrggbb colour', () => {
    expect(normaliseTagName('  front   end ')).toBe('front end')
    expect(normaliseTagName('x'.repeat(40))).toHaveLength(30)
    expect(randomTagColor(() => 0)).toMatch(/^#[0-9a-f]{6}$/)
    expect(randomTagColor(() => 0.5)).not.toBe(randomTagColor(() => 0))
  })

  it('refuses empty or duplicate names, ignoring case', async () => {
    expect(await createTag('   ')).toEqual({ ok: false, error: 'A tag needs a name' })
    const backend = await createTag('Backend')
    expect(backend.ok).toBe(true)
    expect((await createTag('backend')).ok).toBe(false)
    const docs = await createTag('docs')
    if (!docs.ok || !backend.ok) throw new Error('expected tags')
    expect((await renameTag(docs.id, 'BACKEND')).ok).toBe(false)
    expect((await renameTag(docs.id, 'Docs')).ok).toBe(true)
    expect((await db.tags.get(docs.id))?.name).toBe('Docs')
    await setTagColor(docs.id, '#ABCDEF')
    expect((await db.tags.get(docs.id))?.color).toBe('#abcdef')
    await setTagColor(docs.id, 'red')
    expect((await db.tags.get(docs.id))?.color).toBe('#abcdef')
  })

  it('ensureTags reuses existing tags, creates missing ones and merges duplicates', async () => {
    const existing = await createTag('backend')
    if (!existing.ok) throw new Error('expected tag')
    const ids = await ensureTags(['Backend', 'testing', 'TESTING', ' '])
    expect(ids).toHaveLength(2)
    expect(ids[0]).toBe(existing.id)
    const created = await db.tags.get(ids[1])
    expect(created?.name).toBe('testing')
    expect(created?.color).toMatch(/^#[0-9a-f]{6}$/)
    expect(newTagNames(['backend', 'Docs', 'docs', 'testing'], await db.tags.toArray())).toEqual(['Docs'])
  })

  it('toggles tags on steps, counts usage, and deleting a tag takes it off steps', async () => {
    const projectId = await createProject({ title: 'P' })
    const a = await addSubtask(projectId, { title: 'A' })
    const b = await addSubtask(projectId, { title: 'B' })
    const tag = await createTag('backend')
    if (!tag.ok) throw new Error('expected tag')
    await toggleSubtaskTag(a, tag.id)
    await toggleSubtaskTag(b, tag.id)
    expect((await tagUsage()).get(tag.id)).toBe(2)
    await toggleSubtaskTag(b, tag.id)
    expect((await db.subtasks.get(b))?.tags).toBeUndefined()
    expect((await tagUsage()).get(tag.id)).toBe(1)

    await deleteTag(tag.id)
    expect(await db.tags.count()).toBe(0)
    expect((await db.subtasks.get(a))?.tags).toEqual([])
  })
})
