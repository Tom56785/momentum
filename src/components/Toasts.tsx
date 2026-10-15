import { useRegisterSW } from 'virtual:pwa-register/react'
import { useEffect } from 'react'
import { IconButton } from './Button'
import { Icon } from './Icon'
import { dismissToast, showToast, useToasts } from './toast'
import styles from './Toasts.module.css'

export function Toasts() {
  const toasts = useToasts()
  return (
    <div className={styles.region} role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={[styles.toast, t.tone && styles[t.tone]].filter(Boolean).join(' ')}>
          {t.tone === 'celebrate' && <Icon name="sparkle" size={16} />}
          {t.tone === 'success' && <Icon name="check" size={16} />}
          <span>{t.text}</span>
          {t.action && (
            <button
              type="button"
              className={styles.action}
              onClick={() => {
                t.action?.run()
                dismissToast(t.id)
              }}
            >
              {t.action.label}
            </button>
          )}
          {(t.duration === 0 || t.action) && (
            <IconButton icon="x" label="Dismiss" small onClick={() => dismissToast(t.id)} />
          )}
        </div>
      ))}
    </div>
  )
}

/** Shows a gentle "update ready" toast when a new version of the app has been downloaded. */
export function UpdateWatcher() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  useEffect(() => {
    if (!needRefresh) return
    const id = showToast({
      text: 'An update is ready',
      duration: 0,
      action: { label: 'Reload', run: () => void updateServiceWorker(true) },
    })
    return () => dismissToast(id)
  }, [needRefresh, updateServiceWorker])

  return null
}
