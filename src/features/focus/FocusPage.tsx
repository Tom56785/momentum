import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Button, IconButton } from '../../components/Button'
import { celebrateBig, celebrateSmall } from '../../components/celebrate'
import { HintBar, type Hint } from '../../components/HintBar'
import { Icon } from '../../components/Icon'
import { ProgressBar } from '../../components/ProgressBar'
import { showToast } from '../../components/toast'
import { completeSubtask, endChallenge, enterFocus, startChallenge, type CompleteResult } from '../../db/actions'
import { dispatch } from '../../db/session'
import { logEvent } from '../../db/store'
import { adjacentTodo, beatTimeboxMinutes, progress, shouldPromptTimebox, shouldShowBreakPrompt, timeboxLeftMs } from '../../domain/rules'
import type { Via } from '../../domain/session'
import { formatDuration, MINUTE, workMs } from '../../domain/time'
import { useChallenge, useProject, useReveal, useSegmentsFor, useSession, useSettings, useSubtasks } from '../../hooks/useData'
import { useNow } from '../../hooks/useNow'
import { useShortcuts } from '../../hooks/useShortcuts'
import { ParkingCapture } from '../parking-lot/ParkingCapture'
import { BreakView } from './BreakView'
import { ChallengeMenu } from './ChallengeMenu'
import { ExitDialog } from './ExitDialog'
import styles from './FocusPage.module.css'
import { NotesArea } from './NotesArea'
import { ProjectComplete } from './ProjectComplete'
import { TimeRow } from './TimeRow'
import { useFullscreen } from './useFullscreen'

export function FocusPage() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const project = useProject(projectId)
  const subtasks = useSubtasks(projectId)
  const session = useSession()
  const settings = useSettings()
  const challenge = useChallenge()
  const reveal = useReveal()
  const now = useNow()
  const fullscreen = useFullscreen()

  const [entered, setEntered] = useState(false)
  const [showBreadcrumb, setShowBreadcrumb] = useState(false)
  const [exitOpen, setExitOpen] = useState(false)
  const [parkOpen, setParkOpen] = useState(false)
  const [challengeOpen, setChallengeOpen] = useState(false)
  const [timeboxPromptFor, setTimeboxPromptFor] = useState<string | null>(null)
  const [completed, setCompleted] = useState<CompleteResult | null>(null)
  const [justCompleted, setJustCompleted] = useState(0)
  const completeRef = useRef<HTMLButtonElement>(null)
  const notesRef = useRef<HTMLTextAreaElement>(null)
  const startRef = useRef<HTMLButtonElement>(null)

  // Point the session at this project on entry. Never starts the timer.
  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    void enterFocus(projectId).then(() => {
      if (!cancelled) setEntered(true)
    })
    return () => {
      cancelled = true
    }
  }, [projectId])

  // Show the breadcrumb once on entry, if there is one.
  const hasBreadcrumb = !!project?.breadcrumb
  useEffect(() => {
    if (entered && hasBreadcrumb) {
      setShowBreadcrumb(true)
      void logEvent('breadcrumb_shown', { projectId })
    }
    // Only on entry; later breadcrumb edits should not re-open it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entered])

  const isOurs = session.projectId === projectId
  const subtask = isOurs ? subtasks?.find((s) => s.id === session.subtaskId) : undefined
  const segments = useSegmentsFor('subtaskId', subtask?.id)
  const subtaskWorkMs = workMs(segments, now)
  const working = isOurs && session.state === 'working'
  const onBreak = isOurs && session.state === 'break'
  const activeChallenge = challenge && subtask && challenge.subtaskId === subtask.id ? challenge : undefined
  const breakPrompt = isOurs && shouldShowBreakPrompt(session, settings, now)

  // Timebox prompt: once per subtask, when the configured minutes are left.
  const promptTimebox =
    !!subtask &&
    shouldPromptTimebox({
      session,
      subtask,
      subtaskWorkMs,
      thresholdMinutes: settings.timeboxPromptMinutesLeft,
      challengeActive: !!challenge,
    })
  useEffect(() => {
    if (!promptTimebox || !subtask) return
    const minutesLeft = Math.ceil((timeboxLeftMs(subtask.timeboxMinutes, subtaskWorkMs) ?? 0) / MINUTE)
    void dispatch({ type: 'timeboxPromptShown', subtaskId: subtask.id })
    void logEvent('timebox_prompt_shown', { projectId, subtaskId: subtask.id, data: { minutesLeft } })
    setTimeboxPromptFor(subtask.id)
    // subtaskWorkMs changes every second; the prompt only fires on the crossing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promptTimebox, subtask?.id])

  const chain = subtasks ?? []
  const { done, total } = progress(chain)
  const prev = subtask ? adjacentTodo(chain, subtask.id, -1) : undefined
  const next = subtask ? adjacentTodo(chain, subtask.id, 1) : undefined

  const toggleWork = (via: Via) => {
    if (!subtask) return
    if (working) void dispatch({ type: 'stop' }, via)
    else {
      setShowBreadcrumb(false)
      void dispatch({ type: 'start', projectId, subtaskId: subtask.id }, via)
    }
  }

  const toggleBreak = (via: Via) => {
    if (onBreak) void dispatch({ type: 'resume' }, via)
    else {
      setShowBreadcrumb(false)
      void dispatch({ type: 'startBreak' }, via)
    }
  }

  const complete = async () => {
    if (!subtask) return
    celebrateSmall(completeRef.current)
    setJustCompleted((n) => n + 1)
    // Keep Space meaning start/stop rather than "complete again".
    startRef.current?.focus()
    const result = await completeSubtask(subtask.id, 'focus')
    if (result.challenge?.outcome === 'beat') {
      celebrateBig()
      showToast({
        text: result.challenge.newPersonalBest
          ? `Challenge beaten — a personal best for ${result.challenge.phase}!`
          : `Challenge beaten in ${formatDuration(result.challenge.elapsedMs)}!`,
        tone: 'celebrate',
        duration: 4500,
      })
    }
    if (result.projectCompleted) {
      celebrateBig()
      setCompleted(result)
    }
    setTimeboxPromptFor(null)
  }

  const switchTo = async (id: string | undefined) => {
    if (!id) return
    if (challenge) await endChallenge('cancelled', subtaskWorkMs)
    setTimeboxPromptFor(null)
    await dispatch({ type: 'switch', subtaskId: id })
  }

  const beginChallenge = async (minutes: number, source: 'manual' | 'timeboxPrompt') => {
    if (!subtask) return
    setChallengeOpen(false)
    setTimeboxPromptFor(null)
    await startChallenge(subtask.id, minutes, subtaskWorkMs, source)
    if (!working) await dispatch({ type: 'start', projectId, subtaskId: subtask.id }, 'focus')
  }

  const cancelChallenge = async () => {
    setChallengeOpen(false)
    await endChallenge('cancelled', subtaskWorkMs)
  }

  const toggleAllTime = () => {
    const show = !(reveal.work && reveal.timers)
    reveal.set({ work: show, timers: show })
    if (show) void logEvent('time_revealed', { projectId, subtaskId: subtask?.id, data: { what: activeChallenge ? 'challenge' : 'work' } })
  }

  const busy = exitOpen || parkOpen || !!completed
  useShortcuts(
    {
      Space: () => toggleWork('shortcut'),
      'Mod+Enter': () => void complete(),
      b: () => toggleBreak('shortcut'),
      p: () => setParkOpen(true),
      c: () => {
        if (subtask && !onBreak) setChallengeOpen(true)
      },
      t: toggleAllTime,
      n: () => notesRef.current?.focus(),
      f: () => fullscreen.toggle(),
      Escape: () => {
        if (challengeOpen) setChallengeOpen(false)
        else setExitOpen(true)
      },
    },
    !busy,
    { spaceOverridesButtons: true },
  )

  const hints: Hint[] = onBreak
    ? [
        ['B', 'Resume work'],
        ['Esc', 'Exit'],
      ]
    : activeChallenge
      ? [
          ['Space', working ? 'Pause' : 'Start'],
          ['Ctrl/Cmd+Enter', 'Complete'],
          ['T', reveal.timers ? 'Hide time' : 'Show time'],
          ['Esc', 'Exit'],
        ]
      : working
        ? [
            ['Space', 'Pause'],
            ['Ctrl/Cmd+Enter', 'Complete'],
            ['B', 'Break'],
            ['P', 'Park thought'],
            ['C', 'Challenge'],
          ]
        : subtask
          ? [
              ['Space', 'Start'],
              ['B', 'Break'],
              ['P', 'Park thought'],
              ['Esc', 'Exit'],
            ]
          : [['Esc', 'Exit']]

  if (!projectId) return null
  if (project === null) {
    return (
      <div className={styles.center}>
        <p>This project isn't here any more.</p>
        <Link to="/">Back to overview</Link>
      </div>
    )
  }
  if (!project || !subtasks) return <div className={styles.page} />

  const topBar = (
    <header className={styles.top}>
      <IconButton icon="arrowLeft" label="Exit focus (Esc)" onClick={() => setExitOpen(true)} />
      <span className={styles.projectTitle}>{project.title}</span>
      <div className={styles.topIcons}>
        <IconButton icon="inbox" label="Park a thought (P)" onClick={() => setParkOpen(true)} />
        <IconButton
          icon={fullscreen.active ? 'compress' : 'expand'}
          label={fullscreen.active ? 'Exit fullscreen (F)' : 'Fullscreen (F)'}
          onClick={fullscreen.toggle}
        />
      </div>
    </header>
  )

  const dialogs = (
    <>
      <ExitDialog
        open={exitOpen}
        projectId={projectId}
        breadcrumb={project.breadcrumb?.text ?? ''}
        working={working}
        onCancel={() => setExitOpen(false)}
        onExited={() => navigate('/')}
      />
      <ParkingCapture open={parkOpen} projectId={projectId} projectTitle={project.title} onClose={() => setParkOpen(false)} />
      {completed && (
        <ProjectComplete
          title={project.title}
          steps={total}
          totalWorkMs={completed.totalWorkMs ?? 0}
          onDone={() => navigate('/')}
        />
      )}
    </>
  )

  if (onBreak) {
    return (
      <div className={[styles.page, styles.breakPage].join(' ')}>
        {topBar}
        <BreakView onResume={() => toggleBreak('button')} />
        {dialogs}
        <HintBar hints={hints} align="right" />
      </div>
    )
  }

  return (
    <div className={styles.page}>
      {topBar}

      <main className={styles.main}>
        {breakPrompt && (
          <div className={styles.banner} role="status">
            <Icon name="coffee" size={18} />
            <span>You've been going for a while. A short break helps the next stretch.</span>
            <div className={styles.bannerActions}>
              <Button size="sm" variant="primary" onClick={() => void dispatch({ type: 'startBreak' }, 'prompt')}>
                Take a break
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void dispatch({ type: 'snooze', snoozeMinutes: settings.snoozeMinutes })}>
                Keep going
              </Button>
            </div>
          </div>
        )}

        {timeboxPromptFor && timeboxPromptFor === subtask?.id && !activeChallenge && (
          <div className={styles.banner} role="status">
            <Icon name="hourglass" size={18} />
            <span>Nearly at your timebox — want to turn on challenge mode?</span>
            <div className={styles.bannerActions}>
              <Button
                size="sm"
                variant="primary"
                icon="flame"
                onClick={() => void beginChallenge(beatTimeboxMinutes(subtask.timeboxMinutes, subtaskWorkMs) ?? settings.timeboxPromptMinutesLeft, 'timeboxPrompt')}
              >
                Start challenge
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setTimeboxPromptFor(null)}>
                No thanks
              </Button>
            </div>
          </div>
        )}

        {showBreadcrumb && project.breadcrumb && (
          <div className={styles.breadcrumb}>
            <Icon name="note" size={16} />
            <div>
              <span className={styles.breadcrumbLabel}>Last time you said</span>
              <p>{project.breadcrumb.text}</p>
            </div>
            <IconButton
              small
              icon="x"
              label="Dismiss note"
              onClick={() => setShowBreadcrumb(false)}
            />
          </div>
        )}

        {subtask ? (
          <>
            <div className={styles.taskRow}>
              <IconButton
                icon="chevronLeft"
                label="Previous step"
                disabled={!prev}
                onClick={() => void switchTo(prev?.id)}
              />
              <section
                key={subtask.id}
                className={[styles.card, activeChallenge && styles.challenge].filter(Boolean).join(' ')}
                aria-live="polite"
              >
                <span className={styles.stepLabel}>
                  Step {chain.findIndex((s) => s.id === subtask.id) + 1} of {total}
                  {subtask.phase && <> · {subtask.phase}</>}
                </span>
                <h1 className={styles.taskTitle}>{subtask.title}</h1>
                {subtask.description && <p className={styles.description}>{subtask.description}</p>}
                <TimeRow
                  subtask={subtask}
                  subtaskWorkMs={subtaskWorkMs}
                  challenge={activeChallenge}
                  showWork={reveal.work}
                  showTimers={reveal.timers}
                  onToggleWork={() => reveal.toggle('work')}
                />
              </section>
              <IconButton icon="chevronRight" label="Next step" disabled={!next} onClick={() => void switchTo(next?.id)} />
            </div>

            <div className={styles.progress}>
              <ProgressBar done={done} total={total} size="lg" />
              <span key={justCompleted} className={[styles.progressCount, justCompleted > 0 && styles.bump].filter(Boolean).join(' ')}>
                {done} of {total}
              </span>
            </div>

            <div className={styles.controls}>
              <Button
                ref={startRef}
                variant={working ? 'secondary' : 'primary'}
                size="xl"
                icon={working ? 'pause' : 'play'}
                onClick={() => toggleWork('focus')}
                aria-pressed={working}
                autoFocus
              >
                {working ? 'Pause' : 'Start'}
              </Button>
              <div className={styles.secondary}>
                <Button ref={completeRef} variant={working ? 'success' : 'secondary'} size="lg" icon="check" onClick={() => void complete()}>
                  Complete
                </Button>
                <Button variant="ghost" size="lg" icon="coffee" onClick={() => toggleBreak('button')}>
                  Break
                </Button>
                <div className={styles.challengeWrap}>
                  <IconButton
                    icon="flame"
                    label={activeChallenge ? 'Challenge options (C)' : 'Start a challenge (C)'}
                    active={!!activeChallenge}
                    aria-expanded={challengeOpen}
                    onClick={() => setChallengeOpen(!challengeOpen)}
                  />
                  {challengeOpen && (
                    <ChallengeMenu
                      active={!!activeChallenge}
                      beatMinutes={beatTimeboxMinutes(subtask.timeboxMinutes, subtaskWorkMs)}
                      onStart={(m) => void beginChallenge(m, 'manual')}
                      onCancelChallenge={() => void cancelChallenge()}
                      onClose={() => setChallengeOpen(false)}
                    />
                  )}
                </div>
              </div>
            </div>
          </>
        ) : (
          entered && (
            <div className={styles.center}>
              <Icon name="sparkle" size={28} />
              <p>{total === 0 ? 'This project has no steps yet.' : 'Every step here is done.'}</p>
              <Link to={`/project/${project.id}`}>{total === 0 ? 'Add some steps' : 'Open the project'}</Link>
            </div>
          )
        )}
      </main>

      {subtask && <NotesArea key={subtask.id} subtask={subtask} textareaRef={notesRef} />}

      {dialogs}
      <HintBar hints={hints} align="right" />
    </div>
  )
}
