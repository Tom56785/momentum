// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/db'
import type { Segment } from '../db/types'
import { resetDb } from '../test/dbHelpers'
import { useSegmentsFor } from './useData'

beforeEach(async () => {
  await resetDb()
  await db.segments.bulkAdd([
    { id: 'a1', kind: 'work', subtaskId: 'A', startedAt: 0, endedAt: 20 * 60_000 },
    { id: 'b1', kind: 'work', subtaskId: 'B', startedAt: 0, endedAt: 60_000 },
  ])
})

describe('useSegmentsFor', () => {
  it("never returns one step's segments for another while switching", async () => {
    const seen: { id: string; segments: Segment[] }[] = []
    const hook = renderHook(({ id }) => {
      const segments = useSegmentsFor('subtaskId', id)
      seen.push({ id, segments })
      return segments
    }, { initialProps: { id: 'A' } })
    await waitFor(() => expect(hook.result.current.map((s) => s.id)).toEqual(['a1']))
    hook.rerender({ id: 'B' })
    await waitFor(() => expect(hook.result.current.map((s) => s.id)).toEqual(['b1']))
    // Every render for B saw either nothing yet or B's own segments.
    for (const r of seen.filter((r) => r.id === 'B')) {
      expect(r.segments.every((s) => s.subtaskId === 'B')).toBe(true)
    }
  })
})
