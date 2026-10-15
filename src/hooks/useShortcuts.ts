import { useEffect, useEffectEvent } from 'react'

export type ShortcutMap = Record<string, ((e: KeyboardEvent) => void) | false | null | undefined>

export function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  if (el.isContentEditable) return true
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true
  if (el instanceof HTMLInputElement) {
    return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file'].includes(el.type)
  }
  return false
}

/** Normalises a key event to names like "Space", "Mod+Enter", "Escape", "?", "b", "ArrowUp". */
export function keyName(e: KeyboardEvent): string | undefined {
  const mod = e.ctrlKey || e.metaKey
  if (e.key === 'Enter' && mod) return 'Mod+Enter'
  if (mod || e.altKey) return undefined
  if (e.key === ' ' || e.key === 'Spacebar') return 'Space'
  if (e.key.length === 1) return e.key === '?' ? '?' : e.key.toLowerCase()
  return e.key
}

export function isModalOpen(): boolean {
  return document.querySelector('dialog[open]') !== null
}

/**
 * Screen-level keyboard shortcuts. Ignored while typing in a text field (Escape there just
 * leaves the field) and while a modal dialog is open, which handles its own keys.
 */
export function useShortcuts(map: ShortcutMap, enabled = true): void {
  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    if (e.defaultPrevented || e.repeat) return
    const name = keyName(e)
    if (!name) return
    if (isTypingTarget(e.target)) {
      if (name === 'Escape' && e.target instanceof HTMLElement) {
        e.preventDefault()
        e.target.blur()
      }
      return
    }
    if (isModalOpen()) return
    const handler = map[name]
    if (handler) {
      e.preventDefault()
      handler(e)
    }
  })

  useEffect(() => {
    if (!enabled) return
    const listener = (e: KeyboardEvent) => onKeyDown(e)
    document.addEventListener('keydown', listener)
    return () => document.removeEventListener('keydown', listener)
  }, [enabled])
}
