import { useEffect, useLayoutEffect, useRef, useState } from 'react'

/**
 * Local draft state for an autosaved field. Saves `delay` ms after the last edit, on flush
 * (e.g. blur) and on unmount if anything is pending. External changes are adopted while clean.
 */
export function useAutosave(
  value: string,
  save: (next: string) => void | Promise<void>,
  delay = 500,
): [string, (next: string) => void, () => void] {
  const [draft, setDraft] = useState(value)
  const [lastValue, setLastValue] = useState(value)
  const [dirty, setDirty] = useState(false)
  const pending = useRef<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Adopt external updates (another tab, an import) when there is no unsaved edit.
  if (value !== lastValue) {
    setLastValue(value)
    if (!dirty) setDraft(value)
  }

  // Always call the latest save callback, even from a pending timer or unmount.
  const saveRef = useRef(save)
  useLayoutEffect(() => {
    saveRef.current = save
  })
  const doSave = (next: string) => void saveRef.current(next)

  const flush = () => {
    clearTimeout(timer.current)
    if (pending.current !== null) {
      doSave(pending.current)
      pending.current = null
    }
    setDirty(false)
  }

  const update = (next: string) => {
    setDraft(next)
    setDirty(true)
    pending.current = next
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, delay)
  }

  useEffect(
    () => () => {
      clearTimeout(timer.current)
      if (pending.current !== null) void saveRef.current(pending.current)
    },
    [],
  )

  return [draft, update, flush]
}
