import { expect, test } from '@playwright/test'
import { adapter, ready } from '../../vendor/fragment-kit-v0.4.4/testing/contract/adapter.js'

test('presenter view opens in a second window with opaque current/next sandboxes, text notes, timer and two-way sync', async ({ page, context }) => {
  await ready(page)
  const deck = [
    '# Opening slide',
    '',
    '<v-click>Hidden reveal</v-click>',
    '',
    '<!--',
    'Speaker note <img src=x onerror="alert(1)"> on slide 1',
    '-->',
    '',
    '---',
    '',
    '# Closing slide',
    '',
    '<!--',
    'Final note for slide 2',
    '-->',
  ].join('\n')
  await adapter.edit(page, deck)
  await expect(page.frameLocator('#preview iframe').locator('h1')).toHaveText('Opening slide')
  await expect(page.locator('#slide-position')).toHaveText('1 / 2')

  const popupPromise = context.waitForEvent('page')
  await page.locator('#presenter').click()
  const presenter = await popupPromise
  await presenter.waitForSelector('body[data-ready="true"]')

  // Presenter runs on editor origin, while both slide previews stay opaque.
  expect(new URL(presenter.url()).origin).toBe(new URL(page.url()).origin)
  expect(await presenter.locator('#presenter-current iframe').getAttribute('sandbox')).toBe('allow-scripts')
  expect(await presenter.locator('#presenter-next-frame iframe').getAttribute('sandbox')).toBe('allow-scripts')
  const presenterFrames = presenter.frames().filter(frame => frame.parentFrame())
  expect(presenterFrames).toHaveLength(2)
  for (const frame of presenterFrames) {
    expect(await frame.evaluate(() => globalThis.origin)).toBe('null')
    expect(await frame.evaluate(() => {
      try {
        return Boolean(parent.document)
      }
      catch {
        return false
      }
    })).toBe(false)
  }

  // Current slide, next slide, and strictly inert text speaker notes.
  await expect(presenter.frameLocator('#presenter-current iframe').locator('h1')).toHaveText('Opening slide')
  await expect(presenter.frameLocator('#presenter-next-frame iframe').locator('h1')).toHaveText('Closing slide')
  await expect(presenter.locator('#presenter-notes')).toContainText('Speaker note <img src=x onerror="alert(1)"> on slide 1')
  await expect(presenter.locator('#presenter-notes img')).toHaveCount(0)

  // Stepping forward in Presenter advances click reveal, then next slide, syncing editor.
  await presenter.locator('#presenter-next').click()
  await expect(presenter.locator('#presenter-position')).toHaveText('1 / 2 · click 1')
  await presenter.locator('#presenter-next').click()
  await expect(presenter.locator('#presenter-position')).toHaveText('2 / 2')
  await expect(page.locator('#slide-position')).toHaveText('2 / 2')
  await expect(page.frameLocator('#preview iframe').locator('h1')).toHaveText('Closing slide')
  await expect(presenter.frameLocator('#presenter-current iframe').locator('h1')).toHaveText('Closing slide')
  await expect(presenter.locator('#presenter-notes')).toHaveText('Final note for slide 2')
  await expect(presenter.locator('#presenter-next-empty')).toBeVisible()
  await expect(presenter.locator('#presenter-next-frame iframe')).toHaveCount(0)

  // Navigating in the editor syncs Presenter back to slide 1.
  await page.locator('#previous-slide').click()
  await expect(presenter.locator('#presenter-position')).toHaveText('1 / 2')
  await expect(presenter.frameLocator('#presenter-current iframe').locator('h1')).toHaveText('Opening slide')
  await expect(presenter.frameLocator('#presenter-next-frame iframe').locator('h1')).toHaveText('Closing slide')

  // Timer ticks, pauses, and resets cleanly.
  await expect.poll(() => presenter.locator('#presenter-clock').textContent(), { timeout: 5000 }).not.toBe('00:00:00')
  await presenter.locator('#presenter-timer-toggle').click()
  await expect(presenter.locator('#presenter-timer-toggle')).toHaveText('Resume')
  await presenter.locator('#presenter-timer-reset').click()
  await expect(presenter.locator('#presenter-clock')).toHaveText('00:00:00')

  await presenter.close()
})
