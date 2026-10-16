import { db, newId } from './db'
import type { Tag } from './types'

export const MAX_TAG_NAME = 30

/** Trims and collapses spaces; long names are cut to the maximum length. */
export function normaliseTagName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').slice(0, MAX_TAG_NAME).trim()
}

const sameName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0

/** A random, readable chip colour (any hue, fixed saturation and lightness). */
export function randomTagColor(random: () => number = Math.random): string {
  return hslToHex(Math.floor(random() * 360), 62, 48)
}

function hslToHex(h: number, s: number, l: number): string {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100)
  const channel = (n: number) => {
    const k = (n + h / 30) % 12
    const c = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${channel(0)}${channel(8)}${channel(4)}`
}

export function sortTags(tags: readonly Tag[]): Tag[] {
  return [...tags].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
}

/** The existing tag with this name, ignoring case. */
export async function findTagByName(name: string): Promise<Tag | undefined> {
  const wanted = normaliseTagName(name)
  return (await db.tags.toArray()).find((t) => sameName(t.name, wanted))
}

/**
 * Resolves tag names to IDs, creating any that don't exist yet (with a random colour).
 * Duplicates, ignoring case, collapse to one. Call inside a transaction that includes
 * db.tags, or on its own.
 */
export async function ensureTags(names: readonly string[], now = Date.now()): Promise<string[]> {
  const existing = await db.tags.toArray()
  const ids: string[] = []
  for (const raw of names) {
    const name = normaliseTagName(raw)
    if (!name) continue
    let tag = existing.find((t) => sameName(t.name, name))
    if (!tag) {
      tag = { id: newId(), name, color: randomTagColor(), createdAt: now }
      await db.tags.add(tag)
      existing.push(tag)
    }
    if (!ids.includes(tag.id)) ids.push(tag.id)
  }
  return ids
}

/** The names of the tags that `names` would create (not existing yet), deduplicated. */
export function newTagNames(names: readonly string[], existing: readonly Tag[]): string[] {
  const out: string[] = []
  for (const raw of names) {
    const name = normaliseTagName(raw)
    if (!name || existing.some((t) => sameName(t.name, name)) || out.some((n) => sameName(n, name))) continue
    out.push(name)
  }
  return out
}

export type TagResult = { ok: true; id: string } | { ok: false; error: string }

/** Creates a tag, or explains why not (empty, or the name is taken). */
export async function createTag(name: string, color = randomTagColor()): Promise<TagResult> {
  const clean = normaliseTagName(name)
  if (!clean) return { ok: false, error: 'A tag needs a name' }
  if (await findTagByName(clean)) return { ok: false, error: `There's already a tag called "${clean}"` }
  const id = newId()
  await db.tags.add({ id, name: clean, color, createdAt: Date.now() })
  return { ok: true, id }
}

/** Renames a tag; refuses an empty name or one another tag already has. */
export async function renameTag(id: string, name: string): Promise<TagResult> {
  const clean = normaliseTagName(name)
  if (!clean) return { ok: false, error: 'A tag needs a name' }
  const clash = await findTagByName(clean)
  if (clash && clash.id !== id) return { ok: false, error: `There's already a tag called "${clash.name}"` }
  await db.tags.update(id, { name: clean })
  return { ok: true, id }
}

export async function setTagColor(id: string, color: string): Promise<void> {
  if (/^#[0-9a-f]{6}$/i.test(color)) await db.tags.update(id, { color: color.toLowerCase() })
}

/** Deletes a tag and takes it off every step that had it. */
export async function deleteTag(id: string): Promise<void> {
  await db.transaction('rw', [db.tags, db.subtasks], async () => {
    await db.subtasks
      .where('tags')
      .equals(id)
      .modify((s) => {
        s.tags = (s.tags ?? []).filter((t) => t !== id)
      })
    await db.tags.delete(id)
  })
}

/** Adds or removes one tag on a step. */
export async function toggleSubtaskTag(subtaskId: string, tagId: string): Promise<void> {
  await db.transaction('rw', [db.subtasks], async () => {
    const subtask = await db.subtasks.get(subtaskId)
    if (!subtask) return
    const tags = subtask.tags ?? []
    const next = tags.includes(tagId) ? tags.filter((t) => t !== tagId) : [...tags, tagId]
    await db.subtasks.update(subtaskId, { tags: next.length ? next : undefined })
  })
}

/** How many steps use each tag. */
export async function tagUsage(): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  await db.subtasks.each((s) => {
    for (const t of s.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1)
  })
  return counts
}
