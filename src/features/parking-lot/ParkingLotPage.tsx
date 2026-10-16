import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Button } from '../../components/Button'
import { HintBar, type Hint } from '../../components/HintBar'
import { Icon } from '../../components/Icon'
import { showToast } from '../../components/toast'
import {
  deleteParkingItem,
  parkingItemToProject,
  parkingItemToSubtask,
  parkThought,
  updateParkingItem,
} from '../../db/actions'
import { db } from '../../db/db'
import type { ParkingLotItem, Project } from '../../db/types'
import { useAutosave } from '../../hooks/useDebounced'
import { useNow } from '../../hooks/useNow'
import { useResumeProjectId } from '../../hooks/useData'
import { useShortcuts } from '../../hooks/useShortcuts'
import styles from './ParkingLotPage.module.css'

function timeAgo(ts: number, now: number): string {
  const minutes = Math.round((now - ts) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return new Date(ts).toLocaleDateString()
}

export function ParkingLotPage() {
  const navigate = useNavigate()
  const resumeId = useResumeProjectId()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [newText, setNewText] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  const data = useLiveQuery(async () => {
    const items = await db.parkingLot.orderBy('createdAt').reverse().toArray()
    const projects = await db.projects.toArray()
    return { items, projects }
  }, [])

  const projects = data?.projects ?? []
  const projectById = new Map(projects.map((p) => [p.id, p]))
  const open = data?.items.filter((i) => !i.done) ?? []
  const done = data?.items.filter((i) => i.done) ?? []

  const groups: { key: string; title: string; project?: Project; items: ParkingLotItem[] }[] = []
  const unlinked = open.filter((i) => !i.projectId || !projectById.has(i.projectId))
  if (unlinked.length) groups.push({ key: 'unlinked', title: 'Unlinked', items: unlinked })
  for (const p of projects) {
    const items = open.filter((i) => i.projectId === p.id)
    if (items.length) groups.push({ key: p.id, title: p.title, project: p, items })
  }

  const rows = () => Array.from(listRef.current?.querySelectorAll<HTMLElement>('[data-item]') ?? [])
  const selectedId = () => rows().find((r) => r.contains(document.activeElement))?.dataset.item
  const moveSelection = (dir: 1 | -1) => {
    const all = rows()
    if (!all.length) return
    const i = all.findIndex((r) => r.contains(document.activeElement))
    const next = i === -1 ? 0 : Math.max(0, Math.min(all.length - 1, i + dir))
    all[next].querySelector<HTMLElement>('[data-item-toggle]')?.focus()
  }

  const toSubtask = async (id: string) => {
    const item = open.find((i) => i.id === id)
    if (!item?.projectId) {
      showToast({ text: 'Link it to a project first' })
      setExpanded(id)
      return
    }
    // Returns nothing if it was already converted (e.g. a double press).
    if (await parkingItemToSubtask(id)) {
      showToast({ text: `Added to ${projectById.get(item.projectId)?.title ?? 'project'}`, tone: 'success' })
    }
  }

  const markDone = async (id: string) => {
    await updateParkingItem(id, { done: true })
    showToast({ text: 'Done', tone: 'success', duration: 1400 })
  }

  useShortcuts({
    ArrowDown: () => moveSelection(1),
    ArrowUp: () => moveSelection(-1),
    s: () => {
      const id = selectedId()
      if (id) void toSubtask(id)
    },
    d: () => {
      const id = selectedId()
      if (id) void markDone(id)
    },
  })

  const add = async () => {
    const text = newText.trim()
    if (!text) return
    setNewText('')
    await parkThought(text)
  }

  return (
    <div className={styles.page}>
      <div className={styles.top}>
        <h1 className={`page-title ${styles.heading}`}>Parking lot</h1>
        <span className={styles.count}>{open.length} open</span>
      </div>

      <div className={styles.addRow}>
        <Icon name="plus" size={16} />
        <input
          className={styles.addInput}
          placeholder="Park something…"
          aria-label="Park something"
          value={newText}
          data-hints="Enter:Save|Esc:Done"
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void add()
          }}
        />
      </div>

      {data && open.length === 0 && (
        <p className={styles.empty}>Nothing parked. Press P on the focus screen to capture a stray thought.</p>
      )}

      <div ref={listRef} className={styles.groups}>
        {groups.map((g) => (
          <section key={g.key} className={styles.group}>
            <h2 className={styles.groupTitle}>
              {g.project ? <Link to={`/project/${g.project.id}`}>{g.title}</Link> : g.title}
              <span className={styles.groupCount}>{g.items.length}</span>
            </h2>
            <ul className={styles.list}>
              {g.items.map((item) => (
                <ParkingItemRow
                  key={item.id}
                  item={item}
                  projects={projects}
                  expanded={expanded === item.id}
                  onToggle={() => setExpanded(expanded === item.id ? null : item.id)}
                  onSubtask={() => void toSubtask(item.id)}
                  onProject={async () => {
                    const id = await parkingItemToProject(item.id)
                    if (id) navigate(`/project/${id}`)
                  }}
                  onDone={() => void markDone(item.id)}
                  onDelete={() => void deleteParkingItem(item.id)}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>

      {done.length > 0 && (
        <details className={styles.doneSection}>
          <summary>
            <Icon name="chevronDown" size={16} /> Done ({done.length})
          </summary>
          <ul className={styles.doneList}>
            {done.slice(0, 100).map((item) => (
              <li key={item.id}>
                <Icon name="check" size={14} />
                <span className={styles.doneText}>{item.text}</span>
                {item.convertedTo && (
                  <Link
                    to={
                      item.convertedTo.kind === 'project'
                        ? `/project/${item.convertedTo.id}`
                        : `/project/${item.projectId ?? ''}`
                    }
                    className={styles.converted}
                  >
                    became a {item.convertedTo.kind === 'project' ? 'project' : 'step'}
                  </Link>
                )}
                <button
                  type="button"
                  className={styles.undo}
                  onClick={() => void updateParkingItem(item.id, { done: false })}
                  aria-label={`Re-open "${item.text}"`}
                >
                  <Icon name="undo" size={14} />
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      <HintBar
        hints={[
          ...(open.length
            ? ([
                ['Enter', 'Expand item'],
                ['S', 'Add as subtask'],
                ['D', 'Done'],
              ] as Hint[])
            : []),
          ...(resumeId ? ([['F', 'Resume focus']] as Hint[]) : []),
          ['P', 'Park thought'],
          ['?', 'All shortcuts'],
        ]}
      />
    </div>
  )
}

interface RowProps {
  item: ParkingLotItem
  projects: Project[]
  expanded: boolean
  onToggle: () => void
  onSubtask: () => void
  onProject: () => void
  onDone: () => void
  onDelete: () => void
}

function ParkingItemRow({ item, projects, expanded, onToggle, onSubtask, onProject, onDone, onDelete }: RowProps) {
  const [details, setDetails, flush] = useAutosave(item.details ?? '', (d) =>
    updateParkingItem(item.id, { details: d.trim() ? d : undefined }),
  )
  const now = useNow()
  const linkable = projects.filter((p) => p.status === 'active' || p.id === item.projectId)
  return (
    <li data-item={item.id} className={[styles.item, expanded && styles.itemOpen].filter(Boolean).join(' ')}>
      <button type="button" className={styles.itemHead} data-item-toggle aria-expanded={expanded} onClick={onToggle}>
        <span className={styles.itemText}>{item.text}</span>
        {item.details && !expanded && <Icon name="note" size={14} />}
        <span className={styles.itemTime}>{timeAgo(item.createdAt, now)}</span>
      </button>
      {expanded && (
        <div className={styles.itemBody}>
          <textarea
            className="textarea"
            placeholder="Add detail…"
            aria-label="Details"
            value={details}
            autoFocus
            onChange={(e) => setDetails(e.target.value)}
            onBlur={flush}
          />
          <div className={styles.itemControls}>
            <select
              className="select"
              aria-label="Linked project"
              value={item.projectId ?? ''}
              data-hints=""
              onChange={(e) => void updateParkingItem(item.id, { projectId: e.target.value || undefined })}
            >
              <option value="">Not related to a project</option>
              {linkable.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.itemActions}>
            <Button size="sm" icon="plus" onClick={onSubtask} disabled={!item.projectId}>
              Add as subtask
            </Button>
            <Button size="sm" icon="sparkle" onClick={onProject}>
              Make a project
            </Button>
            <Button size="sm" icon="check" onClick={onDone}>
              Done
            </Button>
            <span className={styles.spacer} />
            <Button size="sm" variant="ghost" icon="trash" onClick={onDelete}>
              Delete
            </Button>
          </div>
        </div>
      )}
    </li>
  )
}
