import { expect, test } from '@playwright/test'
import { importExample, openApp, readStore } from './helpers'

test.describe('new project input', () => {
  test('Enter creates exactly one project', async ({ page }) => {
    await openApp(page)
    await page.getByRole('button', { name: 'New project' }).click()
    await page.keyboard.type('Only once')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/#\/project\//)
    await expect(page.getByRole('textbox', { name: 'Project title' })).toHaveValue('Only once')
    expect(await readStore(page, 'projects')).toHaveLength(1)
  })

  test('Escape creates nothing', async ({ page }) => {
    await openApp(page)
    await page.getByRole('button', { name: 'New project' }).click()
    await page.keyboard.type('Cancelled')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: 'New project' })).toBeVisible()
    await expect(page).not.toHaveURL(/#\/project\//)
    expect(await readStore(page, 'projects')).toHaveLength(0)
  })
})

test.describe('project screen editing', () => {
  test.beforeEach(async ({ page }) => {
    await importExample(page)
  })

  test('Summary keeps a newline typed before the autosave pause', async ({ page }) => {
    const summary = page.getByRole('textbox', { name: 'Summary', exact: true })
    await summary.click()
    await summary.press('Control+End')
    await page.keyboard.press('Enter')
    // Pause past the 500ms autosave while the field is still being edited. (The saved value
    // is trimmed, so it equals what's stored and can't be polled for; a fixed wait it is.)
    await page.waitForTimeout(900)
    await page.keyboard.type('Second line')
    await expect(summary).toHaveValue(/\nSecond line$/)
  })

  test('an emptied step title reverts to the stored one', async ({ page }) => {
    const title = page.getByLabel('Step title').first()
    const original = await title.inputValue()
    await title.fill('')
    await title.press('Enter')
    await expect(title).toHaveValue(original)
  })

  test('Move down keeps focus on the button, so it can be pressed again', async ({ page }) => {
    const titles = page.getByLabel('Step title')
    const first = await titles.first().inputValue()
    await page.getByRole('button', { name: 'Show step details' }).first().click()
    await page.getByRole('button', { name: 'Move step down' }).focus()
    await page.keyboard.press('Enter')
    await expect(titles.nth(1)).toHaveValue(first)
    await page.keyboard.press('Enter')
    await expect(titles.nth(2)).toHaveValue(first)
    await expect(page.getByRole('button', { name: 'Move step down' })).toBeFocused()
  })

  test('ticking a step updates progress, and unticking undoes it', async ({ page }) => {
    const check = page.getByRole('checkbox', { name: /^Complete "Read the ticket/ })
    await check.click()
    await expect(page.getByText('1 of 6 done')).toBeVisible()
    await page.getByRole('checkbox', { name: /^Mark "Read the ticket.*as not done/ }).click()
    await expect(page.getByText('0 of 6 done')).toBeVisible()
    const types = (await readStore<{ type: string }>(page, 'events')).map((e) => e.type)
    expect(types).toContain('subtask_reopened')
  })

  test('Enter adds a step at the end of the chain', async ({ page }) => {
    const add = page.getByLabel('Add a step')
    await add.fill('Write release notes')
    await add.press('Enter')
    await expect(page.getByLabel('Step title').last()).toHaveValue('Write release notes')
    await expect(add).toHaveValue('')
  })
})

test.describe('overview cards', () => {
  test.beforeEach(async ({ page }) => {
    await importExample(page)
    await openApp(page)
  })

  test('clicking anywhere on a card opens the project', async ({ page }) => {
    const card = page.locator('[data-card]')
    // Near the bottom-left corner: blank space, well away from the title link's text.
    const box = (await card.boundingBox())!
    await page.mouse.click(box.x + 12, box.y + box.height - 8)
    await expect(page).toHaveURL(/#\/project\//)
  })

  test("the card's Focus button still opens focus", async ({ page }) => {
    await page.locator('[data-card]').getByRole('button', { name: 'Focus' }).click()
    await expect(page).toHaveURL(/#\/focus\//)
  })
})

test.describe('long step titles', () => {
  test('wrap onto more lines instead of being cut off, and stay on one line of text', async ({ page }) => {
    await importExample(page)
    const title = page.getByLabel('Step title').first()
    const oneLine = (await title.boundingBox())!.height
    const long = 'Read the ticket and the AI summary, then note which customers reported duplicates and when it started'
    await title.fill(long)
    await expect.poll(async () => (await title.boundingBox())!.height).toBeGreaterThan(oneLine * 1.5)
    // Every character is visible: the field is as tall as its content.
    expect(await title.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true)
    await title.press('Enter')
    await expect(title).not.toBeFocused()
    await expect(title).toHaveValue(long)
  })
})
