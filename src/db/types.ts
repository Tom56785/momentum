export const PHASES = ['understand', 'investigate', 'implement', 'test', 'review', 'deploy', 'other'] as const
export type Phase = (typeof PHASES)[number]

export type ProjectStatus = 'active' | 'done' | 'archived'

export interface Project {
  id: string
  title: string
  externalKey?: string // e.g. Jira key "ABC-123"
  url?: string
  summary?: string // high-level problem
  problem?: string
  cause?: string // technical reason
  solution?: string
  targetDate?: string // ISO date
  status: ProjectStatus
  breadcrumb?: { text: string; updatedAt: number }
  createdAt: number
  updatedAt: number
  completedAt?: number
}

export interface Subtask {
  id: string
  projectId: string
  order: number // position in the chain
  title: string
  description?: string
  phase?: Phase
  timeboxMinutes?: number
  notes: string // free text, autosaved
  status: 'todo' | 'done'
  createdAt: number
  completedAt?: number
}

/** One row per continuous stretch of work or break. */
export interface Segment {
  id: string
  kind: 'work' | 'break'
  projectId?: string // work only
  subtaskId?: string // work only
  startedAt: number
  endedAt?: number // undefined = currently running
}

export type EventType =
  | 'project_created'
  | 'project_imported'
  | 'project_completed'
  | 'project_reopened'
  | 'subtask_completed'
  | 'subtask_reopened'
  | 'subtask_switched'
  | 'work_started'
  | 'work_stopped'
  | 'break_started'
  | 'break_ended'
  | 'break_prompt_shown'
  | 'break_prompt_snoozed'
  | 'timebox_prompt_shown'
  | 'challenge_started'
  | 'challenge_ended'
  | 'focus_entered'
  | 'focus_exited'
  | 'breadcrumb_saved'
  | 'breadcrumb_shown'
  | 'time_revealed'
  | 'parking_lot_added'
  | 'stale_session_resolved'

/** Append-only log for later analysis. */
export interface AppEvent {
  seq?: number
  ts: number
  type: EventType
  projectId?: string
  subtaskId?: string
  data?: Record<string, unknown>
}

export interface ParkingLotItem {
  id: string
  text: string // the one-line capture
  details?: string // added later on the parking lot page
  projectId?: string // undefined = not related to a project
  createdAt: number
  updatedAt: number
  done: boolean
  convertedTo?: { kind: 'subtask' | 'project'; id: string }
}

export interface Settings {
  breakPromptsEnabled: boolean
  workIntervalMinutes: number
  breakMinutes: number
  snoozeMinutes: number
  timeboxPromptMinutesLeft: number
  showWorkTimeByDefault: boolean
  showShortcutHints: boolean
  soundEnabled: boolean
  systemNotifications: boolean
  lastBackupAt?: number
  /** Custom AI import prompt; undefined means the built-in default. */
  aiPromptTemplate?: string
}

export const DEFAULT_SETTINGS: Settings = {
  breakPromptsEnabled: true,
  workIntervalMinutes: 25,
  breakMinutes: 5,
  snoozeMinutes: 10,
  timeboxPromptMinutesLeft: 5,
  showWorkTimeByDefault: false,
  showShortcutHints: true,
  soundEnabled: false,
  systemNotifications: false,
}

export type SessionState = 'idle' | 'working' | 'paused' | 'break'

export interface Session {
  state: SessionState
  projectId?: string
  subtaskId?: string
  openSegmentId?: string // the segment with no endedAt
  continuousWorkSince?: number // start of current unbroken work stretch
  breakPromptSnoozedUntil?: number
  breakPromptShownAt?: number
  timeboxPromptShownFor?: string[] // subtask IDs already prompted
  /** When work was last stopped; used to decide whether a pause counted as a break. */
  lastStoppedAt?: number
  /** Open segment ID the stale-session question was already answered for. */
  staleResolvedFor?: string
}

export const IDLE_SESSION: Session = { state: 'idle' }

export interface Challenge {
  subtaskId: string
  startedAt: number
  targetMinutes: number
  workMsAtStart: number // subtask work time when the challenge began
}

export interface RevealState {
  work?: boolean
  timers?: boolean
}

export type PersonalBests = Partial<Record<Phase, number>>

/** Values stored in the appState table, by key. */
export interface AppStateMap {
  session: Session
  challenge: Challenge
  reveal: RevealState
  personalBests: PersonalBests
  storagePersisted: boolean
}

export type AppStateKey = keyof AppStateMap

export interface KeyValueRow {
  key: string
  value: unknown
}
