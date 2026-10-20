import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { Button, IconButton } from '../../components/Button'
import { celebrateBig, celebrateEarly, celebrateSmall, reducedMotion } from '../../components/celebrate'
import { HintBar, type Hint } from '../../components/HintBar'
import { Icon } from '../../components/Icon'
import { ProgressBar } from '../../components/ProgressBar'
import { TagChip } from '../../components/TagChip'
import { dismissToast, showToast } from '../../components/toast'
import {
  completeSubtask,
  endChallenge,
  enterFocus,
  saveBreadcrumb,
  startChallenge,
  undoCompletion,
  type CompleteResult,
} from '../../db/actions'
import { dispatch } from '../../db/session'
import { logEvent } from '../../db/store'
import {
  adjacentTodo,
  beatTimeboxMinutes,
  earlyFinishMessage,
  earlyFinishMs,
  nearTimebox,
  progress,
  projectEstimate,
  shouldPromptTimebox,
  shouldShowBreakPrompt,
  timeboxLeftMs,
  timeboxPromptThresholdMs,
} from '../../domain/rules'
import type { Via } from '../../domain/session'
import type { Subtask } from '../../db/types'
import { formatDuration, MINUTE, workMs } from '../../domain/time'
import { useChallenge, useProject, useReveal, useSegmentsFor, useSession, useSettings, useSubtasks, useTags } from '../../hooks/useData'
import { useNow } from '../../hooks/useNow'
import { useShortcuts } from '../../hooks/useShortcuts'
import { ParkingCapture } from '../parking-lot/ParkingCapture'
import { BreakView } from './BreakView'
import { ChallengeMenu } from './ChallengeMenu'
import { ExitDialog } from './ExitDialog'
import styles from './FocusPage.module.css'
import { NotesArea } from './NotesArea'
import { ProjectComplete } from './ProjectComplete'
import { StepEditor } from './StepEditor'
import { StepMenu } from './StepMenu'
import { TimeRow } from './TimeRow'
import { useFullscreen } from './useFullscreen'

/** How long a finished step stays on screen, celebrating, before the next one slides in. */
const CELEBRATION_MS = 1200
const DONE_MESSAGES = ['Step done', 'Nice work', 'Done — onwards', 'One more down']

interface Celebration {
  subtask: Subtask
  index: number
  message: string
  early: boolean
}

/** How long Undo stays available after completing a step. */
const UNDO_MS = 6000

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const shortTitle = (title: string) => (title.length > 40 ? `${title.slice(0, 39)}…` : title)

export function FocusPage() {
  const { projectId } = useParams()
  const [searchParams] = useSearchParams()
  const requestedStep = searchParams.get('step') ?? undefined
  const navigate = useNavigate()
  const project = useProject(projectId)
  const subtasks = useSubtasks(projectId)
  const allTags = useTags()
  const session = useSession()
  const settings = useSettings()
  const challenge = useChallenge()
  const reveal = useReveal()
  const now = useNow()
  const fullscreen = useFullscreen()

  const [entered, setEntered] = useState(false)
  const [exitOpen, setExitOpen] = useState(false)
  const [parkOpen, setParkOpen] = useState(false)
  const [challengeOpen, setChallengeOpen] = useState(false)
  const [timeboxPromptFor, setTimeboxPromptFor] = useState<string | null>(null)
  const [completed, setCompleted] = useState<CompleteResult | null>(null)
  const [justCompleted, setJustCompleted] = useState(0)
  const [celebration, setCelebration] = useState<Celebration | null>(null)
  const [stepMenuOpen, setStepMenuOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  // A step being looked at while the timer runs on another one.
  const [viewingId, setViewingId] = useState<string | null>(null)
  // The latest completion that can still be undone, with its toast. A ref, not state, so
  // Ctrl+Z pressed the instant after Ctrl+Enter already sees it.
  const undoable = useRef<{ completion: Promise<CompleteResult>; toastId: number } | null>(null)
  const undone = useRef<Promise<CompleteResult> | null>(null)
  const stepLabelRef = useRef<HTMLButtonElement>(null)

  // Undo belongs to the focus screen: don't leave its toast behind on other pages.
  useEffect(
    () => () => {
      if (undoable.current) dismissToast(undoable.current.toastId)
    },
    [],
  )
  const completeRef = useRef<HTMLButtonElement>(null)
  const notesRef = useRef<HTMLTextAreaElement>(null)
  const startRef = useRef<HTMLButtonElement>(null)

  // Point the session at this project (and a requested step, from "Focus on this step")
  // on entry. Never starts the timer. The ?step= is then dropped, so a reload doesn't
  // jump back to it.
  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    void enterFocus(projectId, requestedStep).then(() => {
      if (cancelled) return
      setEntered(true)
      if (requestedStep) navigate(`/focus/${projectId}`, { replace: true })
    })
    return () => {
      cancelled = true
    }
  }, [projectId, requestedStep, navigate])

  // The note left on exit stays on screen until cleared; log that it was seen, once per entry.
  const hasBreadcrumb = !!project?.breadcrumb
  useEffect(() => {
    if (entered && hasBreadcrumb) void logEvent('breadcrumb_shown', { projectId })
    // Only on entry; later breadcrumb edits are not a new showing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entered])

  const clearBreadcrumb = async () => {
    const text = project?.breadcrumb?.text
    if (!project || !text) return
    const id = project.id
    await saveBreadcrumb(id, '')
    showToast({ text: 'Note cleared', action: { label: 'Undo', run: () => void saveBreadcrumb(id, text) } })
  }

  const isOurs = session.projectId === projectId
  const current = isOurs ? subtasks?.find((s) => s.id === session.subtaskId) : undefined
  const running = isOurs && session.state === 'working'
  // While work runs, moving between steps only changes what's on screen: the timer stays
  // on the step it was started on until another one is started.
  const viewing =
    running && viewingId !== current?.id ? subtasks?.find((s) => s.id === viewingId && s.status === 'todo') : undefined
  // The step on screen.
  const subtask = viewing ?? current
  const segments = useSegmentsFor('subtaskId', subtask?.id)
  const subtaskWorkMs = workMs(segments, now)
  const working = running && !viewing
  // The running step's own timebox prompt waits until it's back on screen, so note it meanwhile.
  const runningSegments = useSegmentsFor('subtaskId', viewing ? current?.id : undefined)
  const runningNearTimebox =
    !!viewing &&
    !!current &&
    challenge?.subtaskId !== current.id &&
    nearTimebox(current.timeboxMinutes, workMs(runningSegments, now), settings.timeboxPromptPercentLeft)
  useEffect(() => {
    if (!running) setViewingId(null)
  }, [running])
  const onBreak = isOurs && session.state === 'break'
  const activeChallenge = challenge && subtask && challenge.subtaskId === subtask.id ? challenge : undefined
  const breakPrompt = isOurs && shouldShowBreakPrompt(session, settings, now)

  // Timebox prompt: once per subtask, when the configured minutes are left.
  // The challenge offer only makes sense while there's time left to beat.
  const timeUp = timeboxLeftMs(subtask?.timeboxMinutes, subtaskWorkMs) === 0
  const promptTimebox =
    !!subtask &&
    !viewing &&
    shouldPromptTimebox({
      session,
      subtask,
      subtaskWorkMs,
      thresholdPercent: settings.timeboxPromptPercentLeft,
      challengeActive: !!activeChallenge,
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

  /** Starts work on the step on screen, moving the timer onto it if it runs on another. */
  const startShown = async (via: Via) => {
    if (!subtask) return
    if (running) await dispatch({ type: 'switch', subtaskId: subtask.id }, via)
    else await dispatch({ type: 'start', projectId, subtaskId: subtask.id }, via)
    setViewingId(null)
  }

  const toggleWork = (via: Via) => {
    if (!subtask) return
    if (working) void dispatch({ type: 'stop' }, via)
    else void startShown(via)
  }

  const toggleBreak = (via: Via) => {
    if (onBreak) void dispatch({ type: 'resume' }, via)
    else void dispatch({ type: 'startBreak' }, via)
  }

  const complete = async () => {
    if (!subtask || celebration) return
    // The step is saved straight away (so no extra time lands on it), but stays on screen
    // for a moment of celebration before the next one slides in.
    const spare = earlyFinishMs(subtask.timeboxMinutes, subtaskWorkMs)
    const early = spare !== undefined
    setCelebration({
      subtask,
      index: chain.findIndex((s) => s.id === subtask.id),
      early,
      message: early ? earlyFinishMessage(spare) : DONE_MESSAGES[justCompleted % DONE_MESSAGES.length],
    })
    if (early) celebrateEarly(completeRef.current)
    else celebrateSmall(completeRef.current)
    setJustCompleted((n) => n + 1)
    // Keep Space meaning start/stop rather than "complete again".
    startRef.current?.focus()
    const completion = completeSubtask(subtask.id, 'focus')
    const toastId = showToast({
      text: `Completed “${shortTitle(subtask.title)}”`,
      duration: UNDO_MS,
      action: { label: 'Undo', run: () => void undo(completion) },
    })
    undoable.current = { completion, toastId }
    setTimeout(() => {
      if (undoable.current?.completion === completion) undoable.current = null
    }, UNDO_MS)
    let result: CompleteResult
    try {
      ;[result] = await Promise.all([completion, pause(reducedMotion() ? 500 : CELEBRATION_MS)])
    } catch {
      dismissToast(toastId)
      if (undoable.current?.completion === completion) undoable.current = null
      showToast({ text: "That step didn't save. Try again?", duration: 4000 })
      return
    } finally {
      setCelebration(null)
    }
    // Undone during the celebration moment: nothing more to celebrate.
    if (undone.current === completion) return
    // A step finished while the timer ran on another: back to the running one.
    if (!result.wasCurrent) setViewingId(null)
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
    // The project celebration follows the last step's moment rather than drowning it out.
    // ProjectComplete fires the confetti itself, above its dialog's backdrop.
    if (result.projectCompleted) setCompleted(result)
    setTimeboxPromptFor(null)
  }

  /** Puts a just-completed step back: to-do again, current again, project reopened. */
  const undo = async (completion: Promise<CompleteResult>) => {
    if (undone.current === completion) return
    undone.current = completion
    if (undoable.current?.completion === completion) {
      dismissToast(undoable.current.toastId)
      undoable.current = null
    }
    let result: CompleteResult
    try {
      result = await completion
    } catch {
      return
    }
    await undoCompletion(result)
    // Undo leaves the session alone for a step that wasn't current, so bring it back on screen.
    if (!result.wasCurrent) await switchTo(result.subtaskId)
    setCelebration(null)
    setCompleted(null)
    setJustCompleted((n) => n + 1)
    showToast({ text: 'Step back on your list', duration: 2000 })
  }

  const switchTo = async (id: string | undefined) => {
    if (!id) return
    if (running) {
      setViewingId(id === current?.id ? null : id)
      return
    }
    setTimeboxPromptFor(null)
    await dispatch({ type: 'switch', subtaskId: id })
  }

  const backToRunning = () => {
    setViewingId(null)
    startRef.current?.focus()
  }

  const beginChallenge = async (minutes: number, source: 'manual' | 'timeboxPrompt') => {
    if (!subtask) return
    setChallengeOpen(false)
    setTimeboxPromptFor(null)
    await startChallenge(subtask.id, minutes, source)
    if (!working) await startShown('focus')
  }

  const cancelChallenge = async () => {
    setChallengeOpen(false)
    await endChallenge('cancelled')
  }

  const toggleAllTime = () => {
    const show = !(reveal.work && reveal.timers)
    reveal.set({ work: show, timers: show })
    if (show) void logEvent('time_revealed', { projectId, subtaskId: subtask?.id, data: { what: activeChallenge ? 'challenge' : 'work' } })
  }

  const busy = exitOpen || parkOpen || stepMenuOpen || !!completed
  // What the card shows: the finished step while it celebrates, otherwise the current one.
  const shown = celebration?.subtask ?? subtask
  const shownTags = allTags.filter((t) => shown?.tags?.includes(t.id))
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
      e: () => {
        if (subtask && !celebration && !onBreak) setEditing(true)
      },
      'Mod+z': () => {
        if (undoable.current) void undo(undoable.current.completion)
      },
      Escape: () => {
        if (challengeOpen) setChallengeOpen(false)
        else setExitOpen(true)
      },
    },
    !busy,
    { spaceOverridesButtons: true },
  )
  // Once the project is complete the page is a celebration; Esc heads back to the overview.
  // Undo is still possible for a few seconds.
  useShortcuts(
    {
      Escape: () => navigate('/'),
      'Mod+z': () => {
        if (undoable.current) void undo(undoable.current.completion)
      },
    },
    !!completed && !exitOpen && !parkOpen,
  )

  const hints: Hint[] = completed
    ? [['Enter', 'Back to overview']]
    : onBreak
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
      <div className={styles.projectHeading}>
        {project.externalKey && <span className={styles.ticketKey}>{project.externalKey}</span>}
        <span className={styles.projectTitle}>{project.title}</span>
      </div>
      <div className={styles.topIcons}>
        <IconButton icon="inbox" label="Park a thought (P)" onClick={() => setParkOpen(true)} />
        {fullscreen.supported && (
          <IconButton
            icon={fullscreen.active ? 'compress' : 'expand'}
            label={fullscreen.active ? 'Exit fullscreen (F)' : 'Fullscreen (F)'}
            onClick={fullscreen.toggle}
          />
        )}
      </div>
    </header>
  )

  const dialogs = (
    <>
      <ExitDialog
        open={exitOpen}
        projectId={projectId}
        breadcrumb={project.breadcrumb?.text ?? ''}
        working={running}
        onCancel={() => setExitOpen(false)}
        onExited={() => navigate('/')}
      />
      <ParkingCapture open={parkOpen} projectId={projectId} projectTitle={project.title} onClose={() => setParkOpen(false)} />
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
        <div className={styles.banners}>
          {breakPrompt && !completed && (
            <div className={styles.banner} role="status" data-own-keys>
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

          {timeboxPromptFor && timeboxPromptFor === subtask?.id && !activeChallenge && !timeUp && (
            <div className={styles.banner} role="status" data-own-keys>
              <Icon name="hourglass" size={18} />
              <span>Nearly at your timebox — want to turn on challenge mode?</span>
              <div className={styles.bannerActions}>
                <Button
                  size="sm"
                  variant="primary"
                  icon="flame"
                  onClick={() => void beginChallenge(beatTimeboxMinutes(subtask.timeboxMinutes, subtaskWorkMs) ?? Math.max(1, Math.round(timeboxPromptThresholdMs(subtask.timeboxMinutes ?? 0, settings.timeboxPromptPercentLeft) / MINUTE)), 'timeboxPrompt')}
                >
                  Start challenge
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setTimeboxPromptFor(null)}>
                  No thanks
                </Button>
              </div>
            </div>
          )}

          {viewing && current && !celebration && !completed && (
            <div className={styles.banner} role="status" data-own-keys>
              <Icon name="play" size={18} />
              <span>
                {`Your timer is still running on step ${chain.findIndex((s) => s.id === current.id) + 1}: “${shortTitle(current.title)}”`}
                {runningNearTimebox && (
                  <span className={styles.bannerNote}>
                    <Icon name="hourglass" size={14} />
                    It's nearly at its timebox.
                  </span>
                )}
              </span>
              <div className={styles.bannerActions}>
                <Button size="sm" variant="primary" onClick={backToRunning}>
                  Back to it
                </Button>
              </div>
            </div>
          )}
        </div>

        {completed ? (
          <ProjectComplete
            title={project.title}
            steps={total}
            totalWorkMs={completed.totalWorkMs ?? 0}
            estimateMinutes={projectEstimate(chain).minutes}
            onDone={() => navigate('/')}
          />
        ) : shown ? (
          <>
            <div className={styles.taskRow}>
              <IconButton
                icon="chevronLeft"
                label="Previous step"
                disabled={!prev || !!celebration}
                onClick={() => void switchTo(prev?.id)}
              />
              <section
                key={shown.id}
                className={[
                  styles.card,
                  activeChallenge && !celebration && styles.challenge,
                  celebration && styles.celebrating,
                  celebration?.early && styles.celebratingEarly,
                  stepMenuOpen && styles.cardRaised,
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-live="polite"
              >
                <div className={styles.stepLabelWrap}>
                  <button
                    ref={stepLabelRef}
                    type="button"
                    className={styles.stepLabel}
                    aria-haspopup="menu"
                    aria-expanded={stepMenuOpen}
                    disabled={!!celebration}
                    title="Jump to another step"
                    onClick={() => setStepMenuOpen(!stepMenuOpen)}
                  >
                    Step {(celebration ? celebration.index : chain.findIndex((s) => s.id === shown.id)) + 1} of {total}
                    {shown.phase && <> · {shown.phase}</>}
                    <Icon name="chevronDown" size={12} />
                  </button>
                  {stepMenuOpen && (
                    <StepMenu
                      steps={chain}
                      currentId={shown.id}
                      onPick={(id) => {
                        setStepMenuOpen(false)
                        void switchTo(id)
                      }}
                      onClose={() => {
                        setStepMenuOpen(false)
                        stepLabelRef.current?.focus()
                      }}
                    />
                  )}
                </div>
                {!celebration && !editing && (
                  <IconButton
                    small
                    icon="pencil"
                    label="Edit this step (E)"
                    className={styles.editStep}
                    onClick={() => setEditing(true)}
                  />
                )}
                {editing && !celebration && subtask ? (
                  <StepEditor
                    subtask={subtask}
                    onDone={() => {
                      setEditing(false)
                      startRef.current?.focus()
                    }}
                  />
                ) : (
                  <h1 className={styles.taskTitle}>{shown.title}</h1>
                )}
                {shown.description && <p className={styles.description}>{shown.description}</p>}
                {shownTags.length > 0 && (
                  <div className={styles.cardTags} aria-label="Tags">
                    {shownTags.map((tag) => (
                      <TagChip key={tag.id} tag={tag} />
                    ))}
                  </div>
                )}
                {celebration ? (
                  <div className={styles.doneRow}>
                    <span className={styles.doneBadge}>
                      <Icon name={celebration.early ? 'sparkle' : 'check'} size={20} />
                    </span>
                    <span className={styles.doneMessage}>{celebration.message}</span>
                  </div>
                ) : (
                  <TimeRow
                    subtask={shown}
                    subtaskWorkMs={subtaskWorkMs}
                    challenge={activeChallenge}
                    showWork={reveal.work}
                    showTimers={reveal.timers}
                    onToggleWork={() => reveal.toggle('work')}
                  />
                )}
              </section>
              <IconButton
                icon="chevronRight"
                label="Next step"
                disabled={!next || !!celebration}
                onClick={() => void switchTo(next?.id)}
              />
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
                <Button
                  ref={completeRef}
                  variant={working || celebration ? 'success' : 'secondary'}
                  size="lg"
                  icon="check"
                  onClick={() => void complete()}
                  aria-disabled={!!celebration}
                >
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
                      beatMinutes={beatTimeboxMinutes(shown.timeboxMinutes, subtaskWorkMs)}
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

      {/* The note from last time sits between the controls and this step's notes. */}
      {project.breadcrumb && !completed && (
        <div className={styles.breadcrumbSlot}>
          <div className={styles.breadcrumb} role="note" aria-label="Your note from last time">
            <Icon name="note" size={20} />
            <div>
              <span className={styles.breadcrumbLabel}>Last time you said</span>
              <p>{project.breadcrumb.text}</p>
            </div>
            <IconButton icon="x" label="Clear note" className={styles.breadcrumbClear} onClick={() => void clearBreadcrumb()} />
          </div>
        </div>
      )}

      {subtask && <NotesArea key={subtask.id} subtask={subtask} textareaRef={notesRef} />}

      {dialogs}
      <HintBar hints={hints} align="right" />
    </div>
  )
}
