import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
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

/** Sets a settings number field and waits for it to be saved. */
async function setNumber(page: Page, label: string, value: string) {
  const field = page.getByLabel(label)
  await field.fill(value)
  await field.press('Enter')
  await expect.poll(async () => (await readStore<{ key: string; value: unknown }>(page, 'settings')).some((r) => r.value === Number(value))).toBe(true)
}

/** Replaces the AI prompt and waits for it to be saved. */
async function setPrompt(page: Page, text: string) {
  const editor = page.getByLabel('AI import prompt template')
  await editor.fill(text)
  await editor.blur()
  await expect
    .poll(async () => (await readStore<{ key: string; value: unknown }>(page, 'settings')).some((r) => r.key === 'aiPromptTemplate' && r.value === text))
    .toBe(true)
}

test('export backup, then restore it over newer data, settings and prompt included', async ({ page }) => {
  await importExample(page)
  await openApp(page, '#/settings')
  await setNumber(page, 'Break length', '7')
  await setPrompt(page, 'Backed-up prompt\n{{SCHEMA}}')
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export backup' }).click()
  const download = await downloading
  expect(download.suggestedFilename()).toMatch(/^momentum-backup-\d{4}-\d{2}-\d{2}\.json$/)
  const file = await download.path()
  const backup = JSON.parse(await readFile(file, 'utf8'))
  expect(backup.format).toBe('momentum-backup')
  expect(backup.tables.projects).toHaveLength(1)
  // Every setting is in the file, defaults too, with the prompt.
  expect(backup.tables.settings).toContainEqual({ key: 'breakMinutes', value: 7 })
  expect(backup.tables.settings).toContainEqual({ key: 'snoozeMinutes', value: 10 })
  expect(backup.tables.settings).toContainEqual({ key: 'aiPromptTemplate', value: 'Backed-up prompt\n{{SCHEMA}}' })
  await expect(page.getByText(/Last backup/)).toBeVisible()

  // Settings changed after the backup, which the restore should put back.
  await setNumber(page, 'Break length', '12')
  await setPrompt(page, 'A newer prompt')

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
  await expect(page.getByLabel('Break length')).toHaveValue('7')
  await expect(page.getByLabel('AI import prompt template')).toHaveValue('Backed-up prompt\n{{SCHEMA}}')
})
