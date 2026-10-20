import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { focusOnExample, importExample, openApp, readStore } from './helpers'

test('a parked thought can be expanded and added to its project as a step', async ({ page }) => {
  await focusOnExample(page)
  await page.keyboard.press('p')
  await page.keyboard.type('Check logging config')
  // Link it to the project (thoughts start unlinked).
  await page.keyboard.press('Tab')
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

test.describe('P parks a thought from any page', () => {
  type Parked = { text: string; projectId?: string }

  test('on the overview, unlinked; on a project page, Tab links it to that project', async ({ page }) => {
    await importExample(page)
    const [project] = await readStore<{ id: string }>(page, 'projects')

    await openApp(page)
    // The shortcut is listed at the bottom of the page.
    await expect(page.getByText('Park thought')).toBeVisible()
    await page.keyboard.press('p')
    const capture = page.getByRole('dialog', { name: 'Park a thought' })
    await expect(capture.getByLabel('Thought to park')).toBeFocused()
    await page.keyboard.type('Book the dentist')
    await page.keyboard.press('Enter')
    await expect(capture).toHaveCount(0)

    await page.goto(`/#/project/${project.id}`)
    await expect(page.getByRole('button', { name: 'Start focus' })).toBeVisible()
    await page.keyboard.press('p')
    // Unlinked to start with; Tab links it, and the box says so.
    const chip = capture.getByRole('button', { name: /Fix duplicate emails/ })
    await expect(chip).toHaveAttribute('aria-pressed', 'false')
    await expect(chip).toContainText('Link to Fix duplicate emails')
    await expect(capture.getByText('Tab')).toBeVisible()
    await page.keyboard.type('Ask payments')
    await page.keyboard.press('Tab')
    await expect(chip).toHaveAttribute('aria-pressed', 'true')
    await expect(capture.getByLabel('Thought to park')).toBeFocused()
    await page.keyboard.type(' about retries')
    await page.keyboard.press('Enter')
    await expect(capture).toHaveCount(0)

    await expect.poll(async () => (await readStore<Parked>(page, 'parkingLot')).length).toBe(2)
    const parked = await readStore<Parked>(page, 'parkingLot')
    expect(parked.find((p) => p.text === 'Book the dentist')?.projectId).toBeUndefined()
    expect(parked.find((p) => p.text === 'Ask payments about retries')?.projectId).toBe(project.id)
  })

  test('elsewhere during a session, Tab links it to the project being worked on', async ({ page }) => {
    await focusOnExample(page)
    await page.keyboard.press('Space')
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Keep timer running' }).click()
    await openApp(page, '#/settings')
    await page.keyboard.press('p')
    // The box offers the project being worked on.
    const capture = page.getByRole('dialog', { name: 'Park a thought' })
    const chip = capture.getByRole('button', { name: /Fix duplicate emails/ })
    await expect(chip).toHaveAttribute('aria-pressed', 'false')
    await page.keyboard.press('Tab')
    await expect(chip).toHaveAttribute('aria-pressed', 'true')
    await page.keyboard.type('Check the logging config')
    await page.keyboard.press('Enter')
    await expect.poll(async () => (await readStore<Parked>(page, 'parkingLot')).length).toBe(1)
    const [project] = await readStore<{ id: string }>(page, 'projects')
    expect((await readStore<Parked>(page, 'parkingLot'))[0].projectId).toBe(project.id)
  })

  test('Esc closes the box even when focus has moved away, without the page acting on it', async ({ page }) => {
    await focusOnExample(page)
    await page.keyboard.press('p')
    const capture = page.getByRole('dialog', { name: 'Park a thought' })
    await expect(capture).toBeVisible()
    // Click away from the box onto the page.
    await page.getByRole('heading', { level: 1 }).click()
    await expect(capture.getByLabel('Thought to park')).not.toBeFocused()
    await page.keyboard.press('Escape')
    await expect(capture).toHaveCount(0)
    // Still in focus: Esc didn't open the exit dialog.
    await expect(page.getByLabel(/Note to future self/)).toHaveCount(0)
    await expect(page).toHaveURL(/#\/focus\//)

    // On the overview too, where Esc would otherwise do nothing harmful but should still close it.
    await openApp(page)
    await page.keyboard.press('p')
    await page.getByRole('heading', { name: 'Projects' }).click()
    await page.keyboard.press('Escape')
    await expect(capture).toHaveCount(0)
  })

  test('typing p in a text field types it instead', async ({ page }) => {
    await importExample(page)
    await page.getByLabel('Step title').first().click()
    await page.keyboard.press('End')
    await page.keyboard.type('p')
    await expect(page.getByRole('dialog', { name: 'Park a thought' })).toHaveCount(0)
    await expect(page.getByLabel('Step title').first()).toHaveValue(/p$/)
  })
})

test('Clear all stats empties time and history but keeps projects', async ({ page }) => {
  await focusOnExample(page)
  await page.keyboard.press('Space')
  await page.keyboard.press('Control+Enter')
  await expect(page.getByText('1 of 6', { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Keep timer running' }).click()
  await expect(page.getByRole('link', { name: 'Return to focus' })).toBeVisible()

  await openApp(page, '#/settings')
  await page.getByRole('button', { name: 'Clear all stats' }).click()
  const dialog = page.getByRole('dialog', { name: 'Clear all stats?' })
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused()
  await dialog.getByRole('button', { name: 'Clear stats' }).click()
  await expect(page.getByText('Stats cleared')).toBeVisible()

  expect(await readStore(page, 'events')).toHaveLength(0)
  expect(await readStore(page, 'segments')).toHaveLength(0)
  await expect(page.getByRole('link', { name: 'Return to focus' })).toHaveCount(0)
  const steps = await readStore<{ status: string }>(page, 'subtasks')
  expect(steps.filter((s) => s.status === 'done')).toHaveLength(1)
  await openApp(page)
  await expect(page.locator('[data-card]')).toHaveCount(1)
})

test('a new page starts at the top, however far the last one was scrolled', async ({ page }) => {
  await importExample(page)
  const projectHash = await page.evaluate(() => location.hash)
  await page.setViewportSize({ width: 1280, height: 400 })
  await page.getByRole('link', { name: 'Settings' }).click()
  await expect(page).toHaveURL(/#\/settings/)
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)

  // Keep the page tall throughout, so the scroll can't drop back on its own while the next
  // page loads (as it can here, though not when its data arrives within a frame).
  await page.addStyleTag({ content: 'body { min-height: 5000px }' })
  // As a link would: the router picks up the change without a reload.
  await page.evaluate((hash) => (location.hash = hash), projectHash)
  await expect(page.getByRole('button', { name: 'Start focus' })).toBeVisible()
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
})
