import { expect, type Page } from '@playwright/test'

export const EXAMPLE_TITLE = 'Fix duplicate emails on order confirmation'

/**
 * Records what the app copies, inside the page, instead of using the system clipboard. On
 * Windows every browser shares one clipboard, so tests copying in parallel would read each
 * other's text. Call before the page loads; read the result with copiedText().
 */
export async function recordClipboard(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __copied?: string }
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          w.__copied = text
        },
        readText: async () => w.__copied ?? '',
      },
    })
  })
}

/** The text most recently copied, when recordClipboard() is on. */
export async function copiedText(page: Page): Promise<string> {
  return page.evaluate(() => (window as unknown as { __copied?: string }).__copied ?? '')
}

/** Opens the app on the overview and waits for it to be ready. */
export async function openApp(page: Page, hash = ''): Promise<void> {
  await page.goto(`/${hash}`)
  await expect(page.getByRole('link', { name: 'Momentum overview' })).toBeVisible()
}

/** Imports the bundled example project and lands on its project page. */
export async function importExample(page: Page): Promise<void> {
  await openApp(page)
  await page.getByRole('button', { name: 'Import', exact: true }).first().click()
  const dialog = page.locator('dialog')
  await dialog.getByText('Try the example').click()
  await dialog.getByRole('button', { name: 'Import', exact: true }).click()
  await expect(page).toHaveURL(/#\/project\//)
  await expect(page.getByRole('button', { name: 'Start focus' })).toBeVisible()
}

/** Imports the example and opens the focus screen on its first step. */
export async function focusOnExample(page: Page): Promise<void> {
  await importExample(page)
  await page.getByRole('button', { name: 'Start focus' }).click()
  await expect(page).toHaveURL(/#\/focus\//)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Read the ticket and AI summary')
}

/** The big start/stop button on the focus screen. */
export const workButton = (page: Page, label: 'Start' | 'Pause') =>
  page.getByRole('button', { name: label, exact: true })

/** Reads every row of an IndexedDB object store in the page. */
export async function readStore<T = Record<string, unknown>>(page: Page, store: string): Promise<T[]> {
  return page.evaluate(
    (name) =>
      new Promise<T[]>((resolve, reject) => {
        const req = indexedDB.open('momentum')
        req.onerror = () => reject(req.error)
        req.onsuccess = () => {
          const all = req.result.transaction(name, 'readonly').objectStore(name).getAll()
          all.onsuccess = () => resolve(all.result as T[])
          all.onerror = () => reject(all.error)
        }
      }),
    store,
  )
}

export async function openSegmentCount(page: Page): Promise<number> {
  const segments = await readStore<{ endedAt?: number }>(page, 'segments')
  return segments.filter((s) => s.endedAt === undefined).length
}

/** Width of the page's scrollable area, to detect sideways overflow. */
export function pageWidth(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth)
}
