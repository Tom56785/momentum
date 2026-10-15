import { useState } from 'react'
import { Button } from '../../components/Button'
import { Dialog, DialogActions } from '../../components/Dialog'
import { exitFocus } from '../../db/actions'
import styles from './FocusPage.module.css'

interface ExitDialogProps {
  open: boolean
  projectId: string
  breadcrumb: string
  working: boolean
  onCancel: () => void
  onExited: () => void
}

/** Leaving focus: one box for a note to future self. Enter = default (stop timer), Esc = back to focus. */
export function ExitDialog({ open, ...rest }: ExitDialogProps) {
  if (!open) return null
  return <ExitDialogInner {...rest} />
}

function ExitDialogInner({ projectId, breadcrumb, working, onCancel, onExited }: Omit<ExitDialogProps, 'open'>) {
  const [text, setText] = useState(breadcrumb)
  const [busy, setBusy] = useState(false)

  const exit = async (stopTimer: boolean) => {
    if (busy) return
    setBusy(true)
    await exitFocus(projectId, text, stopTimer)
    onExited()
  }

  return (
    <Dialog open title="Before you go" onClose={onCancel} size="narrow">
      <form
        className={styles.exitForm}
        onSubmit={(e) => {
          e.preventDefault()
          void exit(true)
        }}
      >
        <label htmlFor="breadcrumb" className="label">
          Note to future self: what's next?
        </label>
        <input
          id="breadcrumb"
          className="input"
          value={text}
          data-autofocus
          onFocus={(e) => e.currentTarget.select()}
          placeholder="e.g. check why the retry header is missing"
          maxLength={280}
          onChange={(e) => setText(e.target.value)}
        />
        <DialogActions>
          {working ? (
            <>
              <Button onClick={() => void exit(false)} disabled={busy}>
                Keep timer running
              </Button>
              <Button type="submit" variant="primary" disabled={busy}>
                Stop timer and exit
              </Button>
            </>
          ) : (
            <Button type="submit" variant="primary" disabled={busy}>
              Exit
            </Button>
          )}
        </DialogActions>
        <p className={styles.dialogHints} aria-hidden="true">
          <kbd>Enter</kbd> {working ? 'Stop timer and exit' : 'Exit'} · <kbd>Esc</kbd> Back to focus
        </p>
      </form>
    </Dialog>
  )
}
