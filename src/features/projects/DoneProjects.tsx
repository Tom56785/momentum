import { Link } from 'react-router'
import { Icon } from '../../components/Icon'
import type { Project, Subtask } from '../../db/types'
import styles from './OverviewPage.module.css'

/** Collapsed list of done or archived projects below the active ones. */
export function DoneProjects({
  title,
  projects,
  byProject,
}: {
  title: string
  projects: Project[]
  byProject?: Map<string, Subtask[]>
}) {
  if (projects.length === 0) return null
  return (
    <details className={styles.section}>
      <summary>
        <Icon name="chevronDown" size={16} />
        {title} ({projects.length})
      </summary>
      <ul className={styles.doneList}>
        {projects.map((p) => (
          <li key={p.id} className={styles.doneItem}>
            <span className={styles.doneCheck}>
              <Icon name={p.status === 'done' ? 'check' : 'inbox'} size={16} />
            </span>
            <Link to={`/project/${p.id}`}>{p.title}</Link>
            <span className={styles.doneMeta}>
              {byProject?.get(p.id)?.length ?? 0} steps
              {p.completedAt && ` · ${new Date(p.completedAt).toLocaleDateString()}`}
            </span>
          </li>
        ))}
      </ul>
    </details>
  )
}
