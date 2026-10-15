import { expect, test } from '@playwright/test'
import { EXAMPLE_TITLE, focusOnExample, openApp, openSegmentCount, workButton } from './helpers'

test('entering focus does not start the timer; Space does', async ({ page }) => {
  await focusOnExample(page)
  await expect(workButton(page, 'Start')).toBeVisible()
  expect(await openSegmentCount(page)).toBe(0)
  await page.keyboard.press('Space')
  await expect(workButton(page, 'Pause')).toBeVisible()
  await expect(page).toHaveTitle(/^● /)
  expect(await openSegmentCount(page)).toBe(1)
})

test('completing a step celebrates on the card before the next step slides in', async ({ page }) => {
  await focusOnExample(page)
  const heading = page.getByRole('heading', { level: 1 })
  await page.keyboard.press('Space')
  await expect(workButton(page, 'Pause')).toBeVisible()
  await page.waitForTimeout(1200) // some work, inside the 5-min timebox
  await page.keyboard.press('Control+Enter')
  // The finished step stays, with the early-finish message…
  await expect(heading).toHaveText('Read the ticket and AI summary')
  await expect(page.getByText(/to spare|just inside your timebox/)).toBeVisible()
  // …a second press during the moment is ignored…
  await page.keyboard.press('Control+Enter')
  // …then the next step slides in, and only one step was completed.
  await expect(heading).toHaveText('Reproduce the duplicate email locally')
  await expect(page.getByText('1 of 6', { exact: true })).toBeVisible()
  await expect(workButton(page, 'Pause')).toBeVisible()
})

test('Space picks a challenge option instead of pausing', async ({ page }) => {
  await focusOnExample(page)
  await page.keyboard.press('Space')
  await expect(workButton(page, 'Pause')).toBeVisible()
  await page.keyboard.press('c')
  await expect(page.getByRole('menuitem', { name: '10 minutes' })).toBeFocused()
  await page.keyboard.press('Space')
  await expect(page.getByRole('menu')).toHaveCount(0)
  await expect(workButton(page, 'Pause')).toBeVisible()
  await expect(page.locator('section[aria-live]').first()).toHaveClass(/challenge/)
})

test('parking a thought keeps you in focus and shows up in the parking lot', async ({ page }) => {
  await focusOnExample(page)
  await page.keyboard.press('p')
  await page.keyboard.type('Check logging config')
  await page.keyboard.press('Enter')
  await expect(page.getByText('Parked')).toBeVisible()
  await expect(page).toHaveURL(/#\/focus\//)
  await openApp(page, '#/parking-lot')
  await expect(page.getByRole('button', { name: /Check logging config/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Parking lot/ })).toContainText('1')
})

test('break mode replaces the task and B resumes on the same step', async ({ page }) => {
  await focusOnExample(page)
  await page.keyboard.press('Space')
  await expect(workButton(page, 'Pause')).toBeVisible()
  await page.keyboard.press('b')
  await expect(page.getByRole('heading', { name: 'Break' })).toBeVisible()
  await page.keyboard.press('b')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Read the ticket and AI summary')
  await expect(workButton(page, 'Pause')).toBeVisible()
})

test('exit dialog saves the breadcrumb and can keep the timer running', async ({ page }) => {
  await focusOnExample(page)
  await page.keyboard.press('Space')
  await expect(workButton(page, 'Pause')).toBeVisible()
  await page.keyboard.press('Escape')
  const note = page.getByLabel(/Note to future self/)
  await expect(note).toBeFocused()
  // Typing (including spaces) goes into the note, not to shortcuts or the close button.
  await page.keyboard.type('Look at retry header next')
  await expect(note).toHaveValue('Look at retry header next')
  await page.getByRole('button', { name: 'Keep timer running' }).click()
  await expect(page.getByText('Look at retry header next')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Return to focus' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible()
})

test('the session survives a reload', async ({ page }) => {
  await focusOnExample(page)
  await page.keyboard.press('Space')
  await expect(workButton(page, 'Pause')).toBeVisible()
  await openApp(page)
  await page.reload()
  await expect(page.getByRole('link', { name: 'Return to focus' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible()
  await expect(page).toHaveTitle(/^● /)
})

test('finishing the last step shows project complete on the page, then no timer bar', async ({ page }) => {
  await focusOnExample(page)
  await page.keyboard.press('Space')
  await expect(workButton(page, 'Pause')).toBeVisible()
  const progress = (n: number) => page.getByText(`${n} of 6`, { exact: true })
  for (let done = 1; done <= 5; done++) {
    await page.keyboard.press('Control+Enter')
    await expect(progress(done)).toBeVisible()
    // Wait for the celebration moment to end before completing the next step.
    await expect(page.getByRole('button', { name: 'Complete' })).not.toHaveAttribute('aria-disabled', 'true')
  }
  await page.keyboard.press('Control+Enter')
  await expect(page.getByRole('heading', { name: 'Project complete' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Project complete' }).getByText(EXAMPLE_TITLE)).toBeVisible()
  await expect(page.locator('dialog[open]')).toHaveCount(0)
  await page.getByRole('button', { name: 'Back to overview' }).click()
  await expect(page.getByRole('link', { name: 'Momentum overview' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Return to focus' })).toHaveCount(0)
})
