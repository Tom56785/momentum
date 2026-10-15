import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '../../components/Button'
import { HintBar, type Hint } from '../../components/HintBar'
import { createProject } from '../../db/actions'
import { db } from '../../db/db'
import type { Subtask } from '../../db/types'
import { useShortcuts } from '../../hooks/useShortcuts'
import { ImportDialog } from '../import/ImportDialog'
import styles from './OverviewPage.module.css'
import { ProjectCard } from './ProjectCard'
import { TodayStrip } from './TodayStrip'
import { DoneProjects } from './DoneProjects'

export function OverviewPage() {
  const navigate = useNavigate()
  const [importOpen, setImportOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const gridRef = useRef<HTMLDivElement>(null)
  // The new-project input resolves exactly once: Enter, Escape or blur, whichever comes first.
  const newProjectSettled = useRef(false)

  const data = useLiveQuery(async () => {
    const projects = await db.projects.orderBy('updatedAt').reverse().toArray()
    const subtasks = await db.subtasks.toArray()
    const byProject = new Map<string, Subtask[]>()
    for (const s of subtasks) {
      const list = byProject.get(s.projectId) ?? []
      list.push(s)
      byProject.set(s.projectId, list)
    }
    return { projects, byProject }
  }, [])

  const active = data?.projects.filter((p) => p.status === 'active') ?? []
  const done = data?.projects.filter((p) => p.status === 'done') ?? []
  const archived = data?.projects.filter((p) => p.status === 'archived') ?? []

  const cards = () => Array.from(gridRef.current?.querySelectorAll<HTMLElement>('[data-card]') ?? [])
  const selectedCard = () => {
    const all = cards()
    return all.find((c) => c.contains(document.activeElement)) ?? all[0]
  }
  const moveSelection = (dir: 1 | -1) => {
    const all = cards()
    if (all.length === 0) return
    const current = all.findIndex((c) => c.contains(document.activeElement))
    const next = current === -1 ? 0 : Math.max(0, Math.min(all.length - 1, current + dir))
    all[next].focus()
  }

  useShortcuts(
    {
      i: () => setImportOpen(true),
      f: () => {
        const id = selectedCard()?.dataset.card
        if (id) navigate(`/focus/${id}`)
      },
      ArrowDown: () => moveSelection(1),
      ArrowRight: () => moveSelection(1),
      ArrowUp: () => moveSelection(-1),
      ArrowLeft: () => moveSelection(-1),
    },
    !importOpen,
  )

  const openNewProject = () => {
    newProjectSettled.current = false
    setNewTitle('')
    setCreating(true)
  }

  const closeNewProject = () => {
    newProjectSettled.current = true
    setCreating(false)
    setNewTitle('')
  }

  const create = async (value: string) => {
    if (newProjectSettled.current) return
    const title = value.trim()
    closeNewProject()
    if (!title) return
    const id = await createProject({ title })
    navigate(`/project/${id}?new=1`)
  }

  const onImported = (ids: string[]) => {
    setImportOpen(false)
    if (ids[0]) navigate(`/project/${ids[0]}?new=1`)
  }

  return (
    <div className={styles.page}>
      <div className={styles.top}>
        <h1 className={styles.heading}>Projects</h1>
        <div className={styles.actions}>
          {creating ? (
            <input
              className="input"
              autoFocus
              placeholder="Project title"
              value={newTitle}
              data-hints="Enter:Create|Esc:Cancel"
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void create(e.currentTarget.value)
                if (e.key === 'Escape') {
                  e.preventDefault()
                  closeNewProject()
                }
              }}
              onBlur={(e) => void create(e.currentTarget.value)}
              aria-label="New project title"
            />
          ) : (
            <Button icon="plus" onClick={openNewProject}>
              New project
            </Button>
          )}
          <Button variant="primary" icon="upload" onClick={() => setImportOpen(true)}>
            Import
          </Button>
        </div>
      </div>

      <TodayStrip />

      {data && active.length === 0 && (
        <EmptyState onImport={() => setImportOpen(true)} hasDone={done.length > 0} />
      )}

      <div className={styles.grid} ref={gridRef}>
        {active.map((p) => (
          <ProjectCard key={p.id} project={p} subtasks={data?.byProject.get(p.id) ?? []} />
        ))}
      </div>

      <DoneProjects title="Done" projects={done} byProject={data?.byProject} />
      <DoneProjects title="Archived" projects={archived} byProject={data?.byProject} />

      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} onImported={onImported} />
      <HintBar
        hints={[
          ...(active.length
            ? ([
                ['Enter', 'Open project'],
                ['F', 'Focus on selected'],
              ] as Hint[])
            : []),
          ['I', 'Import'],
          ['?', 'All shortcuts'],
        ]}
      />
    </div>
  )
}

function EmptyState({ onImport, hasDone }: { onImport: () => void; hasDone: boolean }) {
  return (
    <div className={styles.empty}>
      <h2>{hasDone ? 'Everything is done. Nice.' : 'Start with one ticket'}</h2>
      <p>
        Paste a ticket into your AI assistant with the import prompt, then import the JSON here. Or create a project by
        hand.
      </p>
      <Button variant="primary" icon="upload" onClick={onImport}>
        Import a project
      </Button>
    </div>
  )
}

