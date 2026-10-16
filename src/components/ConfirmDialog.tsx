import type { ReactNode } from 'react'
import { Button } from './Button'
import { Dialog, DialogActions } from './Dialog'

interface ConfirmDialogProps {
  open: boolean
  title: string
  children: ReactNode
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}

/**
 * In-app replacement for window.confirm. Focus starts on Cancel, so a stray Enter
 * never confirms something that can't be undone.
 */
export function ConfirmDialog({ open, title, children, confirmLabel, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={onCancel} title={title} size="narrow">
      <p>{children}</p>
      <DialogActions>
        <Button variant="ghost" data-autofocus onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
