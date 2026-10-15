import { useEffect, useEffectEvent, useRef, type KeyboardEvent } from 'react'
import { Icon } from '../../components/Icon'
import type { Subtask } from '../../db/types'
import styles from './FocusPage.module.css'

interface StepMenuProps {
  steps: readonly Subtask[]
  currentId: string
  onPick: (id: string) => void
  onClose: () => void
}

/**
 * The step list, opened from the "Step 2 of 6" label: jump to any step still to do.
 * ↑/↓ move within the list, Enter or Space picks, Esc closes. Finished steps are shown
 * for context but can't be picked.
 */
export function StepMenu({ steps, currentId, onPick, onClose }: StepMenuProps) {
  const ref = useRef<HTMLDivElement>(null)

  const onOutside = useEffectEvent((e: PointerEvent) => {
    if (!ref.current?.parentElement?.contains(e.target as Node)) onClose()
  })

  useEffect(() => {
    const items = ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
    const current = ref.current?.querySelector<HTMLButtonElement>('[aria-current="step"]')
    ;(current ?? items?.[0])?.focus()
    const onDown = (e: PointerEvent) => onOutside(e)
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [])

  const onKeyDown = (e: KeyboardEvent) => {
    const items = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])
    const i = items.indexOf(document.activeElement as HTMLButtonElement)
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      items[(i + 1) % items.length]?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      items[(i - 1 + items.length) % items.length]?.focus()
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      if (e.key === 'Escape') e.preventDefault()
      e.stopPropagation()
      onClose()
    }
  }

  return (
    <div ref={ref} className={styles.stepMenu} role="menu" aria-label="Steps" data-own-keys onKeyDown={onKeyDown}>
      {steps.map((s, i) => {
        const done = s.status === 'done'
        const current = s.id === currentId
        return (
          <button
            key={s.id}
            type="button"
            role="menuitem"
            className={[styles.stepMenuItem, current && styles.stepMenuCurrent, done && styles.stepMenuDone]
              .filter(Boolean)
              .join(' ')}
            disabled={done}
            aria-current={current ? 'step' : undefined}
            onClick={() => (current ? onClose() : onPick(s.id))}
          >
            <span className={styles.stepMenuMark} aria-hidden="true">
              {done ? <Icon name="check" size={14} /> : i + 1}
            </span>
            <span className={styles.stepMenuTitle}>{s.title}</span>
            {done && <span className="visually-hidden">(done)</span>}
          </button>
        )
      })}
    </div>
  )
}
