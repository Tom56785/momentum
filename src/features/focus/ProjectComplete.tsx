import { Button } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { Icon } from '../../components/Icon'
import { formatDuration } from '../../domain/time'
import styles from './FocusPage.module.css'

export function ProjectComplete({
  title,
  steps,
  totalWorkMs,
  onDone,
}: {
  title: string
  steps: number
  totalWorkMs: number
  onDone: () => void
}) {
  return (
    <Dialog open onClose={onDone} hideClose size="narrow">
      <div className={styles.complete}>
        <div className={styles.completeBadge}>
          <Icon name="check" size={36} />
        </div>
        <h2>Project complete</h2>
        <p className={styles.completeTitle}>{title}</p>
        <p className={styles.completeStats}>
          {steps} {steps === 1 ? 'step' : 'steps'} done
          {totalWorkMs > 0 && <> · {formatDuration(totalWorkMs)} of focused work</>}
        </p>
        <Button variant="primary" size="lg" data-autofocus onClick={onDone}>
          Back to overview
        </Button>
      </div>
    </Dialog>
  )
}
