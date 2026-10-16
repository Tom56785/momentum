import Dexie from 'dexie'
import { describe, expect, it } from 'vitest'
import { MomentumDB } from './db'

describe('database upgrade to version 2 (tags)', () => {
  it('keeps existing data and adds the tags table and step index', async () => {
    const name = 'upgrade-test'
    // The version 1 schema, as people's existing databases have it.
    const v1 = new Dexie(name)
    v1.version(1).stores({
      projects: 'id, status, updatedAt, externalKey',
      subtasks: 'id, projectId, [projectId+order], status',
      segments: 'id, kind, projectId, subtaskId, startedAt, endedAt',
      events: '++seq, ts, type, projectId, subtaskId',
      parkingLot: 'id, createdAt, done',
      settings: 'key',
      appState: 'key',
    })
    await v1.table('subtasks').add({ id: 's1', projectId: 'p1', order: 0, title: 'Old step', notes: '', status: 'todo', createdAt: 1 })
    v1.close()

    const db = new MomentumDB(name)
    await db.open()
    expect(db.verno).toBe(2)
    expect((await db.subtasks.get('s1'))?.title).toBe('Old step')
    expect(await db.tags.count()).toBe(0)
    await db.subtasks.update('s1', { tags: ['t1'] })
    expect(await db.subtasks.where('tags').equals('t1').count()).toBe(1)
    db.close()
    await Dexie.delete(name)
  })
})
