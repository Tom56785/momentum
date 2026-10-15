import { useEffect, useEffectEvent, useRef, type KeyboardEvent } from 'react'
import styles from './FocusPage.module.css'

const PRESETS = [10, 15, 25]

interface ChallengeMenuProps {
  active: boolean
  beatMinutes?: number
  onStart: (minutes: number) => void
  onCancelChallenge: () => void
  onClose: () => void
}

/** Second click of the two-click challenge start. Arrow keys move, Enter picks, Esc closes. */
export function ChallengeMenu({ active, beatMinutes, onStart, onCancelChallenge, onClose }: ChallengeMenuProps) {
  const ref = useRef<HTMLDivElement>(null)

  // Clicking anywhere outside the menu (and its toggle) closes it.
  const onOutside = useEffectEvent((e: PointerEvent) => {
    if (!ref.current?.parentElement?.contains(e.target as Node)) onClose()
  })

  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const onDown = (e: PointerEvent) => onOutside(e)
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [])

  const onKeyDown = (e: KeyboardEvent) => {
    const buttons = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement)
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault()
      buttons[(i + 1) % buttons.length]?.focus()
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault()
      buttons[(i - 1 + buttons.length) % buttons.length]?.focus()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onClose()
    }
  }

  return (
    <div ref={ref} className={styles.menu} role="menu" aria-label="Challenge" data-own-keys onKeyDown={onKeyDown}>
      {active ? (
        <button type="button" role="menuitem" className={styles.menuItem} onClick={onCancelChallenge}>
          Stop challenge
        </button>
      ) : (
        <>
          <span className={styles.menuLabel}>Finish this step within…</span>
          {PRESETS.map((m) => (
            <button key={m} type="button" role="menuitem" className={styles.menuItem} onClick={() => onStart(m)}>
              {m} minutes
            </button>
          ))}
          {beatMinutes !== undefined && (
            <button type="button" role="menuitem" className={styles.menuItem} onClick={() => onStart(beatMinutes)}>
              Beat my timebox ({beatMinutes} min)
            </button>
          )}
        </>
      )}
    </div>
  )
}
