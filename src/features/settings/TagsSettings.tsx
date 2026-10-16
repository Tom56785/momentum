import { useState } from 'react'
import { IconButton } from '../../components/Button'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { TagChip } from '../../components/TagChip'
import { showToast } from '../../components/toast'
import { createTag, deleteTag, MAX_TAG_NAME, renameTag, setTagColor } from '../../db/tags'
import type { Tag } from '../../db/types'
import { useTagUsage, useTags } from '../../hooks/useData'
import styles from './SettingsPage.module.css'

/** Tags for steps: add, rename, recolour and delete. Steps pick them in their panel. */
export function TagsSettings() {
  const tags = useTags()
  const usage = useTagUsage()
  const [newName, setNewName] = useState('')
  const [deleting, setDeleting] = useState<Tag | null>(null)

  const add = async () => {
    if (!newName.trim()) return
    const result = await createTag(newName)
    if (!result.ok) showToast({ text: result.error })
    else setNewName('')
  }

  const remove = (tag: Tag) => {
    if (usage.get(tag.id)) setDeleting(tag)
    else void deleteTag(tag.id)
  }

  return (
    <>
      {tags.length === 0 && (
        <p className={[styles.description, styles.tagsEmpty].join(' ')}>
          No tags yet. Add one here, or from a step's panel on a project page.
        </p>
      )}
      {tags.map((tag) => (
        <TagRow key={tag.id} tag={tag} used={usage.get(tag.id) ?? 0} onDelete={() => remove(tag)} />
      ))}
      <div className={styles.row}>
        <input
          className={['input', styles.tagNewInput].join(' ')}
          value={newName}
          placeholder="New tag, then Enter"
          aria-label="New tag"
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

      <ConfirmDialog
        open={!!deleting}
        title="Delete this tag?"
        confirmLabel="Delete tag"
        onConfirm={() => {
          if (deleting) void deleteTag(deleting.id)
          setDeleting(null)
        }}
        onCancel={() => setDeleting(null)}
      >
        <strong>{deleting?.name}</strong> is on {usage.get(deleting?.id ?? '') ?? 0}{' '}
        {usage.get(deleting?.id ?? '') === 1 ? 'step' : 'steps'}. It will be taken off them and deleted.
      </ConfirmDialog>
    </>
  )
}

function TagRow({ tag, used, onDelete }: { tag: Tag; used: number; onDelete: () => void }) {
  // Renames save on Enter or when leaving the field; a clash or an empty name reverts.
  const [draft, setDraft] = useState(tag.name)
  const [lastName, setLastName] = useState(tag.name)
  if (tag.name !== lastName) {
    setLastName(tag.name)
    setDraft(tag.name)
  }
  const commit = async () => {
    if (draft === tag.name) return
    const result = await renameTag(tag.id, draft)
    if (!result.ok) {
      showToast({ text: result.error })
      setDraft(tag.name)
    }
  }

  return (
    <div className={styles.row}>
      <div className={styles.tagRowMain}>
        <input
          type="color"
          className={styles.tagColor}
          value={tag.color}
          aria-label={`Colour for ${tag.name}`}
          title="Chip colour"
          onChange={(e) => void setTagColor(tag.id, e.target.value)}
        />
        <input
          className={['input', styles.tagName].join(' ')}
          value={draft}
          aria-label={`Tag name: ${tag.name}`}
          maxLength={MAX_TAG_NAME}
          data-hints="Enter:Save|Esc:Done"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
        />
        <TagChip tag={{ name: draft.trim() || tag.name, color: tag.color }} />
      </div>
      <div className={styles.tagRowEnd}>
        <span className={styles.description}>{used === 0 ? 'Not used' : used === 1 ? '1 step' : `${used} steps`}</span>
        <IconButton small icon="trash" label={`Delete tag ${tag.name}`} onClick={onDelete} />
      </div>
    </div>
  )
}
