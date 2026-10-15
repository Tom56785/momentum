import { useEffect, useRef, type ReactNode } from 'react'
import { IconButton } from './Button'
import styles from './Dialog.module.css'

// Remember the last focused element outside any dialog, so closing a dialog can return focus there.
let lastFocusOutsideDialogs: HTMLElement | null = null
if (typeof document !== 'undefined') {
  document.addEventListener('focusin', (e) => {
    if (e.target instanceof HTMLElement && !e.target.closest('dialog')) lastFocusOutsideDialogs = e.target
  })
}

interface DialogProps {
  open: boolean
  title?: ReactNode
  /** Called on Escape, the close button, or a backdrop click. */
  onClose: () => void
  size?: 'narrow' | 'normal' | 'wide'
  children: ReactNode
  hideClose?: boolean
  labelledBy?: string
}

/**
 * Modal built on the native <dialog>: focus trapping and Escape come for free.
 * Mark the element that should receive focus with `data-autofocus`.
 */
export function Dialog({ open, title, onClose, size = 'normal', children, hideClose, labelledBy }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      const previous = lastFocusOutsideDialogs
      dialog.showModal()
      // React's autoFocus can't focus inside a closed <dialog>, so dialogs mark their
      // initial focus with data-autofocus; otherwise the first field gets it.
      const initial = dialog.querySelector<HTMLElement>('[data-autofocus]') ?? dialog.querySelector<HTMLElement>('input:not([type=radio]):not([type=checkbox]):not([type=file]), textarea')
      initial?.focus()
      return () => {
        if (dialog.open) dialog.close()
        if (previous && document.contains(previous)) previous.focus()
      }
    }
  }, [open])

  if (!open) return null

  const titleId = labelledBy ?? 'dialog-title'
  return (
    <dialog
      ref={ref}
      className={[styles.dialog, size !== 'normal' && styles[size]].filter(Boolean).join(' ')}
      aria-labelledby={title ? titleId : undefined}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onMouseDown={(e) => {
        if (e.target === ref.current) onClose()
      }}
    >
      <div className={styles.inner}>
        {(title || !hideClose) && (
          <div className={styles.header}>
            {title ? (
              <h2 id={titleId} className={styles.title}>
                {title}
              </h2>
            ) : (
              <span />
            )}
            {!hideClose && <IconButton icon="x" label="Close" small onClick={onClose} />}
          </div>
        )}
        {children}
      </div>
    </dialog>
  )
}

export function DialogActions({ children }: { children: ReactNode }) {
  return <div className={styles.actions}>{children}</div>
}
