import { expect, test, type Page } from '@playwright/test'
import { focusOnExample, importExample, openApp, pageWidth } from './helpers'

// Runs in the "mobile" project: a 390px-wide touch screen.

async function expectNoSidewaysScroll(page: Page) {
  const width = page.viewportSize()!.width
  await expect.poll(() => pageWidth(page)).toBeLessThanOrEqual(width)
}

test('no screen scrolls sideways', async ({ page }) => {
  await openApp(page)
  await expectNoSidewaysScroll(page)
  await importExample(page)
  await expectNoSidewaysScroll(page)
  await page.getByRole('button', { name: 'Show step details' }).first().tap()
  await expectNoSidewaysScroll(page)
  await page.getByRole('button', { name: 'Start focus' }).tap()
  await expect(page).toHaveURL(/#\/focus\//)
  await expectNoSidewaysScroll(page)
  await openApp(page, '#/settings')
  await expectNoSidewaysScroll(page)
  await openApp(page, '#/parking-lot')
  await expectNoSidewaysScroll(page)
})

test('steps can be reordered by touch, with finger-sized controls', async ({ page }) => {
  await importExample(page)
  await expect(page.locator('[data-grip]').first()).toBeHidden()
  const details = page.getByRole('button', { name: 'Show step details' }).first()
  const box = await details.boundingBox()
  expect(box!.width).toBeGreaterThanOrEqual(40)
  await details.tap()
  const titles = page.getByLabel('Step title')
  const first = await titles.first().inputValue()
  await page.getByRole('button', { name: 'Move step down' }).tap()
  await expect(titles.nth(1)).toHaveValue(first)
})

test('the parking box sits near the top, clear of the keyboard, with even chip padding', async ({ page }) => {
  await focusOnExample(page)
  await page.getByRole('button', { name: 'Park a thought (P)' }).tap()
  const input = page.getByLabel('Thought to park')
  await expect(input).toBeFocused()
  expect((await input.boundingBox())!.y).toBeLessThan(200)

  const padding = await page
    .locator('button[aria-pressed]')
    .filter({ hasText: 'Fix duplicate' })
    .evaluate((chip) => {
      const r = chip.getBoundingClientRect()
      const icon = chip.querySelector('svg')!.getBoundingClientRect()
      const text = chip.querySelector('span')!.getBoundingClientRect()
      return { left: icon.left - r.left, right: r.right - text.right }
    })
  expect(Math.abs(padding.left - padding.right)).toBeLessThanOrEqual(1)
})

test('the step list and step editor fit on a phone', async ({ page }) => {
  await focusOnExample(page)
  await page.getByRole('button', { name: /^step 1 of 6/i }).tap()
  const menu = page.getByRole('menu', { name: 'Steps' })
  await expect(menu).toBeVisible()
  const box = (await menu.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width)
  await expectNoSidewaysScroll(page)
  await menu.getByRole('menuitem', { name: /Write tests/ }).tap()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Write tests for retried webhooks')

  await page.getByRole('button', { name: 'Edit this step (E)' }).tap()
  await expect(page.getByRole('textbox', { name: 'Step title' })).toBeVisible()
  await expectNoSidewaysScroll(page)
})

test('toasts use the screen width, with finger-sized buttons', async ({ page }) => {
  await focusOnExample(page)
  await page.getByRole('button', { name: /^Complete/ }).first().tap()
  const undo = page.getByRole('button', { name: 'Undo' })
  await expect(undo).toBeVisible()
  const toast = page.getByRole('status').locator('> div').filter({ has: undo })
  // Layout sizes, which the toast's entrance animation (a slight scale) doesn't affect.
  const size = (el: HTMLElement) => ({ width: el.offsetWidth, height: el.offsetHeight })
  // A long message spreads across the screen rather than being squeezed into a narrow column.
  expect((await toast.evaluate(size)).width).toBeGreaterThan(page.viewportSize()!.width * 0.75)
  expect((await undo.evaluate(size)).height).toBeGreaterThanOrEqual(40)
  const dismiss = await toast.getByRole('button', { name: 'Dismiss' }).evaluate(size)
  expect(Math.min(dismiss.width, dismiss.height)).toBeGreaterThanOrEqual(40)
})
