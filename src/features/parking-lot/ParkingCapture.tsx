import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { Icon } from '../../components/Icon'
import { showToast } from '../../components/toast'
import { parkThought } from '../../db/actions'
import styles from './ParkingCapture.module.css'

interface ParkingCaptureProps {
  open: boolean
  /** The project the thought can be linked to (with Tab or the chip); it starts unlinked. */
  projectId?: string
  projectTitle?: string
  onClose: () => void
}

/**
 * Quick single-line capture for stray thoughts, without leaving what you're doing.
 * Enter saves and closes, Shift+Enter saves and stays, Tab links or unlinks the project,
 * Esc cancels (wherever focus is while the box is open).
 */
export function ParkingCapture({ open, ...rest }: ParkingCaptureProps) {
  if (!open) return null
  return <CaptureInner {...rest} />
}

function CaptureInner({ projectId, projectTitle, onClose }: Omit<ParkingCaptureProps, 'open'>) {
  const [text, setText] = useState('')
  // Not linked until asked for. A project that finishes loading after the box opens can
  // still be linked.
  const [linkChoice, setLinkChoice] = useState(false)
  const linked = !!projectId && linkChoice
  const toggleLink = () => {
    if (projectId) setLinkChoice(!linked)
  }
  const [parkedCount, setParkedCount] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const returnFocus = useRef<Element | null>(null)
  // Guards against a double Enter parking the same thought twice.
  const saving = useRef(false)

  useEffect(() => {
    returnFocus.current = document.activeElement
    inputRef.current?.focus()
    return () => {
      const el = returnFocus.current
      if (el instanceof HTMLElement && document.contains(el)) el.focus()
    }
  }, [])

  // Esc closes the box wherever focus is, ahead of the page's own Esc (exit focus, go back).
  const onWindowKeyDown = useEffectEvent((e: KeyboardEvent) => {
    if (e.key !== 'Escape') return
    e.preventDefault()
    e.stopImmediatePropagation()
    onClose()
  })
  useEffect(() => {
    const listener = (e: KeyboardEvent) => onWindowKeyDown(e)
    window.addEventListener('keydown', listener, true)
    return () => window.removeEventListener('keydown', listener, true)
  }, [])

  const save = async (stayOpen: boolean) => {
    if (saving.current) return
    const value = text.trim()
    if (!value) {
      if (!stayOpen) onClose()
      return
    }
    saving.current = true
    setText('')
    try {
      await parkThought(value, linked ? projectId : undefined)
    } finally {
      saving.current = false
    }
    setParkedCount((n) => n + 1)
    showToast({ text: 'Parked', tone: 'success', duration: 1400 })
    if (!stayOpen) onClose()
    else inputRef.current?.focus()
  }

  return (
    <div className={styles.wrap} role="dialog" aria-label="Park a thought">
      <div className={styles.box}>
        <Icon name="inbox" size={18} />
        <input
          ref={inputRef}
          className={styles.input}
          value={text}
          placeholder="Park a thought for later…"
          aria-label="Thought to park"
          maxLength={300}
          data-hints={
            projectId
              ? 'Enter:Save|Shift+Enter:Save and add another|Tab:Link project|Esc:Cancel'
              : 'Enter:Save|Shift+Enter:Save and add another|Esc:Cancel'
          }
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void save(e.shiftKey)
            } else if (e.key === 'Tab' && !e.shiftKey && projectId) {
              e.preventDefault()
              toggleLink()
            }
          }}
        />
      </div>
      <div className={styles.row}>
        {projectId && (
          <span className={styles.link}>
            <button
              type="button"
              className={[styles.chip, linked && styles.chipOn].filter(Boolean).join(' ')}
              aria-pressed={linked}
              onClick={toggleLink}
              title={linked ? 'Linked to this project. Click or press Tab to unlink.' : 'Not linked. Click or press Tab to link to this project.'}
            >
              <Icon name="link" size={12} />
              <span className={styles.chipText}>{linked ? projectTitle : `Link to ${projectTitle}`}</span>
            </button>
            <span className={styles.tabHint}>
              <kbd>Tab</kbd> {linked ? 'unlink' : 'link'}
            </span>
          </span>
        )}
        {parkedCount > 0 && <span className={styles.count}>{parkedCount} parked</span>}
      </div>
    </div>
  )
}
