import { useEffect, useLayoutEffect, useRef, useState } from 'react'

/** Return `false` from a save callback to reject the value (e.g. an empty title). */
export type AutosaveFn = (next: string) => void | boolean | Promise<void>

/**
 * Local draft state for an autosaved field. Saves `delay` ms after the last edit, on flush
 * (call it on blur) and on unmount if anything is pending.
 *
 * While the field is being edited the draft is never replaced, even by our own saves, so
 * trimming on save can't eat a trailing space or newline mid-typing. After flush, the field
 * adopts the stored value, and if the last save was rejected it reverts to it.
 */
export function useAutosave(
  value: string,
  save: AutosaveFn,
  delay = 500,
): [string, (next: string) => void, () => void] {
  const [draft, setDraft] = useState(value)
  const [lastValue, setLastValue] = useState(value)
  const [editing, setEditing] = useState(false)
  const pending = useRef<string | null>(null)
  const rejected = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Adopt external updates (another tab, an import, our own trimmed save) when not editing.
  if (value !== lastValue) {
    setLastValue(value)
    if (!editing) setDraft(value)
  }

  // Always call the latest save callback, even from a pending timer or unmount.
  const saveRef = useRef(save)
  useLayoutEffect(() => {
    saveRef.current = save
  })

  const savePending = () => {
    clearTimeout(timer.current)
    if (pending.current === null) return
    const next = pending.current
    pending.current = null
    rejected.current = saveRef.current(next) === false
  }

  const flush = () => {
    const hadPending = pending.current !== null
    savePending()
    setEditing(false)
    // Saved just now and accepted: the stored value arrives shortly and is adopted then.
    // Otherwise show what's stored now (already trimmed, or unchanged after a rejection).
    if (!hadPending || rejected.current) setDraft(value)
    rejected.current = false
  }

  const update = (next: string) => {
    setDraft(next)
    setEditing(true)
    pending.current = next
    clearTimeout(timer.current)
    timer.current = setTimeout(savePending, delay)
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
