import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { focusOnExample, importExample, openApp, readStore, workButton } from './helpers'

const heading = (page: Page) => page.getByRole('heading', { level: 1 })
const progress = (page: Page, done: number) => page.getByText(`${done} of 6`, { exact: true })

test.describe('undo after Complete', () => {
  test('the Undo button in the toast puts the step back', async ({ page }) => {
    await focusOnExample(page)
    await page.keyboard.press('Space')
    await expect(workButton(page, 'Pause')).toBeVisible()
    await page.keyboard.press('Control+Enter')
    await expect(heading(page)).toHaveText('Reproduce the duplicate email locally')
    await page.getByRole('button', { name: 'Undo' }).click()
    await expect(heading(page)).toHaveText('Read the ticket and AI summary')
    await expect(progress(page, 0)).toBeVisible()
    await expect(workButton(page, 'Pause')).toBeVisible()
    await expect(page.getByText('Step back on your list')).toBeVisible()
  })

  test('Ctrl+Z undoes, even during the celebration moment', async ({ page }) => {
    await focusOnExample(page)
    await page.keyboard.press('Control+Enter')
    await page.keyboard.press('Control+z')
    // The heading and "0 of 6" already match before the completion lands, so wait for the
    // confirmation that the undo has finished before checking.
    await expect(page.getByText('Step back on your list')).toBeVisible()
    await expect(heading(page)).toHaveText('Read the ticket and AI summary')
    await expect(progress(page, 0)).toBeVisible()
    const steps = await readStore<{ status: string }>(page, 'subtasks')
    expect(steps.every((s) => s.status === 'todo')).toBe(true)
  })

  test('the Undo toast does not follow you off the focus screen', async ({ page }) => {
    await focusOnExample(page)
    await page.keyboard.press('Control+Enter')
    await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible()
    await page.getByRole('button', { name: 'Exit focus (Esc)' }).click()
    await page.getByRole('button', { name: 'Exit', exact: true }).click()
    await expect(page.getByRole('link', { name: 'Momentum overview' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0)
  })

  test('undoing the last step takes you back from Project complete', async ({ page }) => {
    await importExample(page)
    // Tick off five steps on the project page, then finish the last one in focus.
    for (let i = 1; i <= 5; i++) {
      await page.getByRole('checkbox', { name: /^Complete "/ }).first().click()
      await expect(page.getByText(`${i} of 6 done`)).toBeVisible()
    }
    await page.getByRole('button', { name: 'Start focus' }).click()
    await expect(heading(page)).toHaveText('Deploy and confirm in monitoring')
    await page.keyboard.press('Control+Enter')
    await expect(page.getByRole('heading', { name: 'Project complete' })).toBeVisible()
    await page.getByRole('button', { name: 'Undo' }).click()
    await expect(page.getByRole('heading', { name: 'Project complete' })).toHaveCount(0)
    await expect(heading(page)).toHaveText('Deploy and confirm in monitoring')
    const [project] = await readStore<{ status: string }>(page, 'projects')
    expect(project.status).toBe('active')
  })
})

test.describe('jumping to a step', () => {
  test('"Focus on this step" on the project page opens focus on that step', async ({ page }) => {
    await importExample(page)
    await page.getByLabel('Step title').nth(3).hover()
    await page.getByRole('button', { name: 'Focus on "Write tests for retried webhooks"' }).click()
    await expect(heading(page)).toHaveText('Write tests for retried webhooks')
    // The ?step= is dropped, so a reload stays on whatever step is current.
    await expect(page).toHaveURL(/#\/focus\/[^?]+$/)
    await expect(workButton(page, 'Start')).toBeVisible()
  })

  test('the step label opens a list to pick any step still to do', async ({ page }) => {
    await importExample(page)
    await page.getByRole('checkbox', { name: /^Complete "Reproduce/ }).click()
    await page.getByRole('button', { name: 'Start focus' }).click()
    await expect(heading(page)).toHaveText('Read the ticket and AI summary')

    await page.getByRole('button', { name: /^step 1 of 6/i }).click()
    const menu = page.getByRole('menu', { name: 'Steps' })
    await expect(menu.getByRole('menuitem')).toHaveCount(6)
    await expect(menu.getByRole('menuitem', { name: /Reproduce the duplicate/ })).toBeDisabled()
    await expect(menu.getByRole('menuitem', { name: /Read the ticket/ })).toBeFocused()
    await page.keyboard.press('ArrowDown') // skips the finished step
    await expect(menu.getByRole('menuitem', { name: /Add idempotency/ })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(menu).toHaveCount(0)
    await expect(heading(page)).toHaveText('Add idempotency check to webhook handler')

    await page.getByRole('button', { name: /^step 3 of 6/i }).click()
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^step 3 of 6/i })).toBeFocused()
  })

  test('left and right arrow keys are not shortcuts on the focus screen', async ({ page }) => {
    await focusOnExample(page)
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await expect(heading(page)).toHaveText('Read the ticket and AI summary')
    await page.keyboard.press('ArrowLeft')
    await expect(heading(page)).toHaveText('Read the ticket and AI summary')
  })
})

test.describe('editing the current step in focus', () => {
  test('E opens the editor; Enter saves the title and the timebox saves straight away', async ({ page }) => {
    await focusOnExample(page)
    await page.keyboard.press('e')
    const title = page.getByRole('textbox', { name: 'Step title' })
    await expect(title).toBeFocused()
    await title.fill('Read the ticket properly')
    await page.getByRole('combobox', { name: 'Timebox' }).selectOption('15')
    await title.press('Enter')
    await expect(heading(page)).toHaveText('Read the ticket properly')
    const [first] = (await readStore<{ title: string; timeboxMinutes?: number; order: number }>(page, 'subtasks')).sort(
      (a, b) => a.order - b.order,
    )
    expect(first).toMatchObject({ title: 'Read the ticket properly', timeboxMinutes: 15 })
    // Space still means start/stop after editing.
    await page.keyboard.press('Space')
    await expect(workButton(page, 'Pause')).toBeVisible()
  })

  test('the pencil opens it too; Esc cancels and an empty title is not saved', async ({ page }) => {
    await focusOnExample(page)
    await page.getByRole('button', { name: 'Edit this step (E)' }).click()
    const title = page.getByRole('textbox', { name: 'Step title' })
    await title.fill('Something else')
    await title.press('Escape')
    await expect(heading(page)).toHaveText('Read the ticket and AI summary')

    await page.keyboard.press('e')
    await page.getByRole('textbox', { name: 'Step title' }).fill('   ')
    await page.getByRole('textbox', { name: 'Step title' }).press('Enter')
    await expect(heading(page)).toHaveText('Read the ticket and AI summary')
  })
})

test.describe('AI prompt in Settings', () => {
  test('can be edited, persists, and is what the import dialog copies and shows', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await openApp(page, '#/settings')
    const editor = page.getByLabel('AI import prompt template')
    await expect(editor).toHaveValue(/Summarise the ticket below/)
    await editor.fill('Break this ticket into small steps.\n{{SCHEMA}}\nTicket:\n')
    await editor.blur()
    // Wait for the save to land in IndexedDB before reloading.
    await expect
      .poll(async () => (await readStore<{ key: string }>(page, 'settings')).some((r) => r.key === 'aiPromptTemplate'))
      .toBe(true)
    await page.reload()
    await expect(page.getByLabel('AI import prompt template')).toHaveValue(/^Break this ticket into small steps\./)

    await page.getByRole('button', { name: 'Show full prompt' }).click()
    await expect(page.getByLabel('Full AI prompt, with the schema filled in')).toHaveValue(/"\$id": "momentum-import-v1"/)

    await openApp(page)
    await page.keyboard.press('i')
    await page.getByRole('button', { name: 'Copy AI prompt' }).click()
    await expect(page.getByText('AI prompt copied')).toBeVisible()
    // Windows' clipboard stores line breaks as \r\n.
    const copied = (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n')
    expect(copied.slice(0, 37)).toBe('Break this ticket into small steps.\n{')
    await page.getByRole('button', { name: 'View' }).click()
    await expect(page.getByRole('textbox', { name: 'AI prompt' })).toHaveValue(/^Break this ticket/)
    await page.getByRole('link', { name: 'Edit the prompt in Settings' }).click()
    await expect(page).toHaveURL(/#\/settings$/)

    await page.getByRole('button', { name: 'Reset to default' }).click()
    await expect(page.getByLabel('AI import prompt template')).toHaveValue(/^Summarise the ticket below/)
    expect((await readStore<{ key: string }>(page, 'settings')).map((r) => r.key)).not.toContain('aiPromptTemplate')
  })

  test('warns when the schema placeholder is missing', async ({ page }) => {
    await openApp(page, '#/settings')
    await page.getByLabel('AI import prompt template').fill('Just steps, please.')
    await expect(page.getByRole('note')).toContainText("doesn't include {{SCHEMA}}")
  })
})

test('Export JSON downloads a file that imports back', async ({ page }) => {
  await importExample(page)
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export JSON' }).click()
  const download = await downloading
  expect(download.suggestedFilename()).toBe('SHOP-482.json')
  const file = await download.path()
  const doc = JSON.parse(await readFile(file, 'utf8'))
  expect(doc.schemaVersion).toBe(1)
  expect(doc.projects[0].subtasks).toHaveLength(6)

  await openApp(page)
  await page.keyboard.press('i')
  const dialog = page.locator('dialog')
  await dialog.locator('input[type=file]').setInputFiles(file)
  await expect(dialog.getByText('SHOP-482 already exists.')).toBeVisible()
  await dialog.getByRole('radio', { name: 'Import as new' }).check()
  await dialog.getByRole('button', { name: 'Import', exact: true }).click()
  await expect(page).toHaveURL(/#\/project\//)
  await openApp(page)
  await expect(page.locator('[data-card]')).toHaveCount(2)
})
