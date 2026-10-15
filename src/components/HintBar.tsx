import { useEffect, useState } from 'react'
import { useSettings } from '../hooks/useData'
import { isTypingTarget } from '../hooks/useShortcuts'
import styles from './HintBar.module.css'

export type Hint = [key: string, label: string]

const DEFAULT_FIELD_HINTS: Hint[] = [
  ['Enter', 'Save'],
  ['Esc', 'Cancel'],
]

/** Parses a data-hints attribute like "Enter:Save|Esc:Cancel". */
function parseFieldHints(el: Element | null): Hint[] | null {
  if (!el || !isTypingTarget(el)) return null
  const attr = el.getAttribute('data-hints')
  if (attr === null) return DEFAULT_FIELD_HINTS
  if (attr === '') return []
  return attr.split('|').map((pair) => {
    const [key, ...label] = pair.split(':')
    return [key, label.join(':')] as Hint
  })
}

function useFieldHints(): Hint[] | null {
  const [hints, setHints] = useState<Hint[] | null>(null)
  useEffect(() => {
    const update = () => setHints(parseFieldHints(document.activeElement))
    const onFocusOut = () => setTimeout(update, 0)
    document.addEventListener('focusin', update)
    document.addEventListener('focusout', onFocusOut)
    update()
    return () => {
      document.removeEventListener('focusin', update)
      document.removeEventListener('focusout', onFocusOut)
    }
  }, [])
  return hints
}

function useBright(): boolean {
  const [nearEdge, setNearEdge] = useState(false)
  const [modifier, setModifier] = useState(false)
  useEffect(() => {
    const onMove = (e: PointerEvent) => setNearEdge(window.innerHeight - e.clientY < 90)
    const onKey = (e: KeyboardEvent) => setModifier(e.ctrlKey || e.metaKey || e.altKey || e.shiftKey)
    const onBlur = () => setModifier(false)
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
      window.removeEventListener('blur', onBlur)
    }
  }, [])
  return nearEdge || modifier
}

/**
 * Faint shortcut hints along the bottom edge. Shows the screen's hints, or the focused
 * field's keys while typing. At most five at once.
 */
export function HintBar({ hints, align = 'center' }: { hints: Hint[]; align?: 'center' | 'right' }) {
  const settings = useSettings()
  const fieldHints = useFieldHints()
  const bright = useBright()
  if (!settings.showShortcutHints) return null
  const shown = (fieldHints ?? hints).slice(0, 5)
  if (shown.length === 0) return null
  return (
    <div
      className={[styles.bar, align === 'right' && styles.right, bright && styles.bright].filter(Boolean).join(' ')}
      aria-hidden="true"
    >
      {shown.map(([key, label]) => (
        <span key={key + label} className={styles.hint}>
          <kbd>{key}</kbd> {label}
        </span>
      ))}
    </div>
  )
}
