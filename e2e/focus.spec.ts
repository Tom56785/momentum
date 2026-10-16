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

test('hovering the hourglass shows the time left beside it, without moving the icons, until the pointer leaves', async ({ page }) => {
  await focusOnExample(page)
  const timeLeft = page.getByText(/min left/)
  const hourglass = page.getByRole('button', { name: /^Timebox:/ })
  const eye = page.getByRole('button', { name: 'Show time on this step' })
  const positions = async () => [(await eye.boundingBox())?.x ?? 0, (await hourglass.boundingBox())?.x ?? 0]
  // Let the card's entrance animation finish before measuring.
  await page.waitForTimeout(800)
  const before = await positions()
  await hourglass.hover()
  await expect(timeLeft).toBeVisible()
  await page.waitForTimeout(500)
  await expect(timeLeft).toBeVisible()
  // The time fades in beside the icon without moving anything.
  const after = await positions()
  after.forEach((x, i) => expect(Math.abs(x - before[i])).toBeLessThan(1))
  await page.mouse.move(5, 5)
  await expect(timeLeft).toHaveCount(0)
})

test('the note left on exit stays on the focus screen until cleared', async ({ page }) => {
  await focusOnExample(page)
  await page.keyboard.press('Escape')
  await page.keyboard.type('Look at retry header next')
  await page.getByRole('button', { name: 'Exit', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Momentum overview' })).toBeVisible()

  await page.locator('[data-card]').getByRole('button', { name: 'Focus' }).click()
  const note = page.getByRole('note', { name: 'Your note from last time' })
  await expect(note).toContainText('Look at retry header next')
  // Starting work keeps it on screen.
  await page.keyboard.press('Space')
  await expect(workButton(page, 'Pause')).toBeVisible()
  await expect(note).toBeVisible()

  await note.getByRole('button', { name: 'Clear note' }).click()
  await expect(note).toHaveCount(0)
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(note).toContainText('Look at retry header next')
  await note.getByRole('button', { name: 'Clear note' }).click()
  await expect(note).toHaveCount(0)
  await page.reload()
  await expect(workButton(page, 'Pause')).toBeVisible()
  await expect(note).toHaveCount(0)
})

test("the resume bar's title opens the project without going back into focus", async ({ page }) => {
  await focusOnExample(page)
  await page.keyboard.press('Space')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Keep timer running' }).click()
  await page.goto('/#/settings')
  const barLink = page.getByRole('link', { name: /Read the ticket and AI summary/ })
  // The ticket key is shown in the bar too.
  await expect(barLink).toContainText('SHOP-482')
  await barLink.click()
  await expect(page).toHaveURL(/#\/project\//)
  await expect(page.getByRole('button', { name: 'Start focus' })).toBeVisible()
  // Still working: the bar's timer is untouched.
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible()
})

test.describe('F while the resume bar is showing', () => {
  test.beforeEach(async ({ page }) => {
    await focusOnExample(page)
    await page.keyboard.press('Space')
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Keep timer running' }).click()
  })

  test('goes back into focus from any page', async ({ page }) => {
    await openApp(page, '#/settings')
    await expect(page.getByText('Resume focus')).toBeVisible()
    await page.keyboard.press('f')
    await expect(page).toHaveURL(/#\/focus\//)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Read the ticket and AI summary')
  })

  test('on the overview, resumes the session; once dismissed, focuses the selected project', async ({ page }) => {
    // A second project, selected on the overview.
    await page.getByRole('button', { name: 'New project' }).click()
    await page.keyboard.type('Second project')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/#\/project\//)
    const second = page.url().split('/project/')[1].split('?')[0]
    await openApp(page)
    await page.locator(`[data-card="${second}"]`).focus()

    await page.keyboard.press('f')
    await expect(page).toHaveURL(/#\/focus\//)
    expect(page.url()).not.toContain(second)

    // Stop the timer and dismiss the bar: F now goes to the selected project.
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Stop timer and exit' }).click()
    await page.getByRole('button', { name: 'Hide timer bar' }).click()
    await expect(page.getByRole('link', { name: 'Return to focus' })).toHaveCount(0)
    await page.locator(`[data-card="${second}"]`).focus()
    await page.keyboard.press('f')
    await expect(page).toHaveURL(new RegExp(`#/focus/${second}`))
  })
})
