import { useState, type FocusEvent } from 'react'
import { Button } from '../../components/Button'
import { TimeboxPicker } from '../../components/TimeboxPicker'
import { updateSubtask } from '../../db/actions'
import type { Subtask } from '../../db/types'
import styles from './FocusPage.module.css'

/**
 * Inline editor for the current step's title and timebox, in place of the title on the
 * card. Enter (or leaving the editor) saves; Esc cancels the title change. A timebox
 * change saves straight away. An empty title is not allowed: the old one stays.
 */
export function StepEditor({ subtask, onDone }: { subtask: Subtask; onDone: () => void }) {
  const [title, setTitle] = useState(subtask.title)

  const save = () => {
    const trimmed = title.trim()
    if (trimmed && trimmed !== subtask.title) void updateSubtask(subtask.id, { title: trimmed })
    onDone()
  }

  // Leaving the editor (e.g. clicking elsewhere) saves, like an autosaved field. Checked a
  // tick later, because picking "Custom…" swaps the timebox select for an input that takes
  // focus, which briefly looks like focus leaving.
  const onBlur = (e: FocusEvent<HTMLFormElement>) => {
    const form = e.currentTarget
    if (form.contains(e.relatedTarget as Node | null)) return
    setTimeout(() => {
      if (form.isConnected && !form.contains(document.activeElement)) save()
    }, 0)
  }

  return (
    <form
      className={styles.stepEditor}
      data-own-keys
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
      onBlur={onBlur}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          onDone()
        }
      }}
    >
      <input
        className={styles.stepEditorTitle}
        aria-label="Step title"
        value={title}
        autoFocus
        onFocus={(e) => e.currentTarget.select()}
        maxLength={200}
        data-hints="Enter:Save|Esc:Cancel"
        onChange={(e) => setTitle(e.target.value)}
      />
      <div className={styles.stepEditorRow}>
        <TimeboxPicker
          value={subtask.timeboxMinutes}
          onChange={(m) => void updateSubtask(subtask.id, { timeboxMinutes: m })}
        />
        <Button type="submit" variant="primary">
          Done
        </Button>
      </div>
    </form>
  )
}
