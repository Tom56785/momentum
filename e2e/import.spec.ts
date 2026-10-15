import { expect, test } from '@playwright/test'
import { EXAMPLE_TITLE, importExample, openApp } from './helpers'

test('imports the example and lands on the project with Start focus', async ({ page }) => {
  await importExample(page)
  await expect(page.getByRole('textbox', { name: 'Project title' })).toHaveValue(EXAMPLE_TITLE)
  await expect(page.getByLabel('Step title')).toHaveCount(6)
  await expect(page.getByText('0 of 6 done')).toBeVisible()
})

test('shows friendly, path-based errors and tolerates a code fence', async ({ page }) => {
  await openApp(page)
  await page.keyboard.press('i')
  const dialog = page.locator('dialog')
  await dialog
    .getByLabel('Import JSON')
    .fill('```json\n{"schemaVersion":1,"projects":[{"title":"","subtasks":[{"title":"x","timeboxMinutes":2.5}]}]}\n```')
  await expect(dialog.getByText('projects[0].title is empty')).toBeVisible()
  await expect(dialog.getByText('projects[0].subtasks[0].timeboxMinutes should be a whole number')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Import', exact: true })).toBeDisabled()
})

test('Copy AI prompt copies the prompt with the schema embedded', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await openApp(page)
  await page.keyboard.press('i')
  await page.getByRole('button', { name: 'Copy AI prompt' }).click()
  await expect(page.getByText('AI prompt copied')).toBeVisible()
  const copied = await page.evaluate(() => navigator.clipboard.readText())
  expect(copied).toContain('"$id": "momentum-import-v1"')
  expect(copied).toContain('{{PASTE TICKET HERE}}')
  expect(copied).not.toContain('{{SCHEMA}}')
})

test('offers Replace subtasks or Import as new for an existing ticket key', async ({ page }) => {
  await importExample(page)
  await openApp(page)
  await page.keyboard.press('i')
  const dialog = page.locator('dialog')
  await dialog.getByText('Try the example').click()
  await expect(dialog.getByText('SHOP-482 already exists.')).toBeVisible()
  await expect(dialog.getByRole('radio', { name: 'Replace subtasks' })).toBeChecked()
  await dialog.getByRole('radio', { name: 'Import as new' }).check()
  await dialog.getByRole('button', { name: 'Import', exact: true }).click()
  // Wait until the import has saved and opened the new project before leaving.
  await expect(page).toHaveURL(/#\/project\//)
  await openApp(page)
  await expect(page.locator('[data-card]')).toHaveCount(2)
})
