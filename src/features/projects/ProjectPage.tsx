import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { AutoField } from '../../components/AutoField'
import { Button } from '../../components/Button'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { HintBar } from '../../components/HintBar'
import { Icon } from '../../components/Icon'
import { NotFound } from '../../components/NotFound'
import { ProgressBar } from '../../components/ProgressBar'
import { archiveProject, deleteProject, restoreProject, updateProject } from '../../db/actions'
import { db } from '../../db/db'
import { firstTodo, progress } from '../../domain/rules'
import { formatDuration, workMs } from '../../domain/time'
import { useProject, useSubtasks } from '../../hooks/useData'
import { useShortcuts } from '../../hooks/useShortcuts'
import styles from './ProjectPage.module.css'
import { SubtaskList } from './SubtaskList'
import { showToast } from '../../components/toast'
import { downloadJson, exportFileName, projectToImportDoc } from '../import/exportProject'

export function ProjectPage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const project = useProject(id)
  const subtasks = useSubtasks(id)
  const addInputRef = useRef<HTMLInputElement>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const totalWorkMs = useLiveQuery(
    async () => (id ? workMs(await db.segments.where('projectId').equals(id).toArray(), Date.now()) : 0),
    [id, project?.status],
    0,
  )

  const next = subtasks ? firstTodo(subtasks) : undefined
  const startFocus = () => {
    if (project && next) navigate(`/focus/${project.id}`)
  }

  useShortcuts({
    f: startFocus,
    Enter: () => addInputRef.current?.focus(),
  })

  if (project === undefined || subtasks === undefined) return null
  if (project === null) return <NotFound what="project" />

  const { done, total } = progress(subtasks)
  const save = (field: keyof typeof project) => (value: string) => updateProject(project.id, { [field]: value.trim() || undefined })
  // Titles can't be empty: returning false rejects the save and the field reverts.
  const saveTitle = (value: string) => {
    if (!value.trim()) return false
    void updateProject(project.id, { title: value.trim() })
  }

  // Re-importable file in the import format (e.g. to re-import after an AI rewrite, or share).
  const exportJson = () => {
    const doc = projectToImportDoc(project, subtasks)
    if (!doc) return
    downloadJson(exportFileName(project), doc)
    showToast({ text: 'Project exported', tone: 'success' })
  }

  const remove = async () => {
    setConfirmingDelete(false)
    await deleteProject(project.id)
    navigate('/')
  }

  return (
    // Keyed so drafts in autosaved fields never leak between projects.
    <div className={styles.page} key={project.id}>
      <Link to="/" className={styles.back}>
        <Icon name="arrowLeft" size={16} /> Overview
      </Link>

      <header className={styles.header}>
        <div className={styles.titleRow}>
          <AutoField
            label="Project title"
            hideLabel
            value={project.title}
            onSave={saveTitle}
            className={styles.titleField}
          />
          {project.status === 'active' && (
            <Button
              variant="primary"
              size="lg"
              icon="play"
              highlight={params.get('new') === '1' && !!next}
              disabled={!next}
              onClick={startFocus}
            >
              Start focus
            </Button>
          )}
        </div>
        <div className={styles.progressRow}>
          <ProgressBar done={done} total={total} />
          <span className={styles.count}>
            {done} of {total} done
          </span>
        </div>
      </header>

      {project.status === 'done' && (
        <section className={styles.achievement}>
          <Icon name="sparkle" size={22} />
          <div>
            <h2>Project complete</h2>
            <p>
              {total} {total === 1 ? 'step' : 'steps'} finished
              {totalWorkMs > 0 && <> in {formatDuration(totalWorkMs)} of focused work</>}. That's real progress.
            </p>
          </div>
        </section>
      )}

      {project.breadcrumb && (
        <p className={styles.breadcrumb}>
          <Icon name="note" size={16} />
          <span>{project.breadcrumb.text}</span>
        </p>
      )}

      <div className={styles.columns}>
        <section className={styles.chain} aria-label="Steps">
          <h2 className={styles.sectionTitle}>Steps</h2>
          <SubtaskList projectId={project.id} subtasks={subtasks} addInputRef={addInputRef} />
        </section>

        <aside className={styles.details}>
          <h2 className={styles.sectionTitle}>Details</h2>
          <div className={styles.metaRow}>
            <AutoField label="Ticket key" value={project.externalKey} onSave={save('externalKey')} placeholder="ABC-123" />
            <AutoField label="Target date" type="date" value={project.targetDate} onSave={save('targetDate')} />
          </div>
          <div className={styles.urlRow}>
            <AutoField label="Link" type="url" value={project.url} onSave={save('url')} placeholder="https://" />
            {project.url && (
              <a href={project.url} target="_blank" rel="noreferrer" className={styles.openLink} aria-label="Open link">
                <Icon name="link" size={16} />
              </a>
            )}
          </div>
          <AutoField label="Summary" multiline value={project.summary} onSave={save('summary')} placeholder="The problem in a sentence or two" />
          <AutoField label="Problem" multiline value={project.problem} onSave={save('problem')} placeholder="What is wrong, from the user's side" />
          <AutoField label="Cause" multiline value={project.cause} onSave={save('cause')} placeholder="Why it happens, technically" />
          <AutoField label="Solution" multiline value={project.solution} onSave={save('solution')} placeholder="The proposed fix" />

          <div className={styles.dangerZone}>
            {project.status === 'archived' ? (
              <Button size="sm" variant="ghost" icon="undo" onClick={() => void restoreProject(project.id)}>
                Restore
              </Button>
            ) : (
              <Button size="sm" variant="ghost" icon="inbox" onClick={() => void archiveProject(project.id)}>
                Archive
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              icon="download"
              disabled={total === 0}
              title={total === 0 ? 'Add a step first' : 'Download this project in the import format'}
              onClick={exportJson}
            >
              Export JSON
            </Button>
            <Button size="sm" variant="ghost" icon="trash" onClick={() => setConfirmingDelete(true)}>
              Delete
            </Button>
          </div>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmingDelete}
        title="Delete this project?"
        confirmLabel="Delete project"
        onConfirm={() => void remove()}
        onCancel={() => setConfirmingDelete(false)}
      >
        <strong>{project.title}</strong> and its {total} {total === 1 ? 'step' : 'steps'} will be deleted. Time already logged
        stays in your history.
      </ConfirmDialog>

      <HintBar
        hints={[
          ...(next ? ([['F', 'Start focus']] as [string, string][]) : []),
          ['Enter', 'Add subtask'],
          ['?', 'All shortcuts'],
        ]}
      />
    </div>
  )
}
