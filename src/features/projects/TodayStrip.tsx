import { useLiveQuery } from 'dexie-react-hooks'
import { IconButton } from '../../components/Button'
import { db } from '../../db/db'
import { todaySummary } from '../../domain/stats'
import { DAY, formatDuration, startOfDay } from '../../domain/time'
import { useReveal } from '../../hooks/useData'
import { useNow } from '../../hooks/useNow'
import styles from './TodayStrip.module.css'

/** Small "Today" summary: subtasks done, projects done, and focus time behind the reveal toggle. */
export function TodayStrip() {
  const now = useNow()
  const dayStart = startOfDay(now)
  const reveal = useReveal()
  const data = useLiveQuery(async () => {
    // Segments that started up to a day earlier may still overlap today.
    const segments = await db.segments.where('startedAt').above(dayStart - DAY).toArray()
    const events = await db.events.where('ts').aboveOrEqual(dayStart).toArray()
    return { segments, events }
  }, [dayStart])
  if (!data) return null
  const today = todaySummary(data.segments, data.events, now)
  return (
    <section className={styles.strip} aria-label="Today">
      <span className={styles.label}>Today</span>
      <span className={styles.stat}>
        <strong>{today.subtasksCompleted}</strong> {today.subtasksCompleted === 1 ? 'step' : 'steps'} done
      </span>
      <span className={styles.stat}>
        <strong>{today.projectsCompleted}</strong> {today.projectsCompleted === 1 ? 'project' : 'projects'} done
      </span>
      <span className={styles.stat}>
        {reveal.work ? (
          <>
            <strong>{formatDuration(today.focusMs)}</strong> focus
          </>
        ) : (
          <span className={styles.hidden}>Focus time</span>
        )}
        <IconButton
          small
          icon={reveal.work ? 'eyeOff' : 'eye'}
          label={reveal.work ? 'Hide focus time' : 'Show focus time'}
          onClick={() => reveal.toggle('work')}
        />
      </span>
    </section>
  )
}
