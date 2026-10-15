import { useEffect, useState } from 'react'
import { db } from '../db/db'
import { applyAction, SESSION_TABLES } from '../db/session'
import { getSession, logEvent } from '../db/store'
import type { Segment } from '../db/types'
import { isStaleSession, staleEndTime } from '../domain/rules'
import { formatDuration } from '../domain/time'
import { Button } from './Button'
import { Dialog, DialogActions } from './Dialog'

interface StaleInfo {
  segment: Segment
  lastActivity: number
  checkedAt: number
}

/** On load, asks once about a work segment left open for more than 4 hours. Never discards time silently. */
export function StaleSessionDialog() {
  const [stale, setStale] = useState<StaleInfo | null>(null)

  useEffect(() => {
    void (async () => {
      const session = await getSession()
      const segment = session.openSegmentId ? await db.segments.get(session.openSegmentId) : undefined
      if (!segment || !isStaleSession(session, segment, Date.now())) return
      const events = await db.events.where('ts').above(segment.startedAt).toArray()
      setStale({ segment, lastActivity: staleEndTime(segment, events), checkedAt: Date.now() })
    })()
  }, [])

  if (!stale) return null

  const resolve = async (kept: boolean) => {
    const now = Date.now()
    await db.transaction('rw', [...SESSION_TABLES], async () => {
      await applyAction(kept ? { type: 'keepStale' } : { type: 'endStale', endAt: stale.lastActivity })
      const end = kept ? now : stale.lastActivity
      await logEvent('stale_session_resolved', {
        projectId: stale.segment.projectId,
        subtaskId: stale.segment.subtaskId,
        data: { kept, openMs: end - stale.segment.startedAt },
      })
    })
    setStale(null)
  }

  const openFor = formatDuration(stale.checkedAt - stale.segment.startedAt)
  const lastTime = new Date(stale.lastActivity).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  return (
    <Dialog open title="Were you still working?" onClose={() => void resolve(true)} size="narrow">
      <p>
        The work timer has been running for {openFor}. Keep all that time, or end it at when you last did something
        ({lastTime})?
      </p>
      <DialogActions>
        <Button onClick={() => void resolve(true)}>Keep the time</Button>
        <Button variant="primary" autoFocus onClick={() => void resolve(false)}>
          End it at {lastTime}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
