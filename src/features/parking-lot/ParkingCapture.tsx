import { useEffect, useRef, useState } from 'react'
import { Icon } from '../../components/Icon'
import { showToast } from '../../components/toast'
import { parkThought } from '../../db/actions'
import styles from './ParkingCapture.module.css'

interface ParkingCaptureProps {
  open: boolean
  projectId: string
  projectTitle: string
  onClose: () => void
}

/**
 * Quick single-line capture for stray thoughts, without leaving focus.
 * Enter saves and closes, Shift+Enter saves and stays, Esc cancels.
 */
export function ParkingCapture({ open, ...rest }: ParkingCaptureProps) {
  if (!open) return null
  return <CaptureInner {...rest} />
}

function CaptureInner({ projectId, projectTitle, onClose }: Omit<ParkingCaptureProps, 'open'>) {
  const [text, setText] = useState('')
  const [linked, setLinked] = useState(true)
  const [parkedCount, setParkedCount] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const returnFocus = useRef<Element | null>(null)

  useEffect(() => {
    returnFocus.current = document.activeElement
    inputRef.current?.focus()
    return () => {
      const el = returnFocus.current
      if (el instanceof HTMLElement && document.contains(el)) el.focus()
    }
  }, [])

  const save = async (stayOpen: boolean) => {
    const value = text.trim()
    if (!value) {
      if (!stayOpen) onClose()
      return
    }
    await parkThought(value, linked ? projectId : undefined)
    setText('')
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
          data-hints="Enter:Save|Shift+Enter:Save and add another|Esc:Cancel"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void save(e.shiftKey)
            } else if (e.key === 'Escape') {
              e.preventDefault()
              e.stopPropagation()
              onClose()
            }
          }}
        />
      </div>
      <div className={styles.row}>
        <button
          type="button"
          className={[styles.chip, linked && styles.chipOn].filter(Boolean).join(' ')}
          aria-pressed={linked}
          onClick={() => setLinked(!linked)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              e.stopPropagation()
              onClose()
            }
          }}
          title={linked ? 'Linked to this project. Click for "Not related".' : 'Not related to a project. Click to link.'}
        >
          {linked ? (
            <>
              <Icon name="link" size={12} /> {projectTitle}
            </>
          ) : (
            'Not related'
          )}
        </button>
        {parkedCount > 0 && <span className={styles.count}>{parkedCount} parked</span>}
      </div>
    </div>
  )
}
