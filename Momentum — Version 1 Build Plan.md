# Momentum — Version 1 Build Plan

Oct 15, 2026 · @Someone

## Overview

Momentum is a browser-only productivity app for a developer with ADHD. It turns work tickets into projects with subtasks, then gives a distraction-free focus screen with hidden timers, gentle challenges and break prompts. Everything is stored locally in IndexedDB; there is no backend.

The goal of version 1 is to make starting and continuing boring tasks easier, by always showing the next step and making progress visible, while logging enough data to build reports later.

### UX principles (apply to every feature)

- **Few clicks.** Every common action is one click or one keyboard shortcut. No confirmation dialogs except where data would be lost.
- **No sense of failure.** Never use red, "failed", "overdue" or "late" wording. Going over a timebox or challenge is neutral; finishing early is celebrated.
- **Numbers hidden by default.** Work time, break time and timebox time left are hidden until the user chooses to reveal them.
- **Calm by default, rewarding on progress.** Quiet, minimal UI, with small celebratory animations on completing a subtask or project.
- **Make wins feel good.** Completion, progress and challenge animations should be smooth and satisfying; motion is part of the reward.
- **Dark and light themes,** following the system setting.
- **Fully keyboard-operable,** with visible focus states.

## Tech stack and setup

Build a static single-page app with React 19, the React Compiler, Vite and TypeScript, installed as a PWA, with all data in IndexedDB through Dexie. Check current package docs for exact setup steps rather than relying on memory.

| Concern | Choice | Notes |
| --- | --- | --- |
| Framework | React 19 + TypeScript (strict) | Function components and hooks only |
| Compiler | React Compiler (`babel-plugin-react-compiler` via `@vitejs/plugin-react`) | Avoid manual `useMemo`/`useCallback` unless profiling shows a need |
| Build | Vite | Static output, deployable to Cloudflare Pages or similar |
| PWA | `vite-plugin-pwa` | Installable, works offline, auto-update with a gentle "update ready" toast |
| Storage | Dexie + `dexie-react-hooks` (`useLiveQuery`) | UI reacts to database changes; keeps multiple tabs in sync |
| Validation | Zod | Validates JSON imports and backups |
| Routing | React Router (or a small hash router) | Routes: `/` overview, `/project/:id`, `/focus/:projectId`, `/settings`, `/parking-lot` |
| Styling | CSS Modules + CSS custom properties | No UI library; tokens for colour, spacing and motion |
| Celebration | `canvas-confetti` (small) or CSS-only | Used on subtask and project completion |
| Testing | Vitest + Testing Library + `fake-indexeddb` | Focus tests on timer and session logic |

### Storage safety

- Call `navigator.storage.persist()` on first run and show the result in Settings.
- Settings has **Export backup** (all tables to one JSON file) and **Restore backup** (validated with Zod, replaces all data after one confirmation).
- Show a subtle reminder in Settings if no backup has been made in 14 days.

### Suggested folder structure

```
src/
  db/            Dexie schema, types, migrations
  domain/        pure logic: timers, sessions, break scheduling, stats
  features/
    projects/    overview, project detail, subtask editing
    import/      JSON schema, Zod parser, import dialog
    focus/       focus screen, break mode, challenge mode, notes
    parking-lot/
    settings/
  components/    shared UI (buttons, dialogs, progress bar, global timer bar)
  hooks/
  styles/
```

Keep timer and session rules in `domain/` as pure functions that take timestamps, so they can be unit tested without React or a browser.

## Data model

Use seven Dexie tables. IDs are UUID strings (`crypto.randomUUID()`), timestamps are epoch milliseconds, and durations are always derived from timestamps, never from counting ticks.

```ts
// Dexie schema, version 1
db.version(1).stores({
  projects:   'id, status, updatedAt, externalKey',
  subtasks:   'id, projectId, [projectId+order], status',
  segments:   'id, kind, projectId, subtaskId, startedAt, endedAt',
  events:     '++seq, ts, type, projectId, subtaskId',
  parkingLot: 'id, createdAt, done',
  settings:   'key',
  appState:   'key'
});

interface Project {
  id: string;
  title: string;
  externalKey?: string;      // e.g. Jira key "ABC-123"
  url?: string;
  summary?: string;          // high-level problem
  problem?: string;
  cause?: string;            // technical reason
  solution?: string;
  targetDate?: string;       // ISO date
  status: 'active' | 'done' | 'archived';
  breadcrumb?: { text: string; updatedAt: number };
  createdAt: number; updatedAt: number; completedAt?: number;
}

interface Subtask {
  id: string;
  projectId: string;
  order: number;             // position in the chain
  title: string;
  description?: string;
  phase?: Phase;             // see import schema
  timeboxMinutes?: number;
  notes: string;             // free text, autosaved
  status: 'todo' | 'done';
  createdAt: number; completedAt?: number;
}

// One row per continuous stretch of work or break.
interface Segment {
  id: string;
  kind: 'work' | 'break';
  projectId?: string;        // work only
  subtaskId?: string;        // work only
  startedAt: number;
  endedAt?: number;          // undefined = currently running
}

// Append-only log for later analysis (see Stats section).
interface AppEvent {
  seq?: number;
  ts: number;
  type: EventType;
  projectId?: string;
  subtaskId?: string;
  data?: Record<string, unknown>;
}

interface ParkingLotItem {
  id: string;
  text: string;              // the one-line capture
  details?: string;          // added later on the parking lot page
  projectId?: string;        // undefined = not related to a project
  createdAt: number;
  updatedAt: number;
  done: boolean;
  convertedTo?: { kind: 'subtask' | 'project'; id: string };
}

interface Settings {
  breakPromptsEnabled: boolean;   // default true
  workIntervalMinutes: number;    // default 25
  breakMinutes: number;           // default 5
  snoozeMinutes: number;          // default 10 ("keep going")
  timeboxPromptMinutesLeft: number; // default 5
  showWorkTimeByDefault: boolean; // default false
  showShortcutHints: boolean;     // default true
  soundEnabled: boolean;          // default false
  systemNotifications: boolean;   // default false, asks permission when enabled
  lastBackupAt?: number;
}

// appState key 'session' holds the single live session (see Timer section).
// appState key 'challenge' holds an active challenge, if any.
```

- At most **one** segment may have no `endedAt` at any time. Enforce this in a single domain function that closes any open segment before opening a new one, inside a Dexie transaction.
- Total time for a subtask, project or day is the sum of its segments, with an open segment counted up to `Date.now()`.
- Completing a subtask while work is running closes the current segment and opens a new one on the next subtask, so time is attributed correctly.

## JSON import schema and AI prompt

Import accepts one JSON document, version 1, containing one or more projects. Ship the schema as a JSON Schema file in the repo and mirror it with Zod, and add a **Copy AI prompt** button in the import dialog that copies the prompt below with the schema embedded.

### Schema (JSON Schema draft 2020-12)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "momentum-import-v1",
  "type": "object",
  "required": ["schemaVersion", "projects"],
  "additionalProperties": false,
  "properties": {
    "schemaVersion": { "const": 1 },
    "projects": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["title", "subtasks"],
        "additionalProperties": false,
        "properties": {
          "title":       { "type": "string", "minLength": 1, "maxLength": 200 },
          "externalKey": { "type": "string", "description": "Ticket key, e.g. ABC-123" },
          "url":         { "type": "string", "format": "uri" },
          "summary":     { "type": "string", "description": "High-level problem in 1-2 sentences" },
          "problem":     { "type": "string", "description": "What is wrong, from the user's perspective" },
          "cause":       { "type": "string", "description": "Why it is happening, technically" },
          "solution":    { "type": "string", "description": "Proposed fix" },
          "targetDate":  { "type": "string", "format": "date" },
          "subtasks": {
            "type": "array",
            "minItems": 1,
            "items": {
              "type": "object",
              "required": ["title"],
              "additionalProperties": false,
              "properties": {
                "title":          { "type": "string", "minLength": 1, "maxLength": 200, "description": "Starts with a verb, small and concrete" },
                "description":    { "type": "string" },
                "phase":          { "enum": ["understand", "investigate", "implement", "test", "review", "deploy", "other"] },
                "timeboxMinutes": { "type": "integer", "minimum": 1, "maximum": 480 }
              }
            }
          }
        }
      }
    }
  }
}
```

### Example

```json
{
  "schemaVersion": 1,
  "projects": [{
    "title": "Fix duplicate emails on order confirmation",
    "externalKey": "SHOP-482",
    "summary": "Some customers receive two confirmation emails per order.",
    "cause": "The payment webhook is retried and the handler is not idempotent.",
    "solution": "Store processed webhook IDs and skip duplicates.",
    "targetDate": "2026-10-22",
    "subtasks": [
      { "title": "Read the ticket and AI summary", "phase": "understand", "timeboxMinutes": 5 },
      { "title": "Reproduce the duplicate email locally", "phase": "investigate", "timeboxMinutes": 30 },
      { "title": "Add idempotency check to webhook handler", "phase": "implement", "timeboxMinutes": 45 },
      { "title": "Write tests for retried webhooks", "phase": "test", "timeboxMinutes": 30 },
      { "title": "Open PR and request review", "phase": "review", "timeboxMinutes": 15 },
      { "title": "Deploy and confirm in monitoring", "phase": "deploy" }
    ]
  }]
}
```

### AI prompt (copied by the button)

```text
Summarise the ticket below into JSON that matches this schema exactly. Output only the JSON.

Rules:
- schemaVersion is 1.
- Fill summary, problem, cause and solution in plain language, 1-3 sentences each.
- Break the work into 5-12 subtasks in the order they should be done.
- Each subtask title starts with a verb and is small enough to start in under 2 minutes.
- The first subtask is always a tiny, easy step (e.g. "Read the ticket and summary").
- Cover: understanding, investigation, implementation, testing, PR/review and deployment.
- Suggest a realistic timeboxMinutes for each subtask.
- Leave out any field you are unsure of rather than guessing.

Schema:
{{SCHEMA}}

Ticket:
{{PASTE TICKET HERE}}
```

### Import behaviour

1. Open the import dialog from the overview (button or `I` shortcut). Paste JSON, or drop a `.json` file.
2. Validate instantly. Show friendly errors with the path (e.g. "projects\[0\].subtasks\[2\].title is empty"), never a stack trace. Tolerate a wrapping \`\`\`json code fence.
3. Show a preview: project title, number of subtasks, total timebox.
4. One **Import** click creates everything. If a project with the same `externalKey` exists, offer **Replace subtasks** or **Import as new**.
5. After import, land on the new project with a **Start focus** button highlighted.

Projects and subtasks can also be created and edited by hand: inline add, rename, delete and drag (or keyboard) reordering of subtasks.

## Features and acceptance criteria

Version 1 has eight features. Each has a short description and acceptance criteria to tick off as they are built.

### 1. Overview and project screens

The overview lists active projects as cards, each with title, ticket key, a progress bar (subtasks done of total) and the next subtask. The project screen shows the summary fields, the subtask chain and a large **Start focus** button.

- [ ] Overview shows active projects; done and archived projects are collapsed below.
- [ ] Each card has a one-click **Focus** button that opens the focus screen on the next incomplete subtask.
- [ ] Project screen allows inline editing of all fields, adding subtasks with Enter, and reordering.
- [ ] Progress bars never show percentages below 0 or above 100, and animate smoothly on change.
- [ ] Completed projects get a small celebration and move to the done section.

### 2. Global timer bar

A slim bar fixed to the top of every non-focus screen shows the active project and subtask, a start/stop work button, and a **Return to focus** link. It is the "outside focus" control for the work timer.

- [ ] Visible on all screens except the focus screen, only when a project has been worked on in this session.
- [ ] Start/stop works with one click and stays in sync with the focus screen.
- [ ] Elapsed time is hidden unless the user reveals it (an eye icon), and the choice is remembered.
- [ ] The browser tab title shows a small indicator (e.g. a dot) while work is running.

### 3. Focus screen

A full-height, minimal screen showing only: project title (small), current subtask (large), project progress bar, the work start/stop button, a **Complete** button, a **Break** button, and a notes area at the bottom. Everything else is hidden behind small icons.

- [ ] Entering focus does not start the timer automatically; the start button is the most prominent control until pressed.
- [ ] On re-entry, the project breadcrumb (if any) shows above the subtask, dismissible with one click or by starting work.
- [ ] **Complete** marks the subtask done, plays a short celebration, and moves to the next subtask in order without leaving the screen. Work time continues on the next subtask.
- [ ] When the last subtask is completed, show a project-complete celebration and a button back to the overview.
- [ ] A small "previous/next" control allows switching subtask without completing (for when the user needs to jump).
- [ ] Notes for the current subtask autosave (debounced \~500ms), with no save button.
- [ ] A fullscreen toggle uses the Fullscreen API.
- [ ] Elapsed time on the subtask is hidden by default; an eye icon reveals it.
- [ ] **Exit** opens the exit dialog (see Breadcrumbs).

### 4. Breaks and break prompts

Breaks can be started at any time with one click. After a configurable stretch of continuous work (default 25 minutes), a gentle prompt suggests a break of a configurable length (default 5 minutes).

- [ ] Break mode replaces the task, notes and progress with a calm full-screen state: a soft colour, the word "Break" and optional suggestions (drink water, stand up, look away from the screen).
- [ ] Break length is hidden by default. When the suggested break length has passed, show a soft "Ready when you are" message, never an alarm.
- [ ] **Resume work** returns to the same subtask and restarts the work timer in one click.
- [ ] Break prompts appear as an unobtrusive banner on the focus screen with **Take a break** and **Keep going** (snoozes for the configured minutes).
- [ ] If the tab is hidden and system notifications are enabled, also send a browser notification.
- [ ] Continuous work resets after any break, and after any work pause longer than the break length.
- [ ] Break prompts can be turned off and the intervals changed in Settings.

### 5. Timeboxes

Any subtask can have an optional timebox in minutes, from import or set by hand (presets 5, 15, 25, 45 and custom).

- [ ] Time left is hidden by default; a small hourglass icon reveals it on hover, long-press or focus.
- [ ] Timebox time counts only while work is running on that subtask, across sessions.
- [ ] When the configured minutes are left (default 5), show a one-time gentle prompt: "Nearly at your timebox — want to turn on challenge mode?" with **Start challenge** and **No thanks**.
- [ ] When a timebox runs out, nothing visible happens unless time left is revealed, in which case it reads "Timebox reached" in a neutral colour. No red, no countdown below zero.

### 6. Challenge mode

A challenge is a self-set target to finish the current subtask within a time limit (presets 10, 15, 25 minutes, or "beat my timebox").

- [ ] Starting a challenge takes at most two clicks from the focus screen.
- [ ] While active, show a subtle animated effect, such as a slowly moving gradient border or a soft glow around the subtask card. It should be noticeable but not distracting.
- [ ] Time left on the challenge is hidden by default, revealable like the timebox.
- [ ] Finishing within the time shows an extra celebration and records a personal best for that phase if it is the fastest.
- [ ] When time runs out, the effect fades out quietly and a neutral message appears, such as "Challenge wrapped up — nice push." Work continues as normal.
- [ ] The user can cancel a challenge at any time with no message at all.

### 7. Breadcrumbs

Each project has a single breadcrumb: a short note to future self about what to do next.

- [ ] Exiting focus opens one small dialog containing: a breadcrumb text box (pre-filled with the existing breadcrumb and focused), and, if work is running, two buttons: **Stop timer and exit** and **Keep timer running**.
- [ ] Enter submits with the default (stop timer); the breadcrumb can be left blank.
- [ ] Escape on the dialog cancels exit and returns to focus.
- [ ] The breadcrumb also shows on the project card in the overview.

### 8. Distraction parking lot

A quick-capture box for stray thoughts and tasks, opened from the focus screen without leaving it. Items may or may not relate to the current project. Capture stays to a single line; detail is added later on the parking lot page.

- [ ] Opens with one click or the `P` key as a small floating input; Enter saves and closes, Shift+Enter saves and stays open.
- [ ] Below the input, a small toggle chip shows the current project name and is on by default. One click (or Tab then Space) switches it to "Not related", so the item is saved without a project.
- [ ] Saving shows a tiny confirmation ("Parked") and returns focus to where it was.
- [ ] The parking lot page lists open items newest first, grouped into "Unlinked" and one group per project. A badge on the overview shows the count of open items.
- [ ] Clicking an item expands it in place to add detail: a multi-line notes field (autosaved) and a project picker to link, change or remove the project.
- [ ] Each expanded item has quick actions: **Add as subtask** (to its linked project, appended at the end of the chain), **Make a project** (creates a new project with the item as its title and notes as its summary), **Done** and **Delete**.
- [ ] Converted items are marked done and keep a link to what they became.

### Keyboard shortcuts

Shortcuts are ignored while typing in a text field, except Escape.

| Key | Where | Action |
| --- | --- | --- |
| Space | Focus | Start or stop work |
| Ctrl/Cmd + Enter | Focus | Complete current subtask |
| B | Focus | Start or end break |
| P | Focus | Open parking lot input |
| C | Focus | Start challenge |
| T | Focus | Reveal or hide time |
| N | Focus | Focus the notes area |
| F | Focus | Toggle fullscreen |
| F | Overview, project screen | Start focus on the selected project |
| I | Overview | Import |
| S | Parking lot page | Add selected item as a subtask |
| D | Parking lot page | Mark selected item done |
| Esc | Anywhere | Exit focus (opens exit dialog) or close a dialog |
| ? | Anywhere | Show all shortcuts |

### Shortcut hints

Each screen shows only its relevant shortcuts as small, low-contrast hints along its bottom edge, so they are discoverable without adding clutter.

- [ ] Hints sit in a single thin row at the bottom edge (bottom-right on the focus screen), in a small muted font with key caps like `Space` Start.
- [ ] Hints are faint at rest and brighten when the pointer nears the edge or a modifier key is held.
- [ ] The set changes with the screen and state, never showing a shortcut that would do nothing right now. Show at most 5 at once; `?` opens the full list.
- [ ] While typing in a field, hints switch to that field's keys (e.g. Enter Save, Esc Cancel).
- [ ] Hints can be turned off in Settings.

| Screen and state | Hints shown |
| --- | --- |
| Overview | Enter Open project · F Focus on selected · I Import · ? All shortcuts |
| Project screen | F Start focus · Enter Add subtask · ? All shortcuts |
| Focus, not working | Space Start · B Break · P Park thought · Esc Exit |
| Focus, working | Space Pause · Ctrl/Cmd+Enter Complete · B Break · P Park thought · C Challenge |
| Focus, challenge active | Space Pause · Ctrl/Cmd+Enter Complete · T Show time · Esc Exit |
| Break mode | B Resume work · Esc Exit |
| Parking lot input open | Enter Save · Shift+Enter Save and add another · Esc Cancel |
| Parking lot page | Enter Expand item · S Add as subtask · D Done · ? All shortcuts |
| Exit dialog | Enter Stop timer and exit · Esc Back to focus |

Keys are context-specific: the same key can do different things on different screens (for example `F`), and hints always reflect the current screen.

### Settings screen

- [ ] Break prompts on/off, work interval, break length, snooze length.
- [ ] Timebox prompt threshold (minutes left).
- [ ] Show work time by default; shortcut hints on/off; sound on/off; system notifications on/off.
- [ ] Storage persistence status; export backup; restore backup; date of last backup.

## Timer and session logic

There is one live session for the whole app, stored in `appState` under `session`, so the timer survives page reloads, closing the tab and switching between screens. The UI only displays values computed from stored timestamps.

```ts
interface Session {
  state: 'idle' | 'working' | 'paused' | 'break';
  projectId?: string;
  subtaskId?: string;
  openSegmentId?: string;        // the segment with no endedAt
  continuousWorkSince?: number;  // start of current unbroken work stretch
  breakPromptSnoozedUntil?: number;
  breakPromptShownAt?: number;
  timeboxPromptShownFor?: string[]; // subtask IDs already prompted
}

interface Challenge {
  subtaskId: string;
  startedAt: number;
  targetMinutes: number;
  workMsAtStart: number;   // subtask work time when the challenge began
}
```

### State transitions

| From | Action | To | Side effects |
| --- | --- | --- | --- |
| idle / paused | Start work | working | Open a work segment; set `continuousWorkSince` if not set |
| working | Stop work | paused | Close the work segment |
| working | Complete subtask | working | Close segment, mark subtask done, open a segment on the next subtask (or go to paused if none left) |
| working / paused | Switch subtask | same state | If working, close and reopen the segment on the new subtask |
| working / paused | Start break | break | Close any work segment, open a break segment, clear `continuousWorkSince` |
| break | Resume work | working | Close the break segment, open a work segment, set `continuousWorkSince` = now |
| any | Exit focus, stop timer | paused | Close open segment; save breadcrumb |
| any | Exit focus, keep running | unchanged | Save breadcrumb only |

### Rules

- **One ticker.** A single `useNow()` hook updates once per second (and immediately on `visibilitychange`) to re-render time-dependent UI. Nothing is ever added up per tick.
- **Break prompt check:** show the prompt when state is `working`, prompts are enabled, `now - continuousWorkSince >= workIntervalMinutes`, and `now >= breakPromptSnoozedUntil`. **Keep going** sets the snooze to now + `snoozeMinutes`.
- **Pauses reset continuity.** If the user pauses for at least `breakMinutes`, clear `continuousWorkSince` on the next start, since that pause counted as a break.
- **Timebox time left** = `timeboxMinutes` minus the subtask's total work time. Fire the timebox prompt once per subtask when it crosses `timeboxPromptMinutesLeft`.
- **Challenge time left** = `targetMinutes` minus (subtask work time now minus `workMsAtStart`). Paused time does not count against a challenge.
- **Stale sessions.** On app load, if a work segment has been open for more than 4 hours, ask once: "Were you still working? Keep the time, or end it at when you last stopped?" (using the last event timestamp). Never discard time silently.
- **Multiple tabs.** Dexie live queries keep tabs in sync; all writes that change the session go through one domain function in a transaction, so two tabs cannot open two segments.

## Stats and event logging

Version 1 records everything needed for future reports but shows only a small summary. Durations come from the `segments` table; behaviour comes from the append-only `events` table. Never update or delete events, except through a full data reset.

### Event types

| Event type | When | `data` fields |
| --- | --- | --- |
| `project_created` | Manual creation | `{ source: 'manual' }` |
| `project_imported` | JSON import | `{ subtaskCount, totalTimeboxMinutes }` |
| `project_completed` | Last subtask done | `{ totalWorkMs }` |
| `subtask_completed` | Complete pressed | `{ workMs, timeboxMinutes?, phase? }` |
| `subtask_switched` | Previous/next used | `{ fromSubtaskId }` |
| `work_started` / `work_stopped` | Timer toggled | `{ via: 'focus' \| 'globalBar' \| 'shortcut' \| 'exitDialog' }` |
| `break_started` / `break_ended` | Break toggled | `{ via: 'button' \| 'prompt', breakMs? }` |
| `break_prompt_shown` | Prompt appears | `{ continuousWorkMs }` |
| `break_prompt_snoozed` | Keep going pressed | `{ continuousWorkMs }` |
| `timebox_prompt_shown` | Near end of timebox | `{ minutesLeft }` |
| `challenge_started` | Challenge on | `{ targetMinutes, source: 'manual' \| 'timeboxPrompt' }` |
| `challenge_ended` | Challenge over | `{ outcome: 'beat' \| 'timeUp' \| 'cancelled', elapsedMs }` |
| `focus_entered` / `focus_exited` | Focus screen | `{ timerKeptRunning? }` |
| `breadcrumb_saved` | Exit dialog | `{ length }` |
| `breadcrumb_shown` | Re-entering focus | none |
| `time_revealed` | Eye or hourglass used | `{ what: 'work' \| 'timebox' \| 'challenge' }` |
| `parking_lot_added` | Item parked | `{ length }` |
| `stale_session_resolved` | Load-time prompt answered | `{ kept: boolean, openMs }` |

Store lengths and IDs rather than the text itself in events; the text lives in its own table.

### What version 1 shows

- On the overview, a small **Today** strip: subtasks completed, projects completed and focus time (focus time hidden behind the same reveal toggle).
- On a completed project: total work time and number of subtasks, framed as an achievement.
- Nothing else yet. Weekly reports, AI summaries and charts come in a later version and will read from these tables.

### Export for later reporting

The backup export includes all tables, so it doubles as the raw data for future AI weekly reports. Add a domain function `summariseWeek(start, end)` with unit tests, returning totals by day, by phase and by hour of day, break counts, snooze counts and challenge outcomes. Version 1 does not need a UI for it.

## Build order, testing and scope

Build in six milestones, each leaving a usable app, and stop for a review after each one.

1. **Foundation.** Vite + React 19 + React Compiler + TypeScript, PWA plugin, Dexie schema, theme tokens, routing, empty screens.
2. **Projects and import.** Overview, project screen, manual subtasks, JSON schema, Zod validation, import dialog with preview and **Copy AI prompt**.
3. **Focus and timer.** Session domain logic with tests, focus screen, start/stop, complete-and-advance, notes, global timer bar, exit dialog with breadcrumbs.
4. **Breaks.** Break mode screen, break prompts with snooze, settings for intervals, optional system notifications.
5. **Timeboxes and challenges.** Hidden time reveals, timebox prompt, challenge mode with animation, celebrations.
6. **Parking lot, stats and polish.** Parking lot, event logging coverage check, Today strip, backup export and restore, keyboard shortcut help, stale-session prompt.

### Testing

- Unit-test all `domain/` functions with fixed timestamps: segment open/close, completing mid-session, break prompt timing and snooze, timebox and challenge time left, pause-counts-as-break, stale sessions.
- Integration-test import (valid, invalid, code-fenced, duplicate `externalKey`) and backup round-trip with `fake-indexeddb`.
- Manually verify: reload mid-session keeps time; two tabs stay in sync; app installs and works offline; every main action works by keyboard.
- Check wording: search the UI strings for "fail", "overdue", "late" and red colour tokens before each milestone is signed off.

### Out of scope for version 1

- Any backend, accounts or sync between devices.
- Calling AI from the app (imports and reports use copy-paste with the work Claude account).
- Weekly report UI, charts and AI summaries.
- Stuck/boost button, energy tags, surprise rewards, theme rotation, idle detection and water tracking.
- Jira API integration.

### Definition of done

- [ ] All acceptance criteria above are ticked.
- [ ] `npm run build` produces a static site that installs as a PWA and works offline.
- [ ] Domain tests pass, and there are no TypeScript errors with strict mode on.
- [ ] A README explains how to run, build, deploy to static hosting, and use the import prompt.
