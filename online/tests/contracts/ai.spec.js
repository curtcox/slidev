import { expect, test } from '@playwright/test'
import { adapter, ready } from '../../vendor/fragment-kit-v0.4.4/testing/contract/adapter.js'

test('an accepted AI change cancels a pending typing render and preserves unrelated edits', async ({ page }) => {
  await ready(page)
  await adapter.edit(page, '# Original\n')
  await expect(page.frameLocator('#preview iframe').locator('h1')).toHaveText('Original')
  await page.locator('#ask-ai').click()
  const ask = page.locator('#ai-ask-dialog')
  await ask.getByLabel('Describe a change').fill('Change the title')
  await ask.getByRole('button', { name: 'Copy prompt', exact: true }).click()
  await expect(ask).toContainText('Prompt ready')
  await ask.getByLabel('Paste model reply').fill(JSON.stringify({
    summary: 'Update title',
    edits: [
      { find: '# Original', replace: '# Accepted' },
    ],
  }))
  await ask.getByRole('button', { name: 'Review pasted reply' }).click()
  await expect(ask.locator('#ai-accept')).toBeVisible()
  await adapter.edit(page, '# Original\n\nMy newer paragraph.\n')
  await ask.locator('#ai-accept').click()
  await expect.poll(() => adapter.getSource(page)).toBe('# Accepted\n\nMy newer paragraph.\n')
  await ask.locator('.fk-close').click()
  // Cross the 500 ms typing debounce to detect a render scheduled before apply.
  await page.waitForTimeout(750)
  await expect(page.locator('#preview iframe')).toHaveCount(0)
  await expect(page.locator('#preview-status')).toContainText('AI change applied')
  await page.goBack()
  await expect.poll(() => adapter.getSource(page)).toBe('# Original\n\nMy newer paragraph.\n')
  await expect(page.locator('#preview iframe')).toHaveCount(0)
})

test('phone AI controls fit the viewport and keep model output as text', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await ready(page)
  await page.getByRole('button', { name: 'More', exact: true }).click()
  await page.locator('#fk-more-drawer').getByRole('button', { name: 'Ask AI', exact: true }).click()
  const ask = page.locator('#ai-ask-dialog')
  const request = ask.getByLabel('Describe a change')
  await request.fill('Review a proposal')
  await ask.getByRole('button', { name: 'Copy prompt', exact: true }).click()
  await expect(ask).toContainText('Prompt ready')
  const summary = '<img src=x onerror="alert(1)">'
  await ask.getByLabel('Paste model reply').fill(JSON.stringify({
    summary,
    edits: [],
    settings: {
      slidev: { css: 'h1 { color: purple }' },
    },
  }))
  await ask.getByRole('button', { name: 'Review pasted reply' }).click()
  await expect(ask).toContainText(summary)
  await expect(ask.locator('img')).toHaveCount(0)
  expect(await request.evaluate(node => Number.parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(16)
  const bounds = await ask.boundingBox()
  expect(bounds.x).toBeGreaterThanOrEqual(0)
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(360)
  expect(await ask.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true)
  expect((await ask.locator('#ai-accept').boundingBox()).height).toBeGreaterThanOrEqual(40)
})
