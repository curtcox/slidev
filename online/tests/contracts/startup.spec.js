import { expect, test } from '@playwright/test'
import { adapter, ready } from '../../vendor/fragment-kit-v0.4.4/testing/contract/adapter.js'

// Precache intentionally fetches optional tools after rendering. Block it here
// to distinguish application startup from offline preparation.
test.use({ serviceWorkers: 'block' })

test('runtime bytes preload once and execute only inside fresh opaque previews', async ({ page }) => {
  const requests = []
  page.on('request', request => requests.push(request.url()))
  await ready(page)
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true')
  for (const path of ['/runtime/sandbox.js', '/runtime/sandbox.css'])
    expect(requests.filter(url => url.endsWith(path))).toHaveLength(1)
  expect(await page.evaluate(() => Object.getOwnPropertyNames(globalThis).some(key => key.startsWith('__slidevonline_')))).toBe(false)
  const first = page.frames().find(frame => frame.parentFrame())
  expect(await first.evaluate(() => globalThis.origin)).toBe('null')
  await adapter.edit(page, '# Fresh execution\n\n<script setup>globalThis.executionCount = (globalThis.executionCount || 0) + 1</script>')
  await expect(page.frameLocator('#preview iframe').locator('h1')).toHaveText('Fresh execution')
  expect(first.isDetached()).toBe(true)
  expect(await page.frames().find(frame => frame.parentFrame()).evaluate(() => globalThis.executionCount)).toBe(1)
  expect(await page.evaluate(() => globalThis.executionCount)).toBeUndefined()
  for (const path of ['/runtime/sandbox.js', '/runtime/sandbox.css'])
    expect(requests.filter(url => url.endsWith(path))).toHaveLength(1)
})

test('run=0 defers runtime downloads until Render', async ({ page }) => {
  const requests = []
  page.on('request', request => requests.push(request.url()))
  await ready(page, './?run=0')
  expect(requests.filter(url => /\/runtime\/sandbox\.(?:js|css)$/.test(url))).toEqual([])
  await expect(page.locator('#preview iframe')).toHaveCount(0)
  await page.locator('#render').click()
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true')
  for (const path of ['/runtime/sandbox.js', '/runtime/sandbox.css'])
    expect(requests.filter(url => url.endsWith(path))).toHaveLength(1)
})

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
