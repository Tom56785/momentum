import { expect, test } from '@playwright/test'
import { EXAMPLE_TITLE, focusOnExample, openApp, openSegmentCount, workButton } from './helpers'

test('two tabs stay in sync and never open two work segments', async ({ page: a, context }) => {
  await focusOnExample(a)
  const b = await context.newPage()
  await openApp(b)

  await a.keyboard.press('Space')
  await expect(b.getByRole('button', { name: 'Pause' })).toBeVisible()
  await expect(b).toHaveTitle(/^● /)

  await b.getByRole('button', { name: 'Pause' }).click()
  await expect(workButton(a, 'Start')).toBeVisible()

  // Both tabs act at once. Each may see the other's state as start or stop, so either
  // zero or one segment can be open, never two.
  await Promise.all([a.keyboard.press('Space'), b.getByRole('button', { name: 'Start' }).click()])
  await expect.poll(() => openSegmentCount(a)).toBeLessThanOrEqual(1)
  await a.waitForTimeout(500)
  expect(await openSegmentCount(a)).toBeLessThanOrEqual(1)
})

test('installs a service worker and works offline with its data', async ({ page, context }) => {
  await focusOnExample(page)
  await openApp(page)
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.ready.then(() => true))).toBe(true)
  await page.reload()
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
  expect(await page.evaluate(() => document.querySelector('link[rel=manifest]')?.getAttribute('href'))).toBe(
    '/manifest.webmanifest',
  )

  await context.setOffline(true)
  await page.reload()
  await expect(page.getByText(EXAMPLE_TITLE)).toBeVisible()
  await context.setOffline(false)
})
