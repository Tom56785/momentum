import styles from './ProgressBar.module.css'

interface ProgressBarProps {
  done: number
  total: number
  size?: 'sm' | 'md' | 'lg'
  label?: string
}

/** Calm progress bar; the ratio is clamped to 0..1 and width changes animate. */
export function ProgressBar({ done, total, size = 'md', label }: ProgressBarProps) {
  const ratio = total > 0 ? Math.min(1, Math.max(0, done / total)) : 0
  const complete = total > 0 && done >= total
  return (
    <div
      className={[styles.track, styles[size]].join(' ')}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={Math.min(done, total)}
      aria-label={label ?? `${Math.min(done, total)} of ${total} steps done`}
    >
      <div
        className={[styles.fill, complete && styles.complete].filter(Boolean).join(' ')}
        style={{ transform: `scaleX(${ratio})` }}
      />
    </div>
  )
}
