import { useEffect, useRef } from 'react'
import { endChallenge } from '../db/actions'
import { dispatch } from '../db/session'
import { getAppState, setAppState } from '../db/store'
import { isBreakOver, isChallengeTimeUp, shouldShowBreakPrompt } from '../domain/rules'
import { workMs } from '../domain/time'
import { useChallenge, useSegment, useSegmentsFor, useSession, useSettings } from '../hooks/useData'
import { useNow } from '../hooks/useNow'
import { chime } from './celebrate'
import { showToast } from './toast'

function notify(title: string, body: string) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  try {
    new Notification(title, { body, icon: '/pwa-192x192.png', tag: 'momentum', silent: true })
  } catch {
    // Some platforms only allow notifications from a service worker; skip quietly.
  }
}

/**
 * App-wide time watchers: tab title indicator, break prompt bookkeeping and notifications,
 * challenge time-up, and the first-run storage persistence request.
 */
export function Watchers() {
  const session = useSession()
  const settings = useSettings()
  const challenge = useChallenge()
  const challengeSegments = useSegmentsFor('subtaskId', challenge?.subtaskId)
  const openSegment = useSegment(session.openSegmentId)
  const now = useNow()
  const breakNotifiedFor = useRef<string | undefined>(undefined)

  // Tab title shows a small dot while work is running.
  useEffect(() => {
    const prefix = session.state === 'working' ? '● ' : session.state === 'break' ? '◦ ' : ''
    document.title = `${prefix}Momentum`
  }, [session.state])

  // Break prompt: record when it first shows, and notify if the tab is hidden.
  const showPrompt = shouldShowBreakPrompt(session, settings, now)
  useEffect(() => {
    if (!showPrompt || session.breakPromptShownAt !== undefined) return
    void dispatch({ type: 'breakPromptShown' })
    void chime('soft')
    if (document.hidden && settings.systemNotifications) {
      notify('Time for a break?', `You've been working for ${settings.workIntervalMinutes} minutes. A short break helps.`)
    }
  }, [showPrompt, session.breakPromptShownAt, settings.systemNotifications, settings.workIntervalMinutes])

  // Break over: a gentle notification when hidden; the break screen shows its own message.
  const breakOver =
    session.state === 'break' && openSegment?.kind === 'break' && isBreakOver(openSegment.startedAt, settings.breakMinutes, now)
  useEffect(() => {
    if (!breakOver || breakNotifiedFor.current === session.openSegmentId) return
    breakNotifiedFor.current = session.openSegmentId
    if (document.hidden && settings.systemNotifications) notify('Ready when you are', 'Your break time has passed.')
  }, [breakOver, session.openSegmentId, settings.systemNotifications])

  // Challenge time-up: fade out quietly with a neutral message. Work continues.
  const challengeWorkMs = workMs(challengeSegments, now)
  const timeUp = challenge !== undefined && isChallengeTimeUp(challenge, challengeWorkMs)
  useEffect(() => {
    if (!timeUp) return
    void endChallenge('timeUp', challengeWorkMs).then(() => {
      showToast({ text: 'Challenge wrapped up — nice push.', duration: 4000 })
    })
    // challengeWorkMs intentionally omitted: fire once when time runs out.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeUp])

  // Ask the browser to keep our data on first run.
  useEffect(() => {
    void (async () => {
      if ((await getAppState('storagePersisted')) !== undefined) return
      const persisted = (await navigator.storage?.persist?.()) ?? false
      await setAppState('storagePersisted', persisted)
    })()
  }, [])

  return null
}
