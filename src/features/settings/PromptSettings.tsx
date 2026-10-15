import { useState } from 'react'
import { Button } from '../../components/Button'
import { showToast } from '../../components/toast'
import { resetSetting, updateSettings } from '../../db/store'
import { useAutosave } from '../../hooks/useDebounced'
import { AI_PROMPT_TEMPLATE, buildAiPrompt, SCHEMA_PLACEHOLDER } from '../import/importSchema'
import styles from './SettingsPage.module.css'

/** Saves the template, storing nothing when it matches the built-in default. */
function saveTemplate(value: string): false | undefined {
  if (!value.trim()) return false // an empty prompt isn't useful: keep the stored one
  if (value === AI_PROMPT_TEMPLATE) void resetSetting('aiPromptTemplate')
  else void updateSettings({ aiPromptTemplate: value })
}

/**
 * The AI import prompt, editable. It's stored in IndexedDB with the other settings (so it's
 * part of backups) and used by "Copy AI prompt" in the import dialog.
 */
export function PromptSettings({ template }: { template: string | undefined }) {
  const stored = template ?? AI_PROMPT_TEMPLATE
  const [draft, setDraft, flush] = useAutosave(stored, saveTemplate)
  const [showFull, setShowFull] = useState(false)
  const customised = template !== undefined
  const fullPrompt = buildAiPrompt(draft)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(fullPrompt)
      showToast({ text: 'AI prompt copied', tone: 'success' })
    } catch {
      setShowFull(true)
      showToast({ text: 'Copy was blocked — the full prompt is shown to copy by hand', duration: 4000 })
    }
  }

  return (
    <div className={styles.prompt}>
      <p className={styles.description}>
        Used by <strong>Copy AI prompt</strong> when importing. <code>{SCHEMA_PLACEHOLDER}</code> is replaced with the
        import schema. Changes save as you type.
      </p>
      <label htmlFor="ai-prompt" className="visually-hidden">
        AI import prompt template
      </label>
      <textarea
        id="ai-prompt"
        className={['textarea', styles.promptInput].join(' ')}
        value={draft}
        spellCheck={false}
        rows={14}
        data-hints="Esc:Done"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={flush}
      />
      {!draft.includes(SCHEMA_PLACEHOLDER) && (
        <p className={styles.notice} role="note">
          This prompt doesn't include <code>{SCHEMA_PLACEHOLDER}</code>, so the schema won't be added to it.
        </p>
      )}
      <div className={styles.promptActions}>
        <Button size="sm" icon="copy" onClick={() => void copy()}>
          Copy prompt
        </Button>
        <Button size="sm" variant="ghost" aria-expanded={showFull} onClick={() => setShowFull(!showFull)}>
          {showFull ? 'Hide full prompt' : 'Show full prompt'}
        </Button>
        <span className={styles.spacer} />
        {customised && (
          <Button size="sm" variant="ghost" icon="undo" onClick={() => void resetSetting('aiPromptTemplate')}>
            Reset to default
          </Button>
        )}
      </div>
      {showFull && (
        <textarea
          className={['textarea', styles.promptInput, styles.promptFull].join(' ')}
          aria-label="Full AI prompt, with the schema filled in"
          value={fullPrompt}
          readOnly
          rows={14}
          onFocus={(e) => e.currentTarget.select()}
        />
      )}
    </div>
  )
}
