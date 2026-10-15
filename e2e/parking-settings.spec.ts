import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { focusOnExample, importExample, openApp, readStore } from './helpers'

test('a parked thought can be expanded and added to its project as a step', async ({ page }) => {
  await focusOnExample(page)
  await page.keyboard.press('p')
  await page.keyboard.type('Check logging config')
  await page.keyboard.press('Enter')
  await expect(page.getByText('Parked')).toBeVisible()

  await openApp(page, '#/parking-lot')
  await page.getByRole('button', { name: /Check logging config/ }).click()
  await page.getByLabel('Details').fill('Level is DEBUG in prod')
  await page.getByRole('button', { name: 'Add as subtask' }).click()
  await expect(page.getByText(/^Added to /)).toBeVisible()
  await expect(page.getByText('0 open')).toBeVisible()

  const subtasks = await readStore<{ title: string; order: number }>(page, 'subtasks')
  const last = subtasks.sort((x, y) => x.order - y.order).at(-1)
  expect(last?.title).toBe('Check logging config')
})

test('the shortcut list opens with ?', async ({ page }) => {
  await openApp(page)
  await page.keyboard.press('?')
  await expect(page.getByRole('heading', { name: 'Keyboard shortcuts' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('heading', { name: 'Keyboard shortcuts' })).toHaveCount(0)
})

test('export backup, then restore it over newer data', async ({ page }) => {
  await importExample(page)
  await openApp(page, '#/settings')
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export backup' }).click()
  const download = await downloading
  expect(download.suggestedFilename()).toMatch(/^momentum-backup-\d{4}-\d{2}-\d{2}\.json$/)
  const file = await download.path()
  const backup = JSON.parse(await readFile(file, 'utf8'))
  expect(backup.format).toBe('momentum-backup')
  expect(backup.tables.projects).toHaveLength(1)
  await expect(page.getByText(/Last backup/)).toBeVisible()

  // Newer data that the restore should replace.
  await openApp(page)
  await page.getByRole('button', { name: 'New project' }).click()
  await page.keyboard.type('Made after the backup')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/#\/project\//)
  expect(await readStore(page, 'projects')).toHaveLength(2)

  await openApp(page, '#/settings')
  await page.locator('input[type=file]').setInputFiles(file)
  await page.getByRole('button', { name: 'Replace my data' }).click()
  await expect(page.getByText('Backup restored')).toBeVisible()
  const projects = await readStore<{ title: string }>(page, 'projects')
  expect(projects.map((p) => p.title)).toEqual(['Fix duplicate emails on order confirmation'])
})
