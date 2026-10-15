import { ALL_TABLES, db } from '../db/db'

export async function resetDb(): Promise<void> {
  await db.open()
  await db.transaction('rw', ALL_TABLES.map((t) => db.table(t)), async () => {
    await Promise.all(ALL_TABLES.map((t) => db.table(t).clear()))
  })
}
