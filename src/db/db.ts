import Dexie, { type EntityTable, type Table } from 'dexie'
import type { AppEvent, KeyValueRow, ParkingLotItem, Project, Segment, Subtask } from './types'

export class MomentumDB extends Dexie {
  projects!: EntityTable<Project, 'id'>
  subtasks!: EntityTable<Subtask, 'id'>
  segments!: EntityTable<Segment, 'id'>
  events!: EntityTable<AppEvent, 'seq'>
  parkingLot!: EntityTable<ParkingLotItem, 'id'>
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
  }
}

export const db = new MomentumDB()

export const ALL_TABLES = [
  'projects',
  'subtasks',
  'segments',
  'events',
  'parkingLot',
  'settings',
  'appState',
] as const

export type TableName = (typeof ALL_TABLES)[number]

export const newId = (): string => crypto.randomUUID()
