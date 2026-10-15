import type { RefObject } from 'react'
import { updateSubtask } from '../../db/actions'
import type { Subtask } from '../../db/types'
import { useAutosave } from '../../hooks/useDebounced'
import styles from './FocusPage.module.css'

/** Notes for the current subtask; autosaves ~500ms after typing stops. No save button. */
export function NotesArea({ subtask, textareaRef }: { subtask: Subtask; textareaRef: RefObject<HTMLTextAreaElement | null> }) {
  const [notes, setNotes, flush] = useAutosave(subtask.notes, (value) => updateSubtask(subtask.id, { notes: value }))
  return (
    <div className={styles.notes}>
      <label htmlFor="focus-notes" className="visually-hidden">
        Notes for this step
      </label>
      <textarea
        id="focus-notes"
        ref={textareaRef}
        className={styles.notesInput}
        placeholder="Notes for this step… (N)"
        value={notes}
        data-hints="Esc:Back to focus"
        onChange={(e) => setNotes(e.target.value)}
        onBlur={flush}
      />
    </div>
  )
}
