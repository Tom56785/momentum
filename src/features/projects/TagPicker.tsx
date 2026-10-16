import { useState } from 'react'
import { TagChip } from '../../components/TagChip'
import { showToast } from '../../components/toast'
import { db } from '../../db/db'
import { createTag, findTagByName, normaliseTagName, toggleSubtaskTag, MAX_TAG_NAME } from '../../db/tags'
import type { Subtask } from '../../db/types'
import { useTags } from '../../hooks/useData'
import styles from './SubtaskList.module.css'

/**
 * A step's tags in its panel: every tag as a toggle, and a field to add a new one (or an
 * existing one by name) to this step.
 */
export function TagPicker({ subtask }: { subtask: Subtask }) {
  const tags = useTags()
  const [newName, setNewName] = useState('')
  const on = new Set(subtask.tags ?? [])

  const add = async () => {
    const name = normaliseTagName(newName)
    if (!name) return
    setNewName('')
    const existing = await findTagByName(name)
    if (existing) {
      if (!on.has(existing.id)) await toggleSubtaskTag(subtask.id, existing.id)
      return
    }
    const result = await createTag(name)
    if (!result.ok) {
      showToast({ text: result.error })
      return
    }
    // Only add it if the step still exists (it could have been deleted meanwhile).
    if (await db.subtasks.get(subtask.id)) await toggleSubtaskTag(subtask.id, result.id)
  }

  return (
    <div className={styles.tagPicker} role="group" aria-label="Tags">
      <span className={styles.tagPickerLabel}>Tags</span>
      {tags.map((tag) => (
        <TagChip key={tag.id} tag={tag} pressed={on.has(tag.id)} onToggle={() => void toggleSubtaskTag(subtask.id, tag.id)} />
      ))}
      <input
        className={styles.tagInput}
        value={newName}
        placeholder={tags.length ? 'New tag…' : 'Add a tag…'}
        aria-label="New tag for this step"
        maxLength={MAX_TAG_NAME}
        data-hints="Enter:Add tag|Esc:Done"
        onChange={(e) => setNewName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            void add()
          }
        }}
      />
    </div>
  )
}
