import { Link } from 'react-router'
import { dispatch } from '../db/session'
import { workMs, formatClock } from '../domain/time'
import { useProject, useReveal, useSegmentsFor, useSession, useSubtasks } from '../hooks/useData'
import { useNow } from '../hooks/useNow'
import { IconButton } from './Button'
import styles from './GlobalTimerBar.module.css'
import { Icon } from './Icon'

/** Slim "outside focus" control for the work timer, shown once a project has been worked on. */
export function GlobalTimerBar() {
  const session = useSession()
  const project = useProject(session.projectId)
  const subtasks = useSubtasks(session.projectId)
  const segments = useSegmentsFor('subtaskId', session.subtaskId)
  const reveal = useReveal()
  const now = useNow()

  if (session.state === 'idle' || !project) return null
  // Nothing left to work on (e.g. the project was just finished): no bar.
  if (session.state === 'paused' && !session.subtaskId) return null
  const subtask = subtasks?.find((s) => s.id === session.subtaskId)
  const working = session.state === 'working'
  const onBreak = session.state === 'break'
  const elapsed = workMs(segments, now)

  return (
    <div className={[styles.bar, working && styles.working, onBreak && styles.onBreak].filter(Boolean).join(' ')}>
      <div className={styles.inner}>
        <span className={styles.dot} aria-hidden="true" />
        <div className={styles.what}>
          <span className={styles.project}>{project.title}</span>
          {onBreak ? (
            <span className={styles.subtask}>On a break</span>
          ) : (
            subtask && <span className={styles.subtask}>{subtask.title}</span>
          )}
        </div>
        <div className={styles.controls}>
          {!onBreak && (
            <span className={styles.time}>
              {reveal.work && <span className={styles.clock}>{formatClock(elapsed)}</span>}
              <IconButton
                small
                icon={reveal.work ? 'eyeOff' : 'eye'}
                label={reveal.work ? 'Hide time' : 'Show time'}
                onClick={() => reveal.toggle('work')}
              />
            </span>
          )}
          {onBreak ? (
            <button type="button" className={styles.toggle} onClick={() => void dispatch({ type: 'resume' }, 'globalBar')}>
              <Icon name="play" size={14} /> Resume
            </button>
          ) : (
            <button
              type="button"
              className={styles.toggle}
              disabled={!subtask}
              onClick={() => void dispatch({ type: working ? 'stop' : 'start' }, 'globalBar')}
              aria-pressed={working}
            >
              <Icon name={working ? 'pause' : 'play'} size={14} /> {working ? 'Pause' : 'Start'}
            </button>
          )}
          <Link to={`/focus/${project.id}`} className={styles.returnLink}>
            Return to focus
          </Link>
          {session.state === 'paused' && (
            <IconButton small icon="x" label="Hide timer bar" onClick={() => void dispatch({ type: 'clear' }, 'globalBar')} />
          )}
        </div>
      </div>
    </div>
  )
}
