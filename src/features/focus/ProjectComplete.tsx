import { useEffect } from 'react'
import { Button } from '../../components/Button'
import { celebrateBig } from '../../components/celebrate'
import { Icon } from '../../components/Icon'
import { ProgressBar } from '../../components/ProgressBar'
import { beatEstimateMessage, earlyFinishMs } from '../../domain/rules'
import { formatDuration } from '../../domain/time'
import styles from './FocusPage.module.css'

/** Shown on the focus page in place of the step card once the last step is done. */
export function ProjectComplete({
  title,
  steps,
  totalWorkMs,
  estimateMinutes,
  onDone,
}: {
  title: string
  steps: number
  totalWorkMs: number
  /** The steps' timeboxes added up; 0 when none had one. */
  estimateMinutes: number
  onDone: () => void
}) {
  const spareMs = earlyFinishMs(estimateMinutes, totalWorkMs)

  useEffect(() => {
    celebrateBig()
  }, [])

  return (
    <section className={styles.complete} aria-labelledby="project-complete-title">
      <div className={styles.completeBadge}>
        <Icon name="check" size={40} />
      </div>
      <h1 id="project-complete-title" className={styles.completeHeading}>
        Project complete
      </h1>
      <p className={styles.completeTitle}>{title}</p>
      <div className={styles.completeProgress}>
        <ProgressBar done={steps} total={steps} size="lg" />
      </div>
      <p className={styles.completeStats}>
        {steps} {steps === 1 ? 'step' : 'steps'} done
        {totalWorkMs > 0 && <> · {formatDuration(totalWorkMs)} of focused work</>}
      </p>
      {spareMs !== undefined && (
        <p className={styles.completeBeat}>
          <Icon name="sparkle" size={18} />
          {beatEstimateMessage(spareMs)}
        </p>
      )}
      <Button variant="primary" size="xl" autoFocus onClick={onDone}>
        Back to overview
      </Button>
    </section>
  )
}
