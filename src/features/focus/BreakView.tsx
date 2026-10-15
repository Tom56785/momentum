import { useState } from 'react'
import { Button, IconButton } from '../../components/Button'
import { isBreakOver } from '../../domain/rules'
import { formatClock } from '../../domain/time'
import { useSegment, useSession, useSettings } from '../../hooks/useData'
import { useNow } from '../../hooks/useNow'
import styles from './FocusPage.module.css'

const SUGGESTIONS = ['Drink some water', 'Stand up and stretch', 'Look at something far away', 'Take a few slow breaths', 'Step away from the screen']

/** Calm full-screen break state. Length hidden by default; never an alarm. */
export function BreakView({ onResume }: { onResume: () => void }) {
  const session = useSession()
  const settings = useSettings()
  const segment = useSegment(session.openSegmentId)
  const now = useNow()
  const [showTime, setShowTime] = useState(false)
  const startedAt = segment?.kind === 'break' ? segment.startedAt : now
  const elapsed = now - startedAt
  const over = segment?.kind === 'break' && isBreakOver(startedAt, settings.breakMinutes, now)
  // Rotate suggestions slowly, one per minute.
  const suggestion = SUGGESTIONS[Math.floor(elapsed / 60_000) % SUGGESTIONS.length]

  return (
    <main className={styles.breakMain}>
      <div className={styles.breakOrb} aria-hidden="true" />
      <h1 className={styles.breakTitle}>Break</h1>
      <p key={suggestion} className={styles.breakSuggestion}>
        {suggestion}
      </p>
      <p className={[styles.breakReady, over && styles.breakReadyShown].filter(Boolean).join(' ')} aria-live="polite">
        {over ? 'Ready when you are' : ''}
      </p>
      <Button variant="primary" size="xl" icon="play" onClick={onResume} autoFocus>
        Resume work
      </Button>
      <span className={styles.timeItem}>
        <IconButton small icon={showTime ? 'eyeOff' : 'eye'} label={showTime ? 'Hide break time' : 'Show break time'} onClick={() => setShowTime(!showTime)} />
        {showTime && (
          <span className={styles.timeValue}>
            {formatClock(elapsed)} of {settings.breakMinutes} min
          </span>
        )}
      </span>
    </main>
  )
}
