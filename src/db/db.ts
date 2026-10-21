import Dexie, { type EntityTable, type Table } from 'dexie'
import type { AppEvent, KeyValueRow, ParkingLotItem, Project, Segment, Subtask, Tag } from './types'

export class MomentumDB extends Dexie {
  projects!: EntityTable<Project, 'id'>
  subtasks!: EntityTable<Subtask, 'id'>
  segments!: EntityTable<Segment, 'id'>
  events!: EntityTable<AppEvent, 'seq'>
  parkingLot!: EntityTable<ParkingLotItem, 'id'>
  tags!: EntityTable<Tag, 'id'>
  settings!: Table<KeyValueRow, string>
  appState!: Table<KeyValueRow, string>

  constructor(name = 'momentum') {
    super(name)
    this.version(1).stores({
      projects: 'id, status, updatedAt, externalKey',
      subtasks: 'id, projectId, [projectId+order], status',
      segments: 'id, kind, projectId, subtaskId, startedAt, endedAt',
      events: '++seq, ts, type, projectId, subtaskId',
      parkingLot: 'id, createdAt, done',
      settings: 'key',
      appState: 'key',
    })
    // Tags for steps; steps are indexed by tag so a tag's usage can be found.
    this.version(2).stores({
      subtasks: 'id, projectId, [projectId+order], status, *tags',
      tags: 'id, name',
    })
    // Projects no longer have a cause: drop it from the ones saved before.
    this.version(3).upgrade((tx) =>
      tx
        .table('projects')
        .toCollection()
        .modify((project) => {
          delete project.cause
        }),
    )
  }
}

export const db = new MomentumDB()

export const ALL_TABLES = [
  'projects',
  'subtasks',
  'segments',
  'events',
  'parkingLot',
  'tags',
  'settings',
  'appState',
] as const

export type TableName = (typeof ALL_TABLES)[number]

export const newId = (): string => crypto.randomUUID()
