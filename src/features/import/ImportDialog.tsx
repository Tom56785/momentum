import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { Button } from '../../components/Button'
import { Dialog, DialogActions } from '../../components/Dialog'
import { Icon } from '../../components/Icon'
import { showToast } from '../../components/toast'
import type { Project } from '../../db/types'
import { useSettings } from '../../hooks/useData'
import { findDuplicates, importProjects, type DuplicateChoice } from './importProjects'
import { buildAiPrompt } from './importSchema'
import styles from './ImportDialog.module.css'
import { parseImport, totalTimeboxMinutes, type ParseResult } from './parseImport'
import example from '../../../schema/example-import.json'

interface ImportDialogProps {
  open: boolean
  onClose: () => void
  onImported: (projectIds: string[]) => void
}

export function ImportDialog({ open, onClose, onImported }: ImportDialogProps) {
  const [text, setText] = useState('')
  const [result, setResult] = useState<ParseResult>({ ok: 'empty' })
  const [duplicates, setDuplicates] = useState<Map<number, Project>>(new Map())
  const [choices, setChoices] = useState<Map<number, DuplicateChoice>>(new Map())
  const [dragOver, setDragOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [showPrompt, setShowPrompt] = useState(false)
  const settings = useSettings()
  // The user's prompt from Settings, or the built-in one.
  const prompt = buildAiPrompt(settings.aiPromptTemplate)
  // Latest text, so a slow duplicate lookup for older text can't overwrite newer results.
  const latestText = useRef('')

  const update = async (next: string) => {
    setText(next)
    latestText.current = next
    const parsed = parseImport(next)
    setResult(parsed)
    if (parsed.ok === true) {
      const dups = await findDuplicates(parsed.doc)
      if (latestText.current !== next) return
      setDuplicates(dups)
      setChoices(new Map([...dups.keys()].map((i) => [i, 'replace' as const])))
    } else {
      setDuplicates(new Map())
    }
  }

  const reset = () => {
    latestText.current = ''
    setText('')
    setResult({ ok: 'empty' })
    setDuplicates(new Map())
    setChoices(new Map())
  }

  const close = () => {
    reset()
    onClose()
  }

  const doImport = async () => {
    if (result.ok !== true || busy) return
    setBusy(true)
    try {
      const ids = await importProjects(result.doc, choices)
      const n = result.doc.projects.length
      showToast({ text: n === 1 ? 'Project imported' : `${n} projects imported`, tone: 'success' })
      reset()
      onImported(ids)
    } finally {
      setBusy(false)
    }
  }

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt)
      showToast({ text: 'AI prompt copied — paste it with your ticket', tone: 'success' })
    } catch {
      setShowPrompt(true)
      showToast({ text: 'Copy was blocked — the prompt is shown below to copy by hand', duration: 4000 })
    }
  }

  const readFile = async (file: File) => {
    await update(await file.text())
  }

  return (
    <Dialog open={open} onClose={close} title="Import projects" size="wide">
      <div className={styles.promptRow}>
        <p>
          Copy the prompt, paste it into your AI assistant with the ticket, then paste the JSON it returns below.
        </p>
        <div className={styles.promptButtons}>
          <Button size="sm" variant="ghost" aria-expanded={showPrompt} onClick={() => setShowPrompt(!showPrompt)}>
            {showPrompt ? 'Hide' : 'View'}
          </Button>
          <Button size="sm" icon="copy" onClick={() => void copyPrompt()}>
            Copy AI prompt
          </Button>
        </div>
      </div>
      {showPrompt && (
        <div className={styles.promptView}>
          <textarea
            className={['textarea', styles.promptText].join(' ')}
            aria-label="AI prompt"
            value={prompt}
            readOnly
            rows={10}
            onFocus={(e) => e.currentTarget.select()}
          />
          <Link to="/settings" className={styles.promptEdit} onClick={close}>
            Edit the prompt in Settings
          </Link>
        </div>
      )}

      <div
        className={[styles.drop, dragOver && styles.dragOver].filter(Boolean).join(' ')}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          const file = e.dataTransfer.files[0]
          if (file) void readFile(file)
        }}
      >
        <textarea
          className={['textarea', styles.textarea].join(' ')}
          data-autofocus
          spellCheck={false}
          placeholder={'Paste JSON here, or drop a .json file\n\n{ "schemaVersion": 1, "projects": [ … ] }'}
          aria-label="Import JSON"
          value={text}
          data-hints="Ctrl+Enter:Import|Esc:Close"
          onChange={(e) => void update(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault()
              void doImport()
            }
          }}
        />
        <div className={styles.dropFoot}>
          <label className={styles.fileLabel}>
            <Icon name="upload" size={14} /> Choose file
            <input
              type="file"
              accept="application/json,.json"
              className="visually-hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void readFile(file)
                e.target.value = ''
              }}
            />
          </label>
          {result.ok === 'empty' && (
            <button type="button" className={styles.linkButton} onClick={() => void update(JSON.stringify(example, null, 2))}>
              Try the example
            </button>
          )}
        </div>
      </div>

      {result.ok === false && (
        <div className={styles.errors} role="alert">
          <p className={styles.errorsTitle}>A few things to fix:</p>
          <ul>
            {result.errors.slice(0, 8).map((e) => (
              <li key={e}>{e}</li>
            ))}
            {result.errors.length > 8 && <li>…and {result.errors.length - 8} more</li>}
          </ul>
        </div>
      )}

      {result.ok === true && (
        <ul className={styles.preview} aria-label="Preview">
          {result.doc.projects.map((p, i) => {
            const dup = duplicates.get(i)
            const minutes = totalTimeboxMinutes(p)
            return (
              <li key={i} className={styles.previewItem}>
                <div className={styles.previewHead}>
                  <Icon name="check" size={16} />
                  <strong>{p.title}</strong>
                  {p.externalKey && <span className={styles.key}>{p.externalKey}</span>}
                </div>
                <p className={styles.previewMeta}>
                  {p.subtasks.length} {p.subtasks.length === 1 ? 'step' : 'steps'}
                  {minutes > 0 && ` · ${minutes} min total timebox`}
                </p>
                {dup && (
                  <div className={styles.dup} role="group" aria-label={`${p.externalKey} already exists`}>
                    <span>{p.externalKey} already exists.</span>
                    {(['replace', 'new'] as const).map((c) => (
                      <label key={c} className={styles.choice}>
                        <input
                          type="radio"
                          name={`dup-${i}`}
                          checked={choices.get(i) === c}
                          onChange={() => setChoices(new Map(choices).set(i, c))}
                        />
                        {c === 'replace' ? 'Replace subtasks' : 'Import as new'}
                      </label>
                    ))}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <DialogActions>
        <Button variant="ghost" onClick={close}>
          Cancel
        </Button>
        <Button variant="primary" disabled={result.ok !== true || busy} onClick={() => void doImport()}>
          Import
        </Button>
      </DialogActions>
    </Dialog>
  )
}
