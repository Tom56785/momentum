import { expect, test, type Page } from '@playwright/test'
import { focusOnExample, readStore, workButton } from './helpers'

// These tests control the page clock, so minutes pass instantly and deterministically.
const T0 = new Date('2026-10-15T09:00:00').getTime()
const MINUTE = 60_000

/** Advance the clock in 30s steps so timers, React effects and Dexie queries keep up. */
async function advance(page: Page, ms: number) {
  for (let t = 0; t < ms; t += 30_000) await page.clock.runFor(Math.min(30_000, ms - t))
}

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: T0 })
  await focusOnExample(page)
  // Step 2 has a 30-min timebox: work on it.
  await page.getByRole('button', { name: 'Next step' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Reproduce the duplicate email locally')
  await page.keyboard.press('Space')
  await expect(workButton(page, 'Pause')).toBeVisible()
})

test('break prompt, snooze, timebox prompt, challenge time-up and break', async ({ page }) => {
  // A margin past the 25-minute marks: those thresholds are exact boundaries.
  await advance(page, 25 * MINUTE + 5_000)
  await expect(page.getByText('A short break helps')).toBeVisible()
  await expect(page.getByText('Nearly at your timebox')).toBeVisible()

  await page.getByRole('button', { name: 'Keep going' }).click()
  await expect(page.getByText('A short break helps')).toHaveCount(0)

  await page.getByRole('button', { name: 'Start challenge' }).click()
  await page.keyboard.press('t')
  await expect(page.getByText(/in challenge/)).toBeVisible()

  // Close to time-up, step a second at a time: the neutral message only shows for 4s.
  await advance(page, 5 * MINUTE - 30_000)
  const wrapped = page.getByText('Challenge wrapped up — nice push.')
  await expect
    .poll(
      async () => {
        await page.clock.runFor(1000)
        return wrapped.isVisible()
      },
      { timeout: 30_000, intervals: [100] },
    )
    .toBe(true)
  await expect(page.getByText('Timebox reached')).toBeVisible()

  // The snooze ends 10 minutes after Keep going; give it a margin.
  await advance(page, 5 * MINUTE + 30_000)
  await expect(page.getByText('A short break helps')).toBeVisible()
  await page.getByRole('button', { name: 'Take a break' }).click()
  await expect(page.getByRole('heading', { name: 'Break' })).toBeVisible()
  await expect(page.getByText('Ready when you are')).toHaveCount(0)
  await advance(page, 5 * MINUTE + 5_000)
  await expect(page.getByText('Ready when you are')).toBeVisible()
  await page.keyboard.press('b')
  await expect(workButton(page, 'Pause')).toBeVisible()

  const ended = (await readStore<{ type: string; data?: { outcome?: string } }>(page, 'events')).filter(
    (e) => e.type === 'challenge_ended',
  )
  expect(ended.map((e) => e.data?.outcome)).toEqual(['timeUp'])
})

test('a work session left running for hours asks before keeping the time', async ({ page }) => {
  await advance(page, 10 * MINUTE)
  await page.clock.setSystemTime(T0 + 6 * 60 * MINUTE)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Were you still working?' })).toBeVisible()
  await page.getByRole('button', { name: /End it at/ }).click()
  await expect(page.getByRole('heading', { name: 'Were you still working?' })).toHaveCount(0)
  await expect(workButton(page, 'Start')).toBeVisible()

  // The segment ended at the last activity (when work started), not hours later.
  const segments = await readStore<{ kind: string; startedAt: number; endedAt?: number }>(page, 'segments')
  const work = segments.filter((s) => s.kind === 'work')
  expect(work).toHaveLength(1)
  expect(work[0].endedAt! - work[0].startedAt).toBeLessThan(MINUTE)
})
