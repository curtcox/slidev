import fs from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { adapter, ready } from '../../vendor/fragment-kit-v0.4.4/testing/contract/adapter.js'

test('exports self-contained, script-free printable HTML with all slides, clicks revealed, math, diagrams and escaped notes', async ({ page, context }) => {
  await ready(page)
  const deck = {
    src: [
      '---',
      'title: "Printable Deck"',
      '---',
      '',
      '# First printable slide',
      '',
      '<v-click>Revealed in export</v-click>',
      '',
      'Equation: $E = mc^2$',
      '',
      '<!--',
      'Speaker note <img src=x onerror="alert(1)">',
      '-->',
      '',
      '---',
      '',
      '# Second printable slide',
      '',
      '```mermaid',
      'graph LR',
      '  A[Write] --> B[Print]',
      '```',
    ].join('\n'),
    slidev: {
      css: '.print-accent { color: rgb(8, 126, 172); }',
    },
  }
  await adapter.edit(page, deck)
  await expect(page.frameLocator('#preview iframe').locator('h1')).toHaveText('First printable slide')

  await page.locator('#print-pdf').click()
  const dialog = page.locator('#download-dialog')
  await expect(dialog).toBeVisible()
  await dialog.locator('#export-notes').check()

  const downloadPromise = page.waitForEvent('download')
  await dialog.locator('#download-html').click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('slides-with-notes.html')

  const filePath = await download.path()
  const html = await fs.readFile(filePath, 'utf8')
  expect(html).toContain('<!doctype html>')
  expect(html).toContain('default-src \'none\'')
  expect(html).toContain('@page')
  expect(html).toContain('@media print')
  expect(html).not.toMatch(/<script\b/i)

  // Open the exported standalone HTML in a separate tab and verify rendered output.
  const tab = await context.newPage()
  try {
    await tab.setContent(html)
    await expect(tab.locator('.print-slide-page')).toHaveCount(2)
    await expect(tab.locator('.print-slide-page').nth(0)).toContainText('First printable slide')
    await expect(tab.locator('.print-slide-page').nth(0)).toContainText('Revealed in export')
    await expect(tab.locator('.print-slide-page').nth(0).locator('.katex')).toHaveCount(1)
    await expect(tab.locator('.print-slide-page').nth(1)).toContainText('Second printable slide')
    await expect(tab.locator('.print-slide-page').nth(1).locator('.mermaid svg')).toHaveCount(1)
    await expect(tab.locator('.print-notes')).toHaveCount(1)
    await expect(tab.locator('.print-notes')).toContainText('Speaker note <img src=x onerror="alert(1)">')
    await expect(tab.locator('.print-notes img')).toHaveCount(0)
    await expect(tab.locator('script')).toHaveCount(0)
  }
  finally {
    await tab.close()
  }

  // Live preview stays intact on slide 1 after disposable export sandbox finishes.
  await expect(page.locator('#preview iframe')).toHaveCount(1)
  await expect(page.frameLocator('#preview iframe').locator('h1')).toHaveText('First printable slide')
})
