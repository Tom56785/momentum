# Momentum

A calm, browser-only focus app for turning work tickets into small steps and keeping momentum. It always shows the next step, hides the clock until you ask for it, suggests breaks, and celebrates progress. Everything is stored locally in your browser (IndexedDB). There is no backend and no account.

Built with React 19, the React Compiler, Vite, TypeScript (strict), Dexie and Zod, and installable as an offline PWA.

## Run it

Requires Node.js 20.19 or newer and [pnpm](https://pnpm.io) (the exact version is pinned in `package.json` under `packageManager`; install it with `npm install -g pnpm@12.8.2`, or run `corepack enable` to use the pinned version automatically).

```sh
pnpm install
pnpm dev           # http://localhost:5173
```

Other scripts:

| Script | What it does |
| --- | --- |
| `pnpm build` | Type-checks and builds the static site into `dist/` (with the service worker and manifest) |
| `pnpm preview` | Serves `dist/` locally, so you can test install and offline |
| `pnpm test` | Runs the unit and integration tests once (Vitest + fake-indexeddb) |
| `pnpm test:watch` | Tests in watch mode |
| `pnpm test:e2e` | Builds the app and runs the end-to-end tests in a real browser (Playwright) |
| `pnpm test:e2e:install` | One-time download of the Chromium build Playwright uses |
| `pnpm typecheck` | TypeScript only |
| `pnpm lint` | oxlint |
| `pnpm generate-icons` | Regenerates the PWA PNG icons from `public/favicon.svg` |

### End-to-end tests

`e2e/` holds Playwright tests that drive the production build (`vite preview` on port 4173, started automatically) in Chromium: import, project editing, the focus flow and celebrations, keyboard behaviour, breaks, challenges and timeboxes (with a controlled clock, so 25 minutes pass instantly), stale sessions, two tabs in sync, offline use, backup export/restore, and a 390px touch layout. Every test starts with an empty database.

Run `pnpm test:e2e:install` once, then `pnpm test:e2e`. Add `--ui` for Playwright's interactive runner, or `--repeat-each=5` to check for flakiness. When a test fails, its trace is kept in `test-results/`; open it with `pnpm exec playwright show-trace <path>`.

## Deploy

`pnpm build` produces a fully static site in `dist/`. The app uses hash URLs (`/#/project/…`), so no rewrite rules are needed. Any static host works.

**Cloudflare Pages:** create a project from this repo with build command `pnpm build` and output directory `dist` (Cloudflare picks up pnpm from the lockfile). Or upload directly:

```sh
pnpm build
pnpm dlx wrangler pages deploy dist
```

**GitHub Pages:** already set up. [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) runs lint and the unit tests, builds, and deploys on every push to `main` (or run it by hand from the Actions tab). It needs **Settings → Pages → Source** set to **GitHub Actions**. The site is served from `https://<user>.github.io/<repo>/`, so the workflow builds with `BASE_PATH=/<repo>/`.

**Netlify, S3 or similar:** upload the contents of `dist/`. Serve over HTTPS (required for the service worker and install prompt). The build assumes the domain root. To host it under a sub-path, build with `BASE_PATH` set to that path with slashes at both ends, for example `BASE_PATH=/momentum/ pnpm build` (the PWA manifest's start URL and scope follow it). In Git Bash on Windows, put `MSYS_NO_PATHCONV=1` in front, or Git Bash turns the path into a Windows one.

When a new version is deployed, open copies of the app show a small "An update is ready" toast with a **Reload** button.

## Importing tickets with AI

Momentum doesn't call any AI itself. You copy a prompt into the assistant you already use, and paste the JSON it gives you back into Momentum.

1. On the overview, press **Import** (or `I`).
2. Click **Copy AI prompt**. This copies instructions plus the JSON Schema ([`schema/momentum-import-v1.schema.json`](schema/momentum-import-v1.schema.json)).
3. In your AI assistant, paste the prompt and replace `{{PASTE TICKET HERE}}` with the ticket text.
4. Paste the assistant's reply into the import box, or drop a `.json` file onto it. A wrapping ```` ```json ```` code fence is fine.
5. Check the preview (title, number of steps, total timebox) and press **Import**. If a project with the same ticket key already exists, choose **Replace subtasks** or **Import as new**.

You land on the new project with **Start focus** highlighted.

The prompt can be edited in **Settings → AI import prompt** (it's stored with your data and included in backups). `{{SCHEMA}}` in it is replaced with the schema. If the browser blocks clipboard access, use **View** in the import dialog to copy it by hand. See [`schema/example-import.json`](schema/example-import.json) for a complete example, or click **Try the example** in the import dialog.

Problems are listed with their path, for example `projects[0].subtasks[2].title is empty`.

## Using it

- **Overview**: active projects with progress, the next step and your last breadcrumb. Click anywhere on a card to open the project, or its **Focus** button to start focus. Arrow keys move between cards; `Enter` opens one, `F` starts focus.
- **Project**: edit every field in place (it autosaves), add steps with `Enter`, drag steps or use `Alt+↑/↓` to reorder (or **Move up/down** in a step's panel on touch screens), and open a step to set its phase or timebox. The ▶ on a step starts focus on that step. **Export JSON** downloads the project in the import format, to re-import or share.
- **Focus**: one step at a time. `Space` starts or pauses work, `Ctrl/Cmd+Enter` completes the step and moves on (with **Undo**, or `Ctrl/Cmd+Z`, for a few seconds), `E` edits the step's title and timebox, `B` takes a break, `P` parks a stray thought, `C` starts a challenge, `T` reveals time, `N` jumps to notes, `F` toggles fullscreen, and `Esc` exits with a note to your future self. The note stays at the top of the focus screen until you clear it with its ✕ (Undo is offered). Click the "Step 2 of 6" label to jump to any step still to do.
- **Parking lot**: everything you parked, grouped by project. Expand an item to add detail, link it to a project, turn it into a step or a project, or mark it done (`S` and `D` work on the selected item).
- **Settings**: break interval, break length and snooze; timebox prompt threshold; display, sound and notifications; the AI import prompt (editable, with Reset to default); storage status, backup export and restore.

Press `?` anywhere to see every shortcut.

### Your data

All data lives in this browser's IndexedDB. On first run Momentum asks the browser to make storage persistent; Settings shows whether it agreed. Use **Export backup** regularly (Settings reminds you after 14 days). The backup is one JSON file containing every table, so it also serves as raw data for future reports. It lists every setting with its value (defaults included) and the AI prompt (the built-in one if you haven't edited it). **Restore backup** validates the file and replaces all data, settings and the prompt after one confirmation. Values that match a built-in default keep following it, so an improved default prompt still reaches you.

## Project layout

```
schema/            Import JSON Schema and example
src/
  db/              Dexie schema, types, persistence actions, the transactional session store
  domain/          Pure logic: session state machine, break/timebox/challenge rules, stats
  features/
    projects/      Overview, project screen, subtask editing, Today strip
    import/        Zod schema, parser with friendly errors, import dialog
    focus/         Focus screen, break mode, challenge menu, exit dialog, notes
    parking-lot/   Quick capture and the parking lot page
    settings/      Settings screen, backup export/restore
  components/      Shared UI: buttons, dialog, progress bar, timer bar, hints, toasts
  hooks/           useNow (the single ticker), live data hooks, shortcuts, autosave
  styles/          Design tokens (light and dark) and base styles
```

### How time is tracked

- Every stretch of work or break is one row in `segments`. Totals are always summed from timestamps, never counted per tick, so time survives reloads, closed tabs and sleep.
- Every change to the live session goes through `dispatch()` in `src/db/session.ts`. It runs the pure `transition()` from `src/domain/session.ts` inside one Dexie transaction, which closes any open segment before opening a new one. There is never more than one open segment, even with several tabs open.
- `events` is an append-only behaviour log (see the build plan for the event list, plus `subtask_reopened` and `project_reopened`). Unticking a step logs a reopen rather than deleting anything, and counts skip any completion a later reopen undid, so a step completed twice counts once. `loadWeekSummary(start, end)` in `src/db/reports.ts` (built on the pure `summariseWeek`) returns totals by day, phase and hour, plus break, snooze and challenge counts, ready for a later reports screen.
- If work has been left running for more than 4 hours, the app asks on load whether to keep the time or end it at your last activity. It never discards time silently.
