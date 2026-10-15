// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAutosave, type AutosaveFn } from './useDebounced'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

/** Renders the hook against a fake "database" value that a trimming save updates. */
function setup(initial: string, accept: (v: string) => boolean = () => true) {
  let stored = initial
  const save = vi.fn<AutosaveFn>((v) => {
    if (!accept(v)) return false
    stored = v.trim()
  })
  const hook = renderHook(({ value }) => useAutosave(value, save), { initialProps: { value: stored } })
  const syncFromDb = () => hook.rerender({ value: stored })
  return { hook, save, syncFromDb, draft: () => hook.result.current[0] }
}

describe('useAutosave', () => {
  it('saves after a pause but keeps trailing spaces and newlines while typing', () => {
    const { hook, save, syncFromDb, draft } = setup('')
    act(() => hook.result.current[1]('First line\n'))
    act(() => vi.advanceTimersByTime(500))
    expect(save).toHaveBeenCalledWith('First line\n')
    syncFromDb() // the trimmed value comes back from the database
    expect(draft()).toBe('First line\n')
    act(() => hook.result.current[1]('First line\nSecond'))
    expect(draft()).toBe('First line\nSecond')
  })

  it('shows the stored (trimmed) value after leaving the field', () => {
    const { hook, syncFromDb, draft } = setup('')
    act(() => hook.result.current[1]('Fix bug '))
    act(() => vi.advanceTimersByTime(500))
    syncFromDb()
    act(() => hook.result.current[2]())
    expect(draft()).toBe('Fix bug')
  })

  it('reverts to the stored value when the save is rejected (empty title)', () => {
    const { hook, syncFromDb, draft } = setup('Old title', (v) => v.trim() !== '')
    act(() => hook.result.current[1](''))
    act(() => hook.result.current[2]())
    syncFromDb()
    expect(draft()).toBe('Old title')
  })

  it('reverts even when the rejected save already ran on the timer', () => {
    const { hook, draft } = setup('Old title', (v) => v.trim() !== '')
    act(() => hook.result.current[1]('   '))
    act(() => vi.advanceTimersByTime(500))
    act(() => hook.result.current[2]())
    expect(draft()).toBe('Old title')
  })

  it('adopts outside changes when not editing', () => {
    const { hook, draft } = setup('a')
    hook.rerender({ value: 'from another tab' })
    expect(draft()).toBe('from another tab')
  })
})
