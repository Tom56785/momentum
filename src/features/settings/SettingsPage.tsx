import { useEffect, useId, useState, type ReactNode } from 'react'
import { Button } from '../../components/Button'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Dialog, DialogActions } from '../../components/Dialog'
import { HintBar, type Hint } from '../../components/HintBar'
import { showToast } from '../../components/toast'
import { clearStats } from '../../db/actions'
import { setAppState, updateSettings } from '../../db/store'
import type { Settings } from '../../db/types'
import { DAY } from '../../domain/time'
import { useAppState, useResumeProjectId, useSettings } from '../../hooks/useData'
import { useNow } from '../../hooks/useNow'
import { downloadBackup, parseBackup, restoreBackup, type Backup } from './backup'
import { PromptSettings } from './PromptSettings'
import { TagsSettings } from './TagsSettings'
import styles from './SettingsPage.module.css'

export function SettingsPage() {
  const settings = useSettings()
  const resumeId = useResumeProjectId()
  const persistedAtStart = useAppState('storagePersisted')
  const [persisted, setPersisted] = useState<boolean | undefined>(undefined)
  const [restore, setRestore] = useState<{ backup: Backup; name: string } | null>(null)
  const now = useNow()

  useEffect(() => {
    void navigator.storage?.persisted?.().then(setPersisted)
  }, [persistedAtStart])

  const set = (patch: Partial<Settings>) => void updateSettings(patch)

  const toggleNotifications = async (on: boolean) => {
    if (!on) return set({ systemNotifications: false })
    if (!('Notification' in window)) {
      showToast({ text: 'This browser does not support notifications' })
      return
    }
    const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
    if (permission === 'granted') set({ systemNotifications: true })
    else showToast({ text: 'Notifications are blocked for this site in your browser settings', duration: 4000 })
  }

  const askPersist = async () => {
    const result = (await navigator.storage?.persist?.()) ?? false
    await setAppState('storagePersisted', result)
    setPersisted(result)
    showToast({ text: result ? 'Storage is now persistent' : 'The browser declined for now. Installing the app usually helps.', duration: 4000 })
  }

  const exportNow = async () => {
    await downloadBackup()
    showToast({ text: 'Backup downloaded', tone: 'success' })
  }

  const pickRestore = async (file: File) => {
    const parsed = parseBackup(await file.text())
    if (!parsed.ok) {
      showToast({ text: parsed.error, duration: 5000 })
      return
    }
    setRestore({ backup: parsed.backup, name: file.name })
  }

  const [confirmingClear, setConfirmingClear] = useState(false)
  const confirmClearStats = async () => {
    setConfirmingClear(false)
    await clearStats()
    showToast({ text: 'Stats cleared', tone: 'success' })
  }

  const confirmRestore = async () => {
    if (!restore) return
    await restoreBackup(restore.backup)
    setRestore(null)
    showToast({ text: 'Backup restored', tone: 'success' })
  }

  const lastBackup = settings.lastBackupAt
  const backupDue = !lastBackup || now - lastBackup > 14 * DAY

  return (
    <div className={styles.page}>
      <h1 className={`page-title ${styles.heading}`}>Settings</h1>

      <Section title="Breaks">
        <Toggle label="Break prompts" checked={settings.breakPromptsEnabled} onChange={(v) => set({ breakPromptsEnabled: v })} />
        <NumberField label="Suggest a break after" unit="min of work" value={settings.workIntervalMinutes} min={5} max={180} onChange={(v) => set({ workIntervalMinutes: v })} disabled={!settings.breakPromptsEnabled} />
        <NumberField label="Break length" unit="min" value={settings.breakMinutes} min={1} max={60} onChange={(v) => set({ breakMinutes: v })} />
        <NumberField label="“Keep going” snoozes for" unit="min" value={settings.snoozeMinutes} min={1} max={120} onChange={(v) => set({ snoozeMinutes: v })} disabled={!settings.breakPromptsEnabled} />
      </Section>

      <Section title="Timeboxes">
        <NumberField label="Offer a challenge with this much of the timebox left" unit="%" value={settings.timeboxPromptPercentLeft} min={5} max={90} onChange={(v) => set({ timeboxPromptPercentLeft: v })} />
      </Section>

      <Section title="Tags">
        <TagsSettings />
      </Section>

      <Section title="Display and sound">
        <Toggle label="Show work time by default" checked={settings.showWorkTimeByDefault} onChange={(v) => set({ showWorkTimeByDefault: v })} />
        <Toggle label="Shortcut hints" checked={settings.showShortcutHints} onChange={(v) => set({ showShortcutHints: v })} />
        <Toggle label="Sound" checked={settings.soundEnabled} onChange={(v) => set({ soundEnabled: v })} />
        <Toggle
          label="System notifications"
          description="For break prompts while this tab is in the background."
          checked={settings.systemNotifications}
          onChange={(v) => void toggleNotifications(v)}
        />
      </Section>

      <Section title="AI import prompt">
        <PromptSettings template={settings.aiPromptTemplate} />
      </Section>

      <Section title="Your data">
        <div className={styles.row}>
          <div>
            <p>Storage</p>
            <p className={styles.description}>
              {persisted === undefined
                ? 'Checking…'
                : persisted
                  ? 'Persistent — the browser will not clear it to save space.'
                  : 'Best effort — the browser may clear it if space runs low. Keep backups.'}
            </p>
          </div>
          {persisted === false && (
            <Button size="sm" onClick={() => void askPersist()}>
              Ask again
            </Button>
          )}
        </div>
        <div className={styles.row}>
          <div>
            <p>Backup</p>
            <p className={styles.description}>
              {lastBackup ? `Last backup ${new Date(lastBackup).toLocaleDateString()}.` : 'No backup yet.'}
              {backupDue && <span className={styles.reminder}> It's a good moment to make one.</span>}
            </p>
          </div>
          <div className={styles.buttons}>
            <Button size="sm" icon="download" variant={backupDue ? 'primary' : 'secondary'} onClick={() => void exportNow()}>
              Export backup
            </Button>
            <label className={styles.fileButton}>
              Restore backup
              <input
                type="file"
                accept="application/json,.json"
                className="visually-hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void pickRestore(file)
                  e.target.value = ''
                }}
              />
            </label>
          </div>
        </div>
        <div className={styles.row}>
          <div>
            <p>Stats</p>
            <p className={styles.description}>Time tracked, the history behind Today and weekly stats, and personal bests.</p>
          </div>
          <Button size="sm" icon="trash" onClick={() => setConfirmingClear(true)}>
            Clear all stats
          </Button>
        </div>
        <p className={styles.description}>
          Everything lives only in this browser. The backup file includes all your projects, time and history, so it
          also works as raw data for weekly reports.
        </p>
      </Section>

      <ConfirmDialog
        open={confirmingClear}
        title="Clear all stats?"
        confirmLabel="Clear stats"
        onConfirm={() => void confirmClearStats()}
        onCancel={() => setConfirmingClear(false)}
      >
        This deletes all tracked time, the history behind Today and weekly stats, and your personal bests, and stops
        any running timer. Projects, steps, notes, the parking lot and settings are kept. Export a backup first if you
        might want them back.
      </ConfirmDialog>

      <Dialog open={!!restore} onClose={() => setRestore(null)} title="Restore this backup?" size="narrow">
        {restore && (
          <>
            <p>
              This replaces everything in Momentum with <strong>{restore.name}</strong> (
              {restore.backup.tables.projects.length} projects, from{' '}
              {new Date(restore.backup.exportedAt).toLocaleDateString()}), including its settings and AI prompt. Current data will be lost.
            </p>
            <DialogActions>
              <Button variant="ghost" onClick={() => setRestore(null)}>
                Cancel
              </Button>
              <Button variant="primary" data-autofocus onClick={() => void confirmRestore()}>
                Replace my data
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
      <HintBar
        hints={[
          ...(resumeId ? ([['F', 'Resume focus']] as Hint[]) : []),
          ['P', 'Park thought'],
          ['?', 'All shortcuts'],
        ]}
      />
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <div className={styles.card}>{children}</div>
    </section>
  )
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description?: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  const id = useId()
  return (
    <div className={styles.row}>
      <label htmlFor={id}>
        <p>{label}</p>
        {description && <p className={styles.description}>{description}</p>}
      </label>
      <input id={id} type="checkbox" role="switch" className={styles.switch} checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </div>
  )
}

function NumberField({
  label,
  unit,
  value,
  min,
  max,
  onChange,
  disabled,
}: {
  label: string
  unit: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
  disabled?: boolean
}) {
  const id = useId()
  const [draft, setDraft] = useState(String(value))
  const [lastValue, setLastValue] = useState(value)
  if (value !== lastValue) {
    setLastValue(value)
    setDraft(String(value))
  }
  const commit = () => {
    const n = Math.round(Number(draft))
    if (Number.isFinite(n) && n >= min && n <= max) onChange(n)
    else setDraft(String(value))
  }
  return (
    <div className={[styles.row, disabled && styles.disabled].filter(Boolean).join(' ')}>
      <label htmlFor={id}>{label}</label>
      <span className={styles.number}>
        <input
          id={id}
          className="input"
          type="number"
          min={min}
          max={max}
          value={draft}
          disabled={disabled}
          data-hints="Enter:Save|Esc:Done"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
          }}
        />
        <span className={styles.unit}>{unit}</span>
      </span>
    </div>
  )
}
