import { expect, test } from '@playwright/test'
import { adapter, ready } from '../../vendor/fragment-kit-v0.4.4/testing/contract/adapter.js'

test('Monaco stays lazy for ordinary decks, loads on demand with ATA disabled, and runs {monaco-run} inside the opaque sandbox', async ({ page }) => {
  const monacoRequests = []
  const externalRequests = []
  const baseOrigin = new URL(process.env.FRAGMENT_KIT_BASE_URL || 'http://127.0.0.1:8000/').origin
  page.on('request', (request) => {
    const url = request.url()
    if (url.includes('runtime/monaco/'))
      monacoRequests.push(url)
    if (/^https?:\/\//.test(url) && new URL(url).origin !== baseOrigin)
      externalRequests.push(url)
  })

  await ready(page)
  await page.waitForSelector('body[data-ready="true"]')
  // Ordinary decks without {monaco} must never download Monaco assets.
  expect(monacoRequests).toEqual([])

  const deck = [
    '# Monaco live run',
    '',
    '```ts {monaco-run}',
    'const answer: number = 21 * 2',
    'console.log("result:", answer)',
    'let parentAccess = false',
    'try { parentAccess = Boolean((globalThis as any).parent.document) } catch {}',
    'console.log("origin:", globalThis.origin, "parent:", parentAccess)',
    '```',
    '',
    '---',
    '',
    '# Monaco diff',
    '',
    '```ts {monaco-diff}',
    'const before = 1',
    '~~~',
    'const after = 2',
    '```',
  ].join('\n')

  await adapter.edit(page, deck)
  const frame = page.frameLocator('#preview iframe')
  await expect(frame.locator('h1')).toHaveText('Monaco live run')
  await expect(frame.locator('.monaco-editor')).toBeVisible({ timeout: 20000 })
  await expect(frame.locator('.slidev-runner-output')).toContainText('result:', { timeout: 20000 })
  await expect(frame.locator('.slidev-runner-output')).toContainText('42')
  await expect(frame.locator('.slidev-runner-output')).toContainText('origin:')
  await expect(frame.locator('.slidev-runner-output')).toContainText('null')
  await expect(frame.locator('.slidev-runner-output')).toContainText('parent:')
  await expect(frame.locator('.slidev-runner-output')).toContainText('false')

  expect(monacoRequests.length).toBeGreaterThanOrEqual(2)
  expect(externalRequests).toEqual([])

  // Typing inside Monaco must not trigger slide navigation.
  const editorInput = frame.locator('.monaco-editor textarea').first()
  await editorInput.focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('Space')
  await expect(page.locator('#slide-position')).toHaveText('1 / 2')

  // Clicking Run re-executes inside the opaque sandbox.
  await frame.getByRole('button', { name: 'Run code' }).click()
  await expect(frame.locator('.slidev-runner-output')).toContainText('42')

  // Slide 2 mounts the Monaco diff editor cleanly without CDN fetches.
  await page.locator('#next-slide').click()
  await expect(frame.locator('h1')).toHaveText('Monaco diff')
  await expect(frame.locator('.monaco-diff-editor')).toBeVisible({ timeout: 20000 })
  expect(externalRequests).toEqual([])
})
