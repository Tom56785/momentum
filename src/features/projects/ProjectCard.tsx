import { Link, useNavigate } from 'react-router'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { ProgressBar } from '../../components/ProgressBar'
import type { Project, Subtask } from '../../db/types'
import { firstTodo, progress } from '../../domain/rules'
import styles from './ProjectCard.module.css'

export function ProjectCard({ project, subtasks }: { project: Project; subtasks: Subtask[] }) {
  const navigate = useNavigate()
  const { done, total } = progress(subtasks)
  const next = firstTodo(subtasks)
  return (
    <article
      className={styles.card}
      tabIndex={0}
      data-card={project.id}
      aria-label={project.title}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target === e.currentTarget) navigate(`/project/${project.id}`)
      }}
    >
      <div className={styles.head}>
        <Link to={`/project/${project.id}`} className={styles.title} tabIndex={-1}>
          {project.title}
        </Link>
        {project.externalKey && <span className={styles.key}>{project.externalKey}</span>}
      </div>

      {project.breadcrumb && (
        <p className={styles.breadcrumb} title="Note to future self">
          <Icon name="note" size={14} />
          <span>{project.breadcrumb.text}</span>
        </p>
      )}

      <div className={styles.progressRow}>
        <ProgressBar done={done} total={total} size="sm" />
        <span className={styles.count}>
          {done}/{total}
        </span>
      </div>

      <div className={styles.foot}>
        <p className={styles.next}>
          {next ? (
            <>
              <span className={styles.nextLabel}>Next</span> {next.title}
            </>
          ) : (
            <span className={styles.nextLabel}>{total === 0 ? 'No steps yet' : 'All steps done'}</span>
          )}
        </p>
        {next && (
          <Button size="sm" variant="primary" icon="play" tabIndex={-1} onClick={() => navigate(`/focus/${project.id}`)}>
            Focus
          </Button>
        )}
      </div>
    </article>
  )
}
