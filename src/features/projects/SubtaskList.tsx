import { useState, type RefObject } from 'react'
import { IconButton } from '../../components/Button'
import { celebrateBig, celebrateEarly, celebrateSmall } from '../../components/celebrate'
import { Icon } from '../../components/Icon'
import { TimeboxPicker } from '../../components/TimeboxPicker'
import { showToast } from '../../components/toast'
import { addSubtask, completeSubtask, deleteSubtask, moveSubtask, reopenSubtask, updateSubtask } from '../../db/actions'
import { PHASES, type Phase, type Subtask } from '../../db/types'
import { earlyFinishMessage } from '../../domain/rules'
import { useAutosave } from '../../hooks/useDebounced'
import styles from './SubtaskList.module.css'

interface SubtaskListProps {
  projectId: string
  subtasks: Subtask[]
  addInputRef: RefObject<HTMLInputElement | null>
}

/** The editable chain: inline rename, Enter to add, drag or Alt+Arrow to reorder, check to complete. */
export function SubtaskList({ projectId, subtasks, addInputRef }: SubtaskListProps) {
  const [newTitle, setNewTitle] = useState('')
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)

  const add = async () => {
    const title = newTitle.trim()
    if (!title) return
    setNewTitle('')
    await addSubtask(projectId, { title })
  }

  const move = async (id: string, index: number) => {
    await moveSubtask(id, index)
    // Keep keyboard focus on the moved row.
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-row="${id}"] [data-grip]`)?.focus())
  }

  const onDrop = () => {
    if (dragId !== null && dropIndex !== null) {
      const from = subtasks.findIndex((s) => s.id === dragId)
      void moveSubtask(dragId, dropIndex > from ? dropIndex - 1 : dropIndex)
    }
    setDragId(null)
    setDropIndex(null)
  }

  return (
    <div className={styles.wrap}>
      <ol className={styles.list} onDragOver={(e) => dragId && e.preventDefault()} onDrop={onDrop}>
        {subtasks.map((s, i) => (
          <SubtaskRow
            key={s.id}
            subtask={s}
            index={i}
            count={subtasks.length}
            dragging={dragId === s.id}
            dropBefore={dropIndex === i && dragId !== null}
            dropAfter={dropIndex === subtasks.length && i === subtasks.length - 1 && dragId !== null}
            onDragStart={() => setDragId(s.id)}
            onDragEnd={() => {
              setDragId(null)
              setDropIndex(null)
            }}
            onDragOverRow={(after) => setDropIndex(after ? i + 1 : i)}
            onMove={(to) => void move(s.id, to)}
          />
        ))}
      </ol>
      <div className={styles.addRow}>
        <Icon name="plus" size={16} />
        <input
          ref={addInputRef}
          className={styles.addInput}
          placeholder="Add a step and press Enter"
          value={newTitle}
          aria-label="Add a step"
          data-hints="Enter:Add step|Esc:Done"
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void add()
          }}
        />
      </div>
    </div>
  )
}

interface RowProps {
  subtask: Subtask
  index: number
  count: number
  dragging: boolean
  dropBefore: boolean
  dropAfter: boolean
  onDragStart: () => void
  onDragEnd: () => void
  onDragOverRow: (after: boolean) => void
  onMove: (toIndex: number) => void
}

function SubtaskRow({ subtask, index, count, dragging, dropBefore, dropAfter, onDragStart, onDragEnd, onDragOverRow, onMove }: RowProps) {
  const [expanded, setExpanded] = useState(false)
  const [title, setTitle, flushTitle] = useAutosave(subtask.title, (t) => {
    if (t.trim()) void updateSubtask(subtask.id, { title: t.trim() })
  })
  const [description, setDescription, flushDescription] = useAutosave(subtask.description ?? '', (d) =>
    updateSubtask(subtask.id, { description: d.trim() || undefined }),
  )
  const isDone = subtask.status === 'done'

  const toggleDone = async (el: HTMLElement) => {
    if (isDone) {
      await reopenSubtask(subtask.id)
      return
    }
    celebrateSmall(el)
    const result = await completeSubtask(subtask.id, 'button')
    if (result.earlyByMs !== undefined && !result.projectCompleted) {
      celebrateEarly(el)
      showToast({ text: earlyFinishMessage(result.earlyByMs), tone: 'celebrate' })
    }
    if (result.projectCompleted) {
      celebrateBig()
      showToast({ text: 'Project complete — moved to Done', tone: 'celebrate', duration: 4000 })
    }
  }

  const remove = async () => {
    if (subtask.notes.trim() && !window.confirm(`Delete "${subtask.title}" and its notes?`)) return
    await deleteSubtask(subtask.id)
  }

  return (
    <li
      data-row={subtask.id}
      className={[
        styles.row,
        isDone && styles.done,
        dragging && styles.dragging,
        dropBefore && styles.dropBefore,
        dropAfter && styles.dropAfter,
      ]
        .filter(Boolean)
        .join(' ')}
      onDragOver={(e) => {
        const rect = e.currentTarget.getBoundingClientRect()
        onDragOverRow(e.clientY > rect.top + rect.height / 2)
      }}
      onKeyDown={(e) => {
        if (!e.altKey) return
        if (e.key === 'ArrowUp' && index > 0) {
          e.preventDefault()
          onMove(index - 1)
        } else if (e.key === 'ArrowDown' && index < count - 1) {
          e.preventDefault()
          onMove(index + 1)
        }
      }}
    >
      <div className={styles.main}>
        <button
          type="button"
          className={styles.grip}
          data-grip
          draggable
          aria-label={`Reorder "${subtask.title}". Use Alt plus arrow keys to move.`}
          title="Drag, or Alt+↑/↓ to move"
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'move'
            e.dataTransfer.setData('text/plain', subtask.id)
            const row = e.currentTarget.closest('li')
            if (row) e.dataTransfer.setDragImage(row, 20, 20)
            onDragStart()
          }}
          onDragEnd={onDragEnd}
        >
          <Icon name="grip" size={16} />
        </button>
        <button
          type="button"
          className={styles.check}
          role="checkbox"
          aria-checked={isDone}
          aria-label={isDone ? `Mark "${subtask.title}" as not done` : `Complete "${subtask.title}"`}
          onClick={(e) => void toggleDone(e.currentTarget)}
        >
          {isDone && <Icon name="check" size={14} />}
        </button>
        <input
          className={styles.title}
          value={title}
          aria-label="Step title"
          data-hints="Enter:Save|Alt+↑↓:Move|Esc:Done"
          onChange={(e) => setTitle(e.target.value)}
          onBlur={flushTitle}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
        />
        <div className={styles.meta}>
          {subtask.phase && <span className={styles.phase}>{subtask.phase}</span>}
          {subtask.timeboxMinutes && !expanded && <span className={styles.timebox}>{subtask.timeboxMinutes}m</span>}
          <IconButton
            small
            icon="chevronDown"
            label={expanded ? 'Hide step details' : 'Show step details'}
            aria-expanded={expanded}
            className={expanded ? styles.chevronOpen : undefined}
            onClick={() => setExpanded(!expanded)}
          />
        </div>
      </div>
      {expanded && (
        <div className={styles.expanded}>
          <div className={styles.controls}>
            <select
              className="select"
              aria-label="Phase"
              value={subtask.phase ?? ''}
              data-hints=""
              onChange={(e) => void updateSubtask(subtask.id, { phase: (e.target.value || undefined) as Phase | undefined })}
            >
              <option value="">No phase</option>
              {PHASES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <TimeboxPicker value={subtask.timeboxMinutes} onChange={(m) => void updateSubtask(subtask.id, { timeboxMinutes: m })} />
            <span className={styles.spacer} />
            <IconButton small icon="trash" label="Delete step" onClick={() => void remove()} />
          </div>
          <textarea
            className="textarea"
            placeholder="Description (optional)"
            aria-label="Step description"
            value={description}
            rows={2}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={flushDescription}
          />
          {subtask.notes && (
            <div className={styles.notes}>
              <span className="label">Notes from focus</span>
              <p>{subtask.notes}</p>
            </div>
          )}
        </div>
      )}
    </li>
  )
}
