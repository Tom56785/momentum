import type { CSSProperties, ReactNode } from 'react'
import type { Tag } from '../db/types'
import styles from './TagChip.module.css'

/** A tag's name in its colour. Pass `pressed` to make it a toggle button. */
export function TagChip({
  tag,
  pressed,
  onToggle,
  children,
}: {
  tag: Pick<Tag, 'name' | 'color'>
  pressed?: boolean
  onToggle?: () => void
  children?: ReactNode
}) {
  const style = { '--tag': tag.color } as CSSProperties
  if (onToggle) {
    return (
      <button
        type="button"
        className={[styles.chip, styles.toggle, pressed && styles.on].filter(Boolean).join(' ')}
        style={style}
        aria-pressed={!!pressed}
        onClick={onToggle}
      >
        {tag.name}
        {children}
      </button>
    )
  }
  return (
    <span className={[styles.chip, styles.on].join(' ')} style={style}>
      {tag.name}
      {children}
    </span>
  )
}
