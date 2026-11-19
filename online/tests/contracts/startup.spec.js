import { expect, test } from '@playwright/test'
import { adapter, ready } from '../../vendor/fragment-kit-v0.4.4/testing/contract/adapter.js'

// Precache intentionally fetches optional tools after rendering. Block it here
// to distinguish application startup from offline preparation.
test.use({ serviceWorkers: 'block' })

test('QR tools load on request and reuse one dialog', async ({ page }) => {
  const requests = []
  page.on('request', request => requests.push(request.url()))
  await ready(page)
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true')
  expect(requests.filter(url => /\/(?:src\/qr|vendor\/jsqr)\//.test(url))).toEqual([])
  await page.locator(adapter.qr).click()
  await expect(page.locator('#qr-dialog svg')).toBeVisible()
  expect(requests.some(url => url.includes('/vendor/jsqr/'))).toBe(true)
  await page.locator('#qr-dialog .fk-close').click()
  await page.locator(adapter.qr).click()
  await expect(page.locator('#qr-dialog svg')).toBeVisible()
  await expect(page.locator('#qr-dialog')).toHaveCount(1)
  await expect(page.locator('#preview iframe')).toHaveAttribute('sandbox', 'allow-scripts')
})

test('a failed optional QR import shows an error and preserves the document', async ({ page, context }) => {
  const errors = []
  page.on('pageerror', error => errors.push(String(error)))
  await context.route('**/src/qr/qr-dialog.js', route => route.abort())
  await ready(page, './?run=0')
  const doc = await adapter.getDocument(page)
  await page.locator(adapter.qr).click()
  await expect(page.locator(adapter.status)).toContainText(/(?:import|module)/i)
  expect(await adapter.getDocument(page)).toEqual(doc)
  await expect(page.locator('#preview iframe')).toHaveCount(0)
  expect(errors).toEqual([])
})
