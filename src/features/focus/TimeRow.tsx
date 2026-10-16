import { useRef, useState, type ReactNode } from 'react'
import { IconButton } from '../../components/Button'
import { Icon, type IconName } from '../../components/Icon'
import { logEvent } from '../../db/store'
import type { Challenge, Subtask } from '../../db/types'
import { challengeLeftMs, timeboxLeftMs } from '../../domain/rules'
import { formatClock, formatMinutesLeft } from '../../domain/time'
import styles from './FocusPage.module.css'

interface TimeRowProps {
  subtask: Subtask
  subtaskWorkMs: number
  challenge?: Challenge
  showWork: boolean
  showTimers: boolean
  onToggleWork: () => void
}

/** All time on the focus screen is hidden until the user asks for it. */
export function TimeRow({ subtask, subtaskWorkMs, challenge, showWork, showTimers, onToggleWork }: TimeRowProps) {
  const timeboxLeft = timeboxLeftMs(subtask.timeboxMinutes, subtaskWorkMs)
  return (
    <div className={styles.timeRow}>
      <span className={styles.timeItem}>
        <IconButton icon={showWork ? 'eyeOff' : 'eye'} label={showWork ? 'Hide time on this step' : 'Show time on this step'} onClick={onToggleWork} />
        {showWork && <span className={styles.timeValue}>{formatClock(subtaskWorkMs)} on this step</span>}
      </span>
      {timeboxLeft !== undefined && (
        <Reveal
          icon="hourglass"
          label="Timebox"
          what="timebox"
          subtask={subtask}
          forced={showTimers}
          value={timeboxLeft > 0 ? formatMinutesLeft(timeboxLeft) : <span className={styles.neutral}>Timebox reached</span>}
        />
      )}
      {challenge && (
        <Reveal
          icon="flame"
          label="Challenge"
          what="challenge"
          subtask={subtask}
          forced={showTimers}
          value={`${formatMinutesLeft(challengeLeftMs(challenge, subtaskWorkMs))} in challenge`}
        />
      )}
    </div>
  )
}

/** Icon that reveals its value on hover, keyboard focus, long-press, or when forced on with T. */
function Reveal({
  icon,
  label,
  what,
  subtask,
  forced,
  value,
}: {
  icon: IconName
  label: string
  what: 'timebox' | 'challenge'
  subtask: Subtask
  forced: boolean
  value: ReactNode
}) {
  const [peek, setPeek] = useState(false)
  const pressTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const shown = forced || peek
  const open = () => {
    if (!peek && !forced) void logEvent('time_revealed', { projectId: subtask.projectId, subtaskId: subtask.id, data: { what } })
    setPeek(true)
  }
  const close = () => {
    clearTimeout(pressTimer.current)
    setPeek(false)
  }
  return (
    // Hover is tracked on the icon and its value together: the row is centred, so showing the
    // value shifts the icon sideways, and the pointer then lands on the value. Tracking the
    // icon alone would hide the value again straight away.
    <span
      className={styles.timeItem}
      onPointerEnter={(e) => e.pointerType === 'mouse' && open()}
      onPointerLeave={(e) => e.pointerType === 'mouse' && close()}
    >
      <button
        type="button"
        className={styles.revealButton}
        aria-label={`${label}: ${shown ? 'shown' : 'hover or focus to show time left'}`}
        onPointerLeave={(e) => e.pointerType !== 'mouse' && close()}
        onPointerDown={(e) => {
          if (e.pointerType !== 'mouse') pressTimer.current = setTimeout(open, 350)
        }}
        onPointerUp={() => clearTimeout(pressTimer.current)}
        onFocus={open}
        onBlur={close}
        onContextMenu={(e) => e.preventDefault()}
      >
        <Icon name={icon} size={20} />
      </button>
      <span className={[styles.timeValue, styles.revealValue, shown && styles.revealShown].filter(Boolean).join(' ')} aria-live="polite">
        {shown ? value : null}
      </span>
    </span>
  )
}
