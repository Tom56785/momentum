import { useEffect, useRef, type ReactNode } from 'react'
import { IconButton } from './Button'
import styles from './Dialog.module.css'

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

/** Modal built on the native <dialog>: focus trapping and Escape come for free. */
export function Dialog({ open, title, onClose, size = 'normal', children, hideClose, labelledBy }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      const previous = document.activeElement as HTMLElement | null
      dialog.showModal()
      return () => {
        if (dialog.open) dialog.close()
        previous?.focus?.()
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
