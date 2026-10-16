import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { focusOnExample, importExample, openApp, readStore } from './helpers'

type TagRow = { id: string; name: string; color: string }
type StepRow = { title: string; tags?: string[]; order: number }

test('importing creates missing tags, which Settings then lists', async ({ page }) => {
  await openApp(page)
  await page.keyboard.press('i')
  const dialog = page.locator('dialog')
  await dialog.getByText('Try the example').click()
  await expect(dialog.getByRole('note')).toHaveText('Adds 2 new tags: backend, testing')
  await dialog.getByRole('button', { name: 'Import', exact: true }).click()
  await expect(page).toHaveURL(/#\/project\//)

  const tags = await readStore<TagRow>(page, 'tags')
  expect(tags.map((t) => t.name).sort()).toEqual(['backend', 'testing'])
  tags.forEach((t) => expect(t.color).toMatch(/^#[0-9a-f]{6}$/))

  await openApp(page, '#/settings')
  await expect(page.getByLabel('Tag name: backend')).toHaveValue('backend')
  await expect(page.getByText('2 steps')).toBeVisible()
  await expect(page.getByText('1 step', { exact: true })).toBeVisible()
})

test('tags can be added, renamed, recoloured and deleted in Settings', async ({ page }) => {
  await importExample(page)
  await openApp(page, '#/settings')

  await page.getByLabel('New tag').fill('Docs')
  await page.getByLabel('New tag').press('Enter')
  await expect(page.getByLabel('Tag name: Docs')).toBeVisible()
  await expect(page.getByLabel('New tag')).toHaveValue('')

  // A duplicate name (ignoring case) is refused.
  await page.getByLabel('New tag').fill('BACKEND')
  await page.getByLabel('New tag').press('Enter')
  await expect(page.getByText('There\'s already a tag called "BACKEND"')).toBeVisible()
  expect(await readStore(page, 'tags')).toHaveLength(3)

  // Renaming to a clash reverts; a new name saves.
  const docs = page.getByLabel('Tag name: Docs')
  await docs.fill('testing')
  await docs.press('Enter')
  await expect(page.getByLabel('Tag name: Docs')).toHaveValue('Docs')
  await page.getByLabel('Tag name: Docs').fill('docs')
  await page.getByLabel('Tag name: Docs').press('Enter')
  await expect(page.getByLabel('Tag name: docs')).toBeVisible()

  await page.getByLabel('Colour for docs').fill('#112233')
  await expect.poll(async () => (await readStore<TagRow>(page, 'tags')).find((t) => t.name === 'docs')?.color).toBe('#112233')

  // An unused tag goes straight away; a used one asks first and comes off its steps.
  await page.getByRole('button', { name: 'Delete tag docs' }).click()
  await expect(page.getByLabel('Tag name: docs')).toHaveCount(0)
  await page.getByRole('button', { name: 'Delete tag backend' }).click()
  const confirm = page.getByRole('dialog', { name: 'Delete this tag?' })
  await expect(confirm).toContainText('is on 2 steps')
  await confirm.getByRole('button', { name: 'Delete tag' }).click()
  await expect(page.getByLabel('Tag name: backend')).toHaveCount(0)
  const steps = await readStore<StepRow>(page, 'subtasks')
  const backendLeft = steps.flatMap((s) => s.tags ?? [])
  expect(backendLeft).toHaveLength(1) // just "testing" on one step
})

test("a step's tags are edited in its panel and shown on its row and in focus", async ({ page }) => {
  await importExample(page)
  // First step: no tags yet.
  const firstRow = page.locator('li[data-row]').first()
  await firstRow.getByRole('button', { name: 'Show step details' }).click()
  const picker = firstRow.getByRole('group', { name: 'Tags' })
  await picker.getByRole('button', { name: 'testing' }).click()
  await expect(picker.getByRole('button', { name: 'testing' })).toHaveAttribute('aria-pressed', 'true')
  // A new tag, created from the step.
  await picker.getByLabel('New tag for this step').fill('reading')
  await picker.getByLabel('New tag for this step').press('Enter')
  await expect(picker.getByRole('button', { name: 'reading' })).toHaveAttribute('aria-pressed', 'true')
  // Unpick one again.
  await picker.getByRole('button', { name: 'testing' }).click()
  await expect(picker.getByRole('button', { name: 'testing' })).toHaveAttribute('aria-pressed', 'false')

  // Collapsed, the row shows its tags.
  await firstRow.getByRole('button', { name: 'Hide step details' }).click()
  await expect(firstRow.getByText('reading')).toBeVisible()

  // The focus card shows them under the title.
  await page.getByRole('button', { name: 'Start focus' }).click()
  await expect(page.getByLabel('Tags')).toHaveText('reading')

  // And Settings lists the new tag.
  await openApp(page, '#/settings')
  await expect(page.getByLabel('Tag name: reading')).toBeVisible()
})

test('project export lists tags by name, without colours, and re-imports cleanly', async ({ page }) => {
  await importExample(page)
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export JSON' }).click()
  const file = await (await downloading).path()
  const text = await readFile(file, 'utf8')
  const doc = JSON.parse(text)
  expect(doc.projects[0].subtasks[3].tags).toEqual(['backend', 'testing'])
  expect(text).not.toContain('color')
})

test('the AI prompt lists existing tags', async ({ page }) => {
  await focusOnExample(page)
  await openApp(page, '#/settings')
  await page.getByRole('button', { name: 'Show full prompt' }).click()
  await expect(page.getByLabel('Full AI prompt, with the schema filled in')).toHaveValue(/Existing tags: backend, testing\./)
  await expect(page.getByLabel('Full AI prompt, with the schema filled in')).toHaveValue(/"tags"/)
})
