import { expect, test } from '@playwright/test'
import { adapter, ready } from '../../vendor/fragment-kit-v0.4.4/testing/contract/adapter.js'
import { mockHashBinSDK } from '../../vendor/fragment-kit-v0.4.4/testing/fixtures/mock-hashbin.mjs'

test('the Ace adapter shares and restores both files without executing a run=0 link', async ({ page }) => {
  await ready(page)
  const doc = {
    src: '# Two files ☕\n\n<script setup>throw new Error("must wait for Render")</script>',
    slidev: { css: 'h1 { color: rebeccapurple; }' },
  }
  await adapter.edit(page, doc)
  await expect.poll(() => adapter.getDocument(page)).toEqual(doc)
  await page.locator(adapter.share).click()
  await page.locator('#share-run').uncheck()
  const href = await page.locator(adapter.shareLink).inputValue()
  await ready(page, href)
  await expect.poll(() => adapter.getDocument(page)).toEqual(doc)
  await expect(page.locator('#preview iframe')).toHaveCount(0)
})

test('closing a QR save does not reopen QR after an unrelated save', async ({ page, context }) => {
  await context.route('**/vendor/hashbin-sdk-v0.4.0.mjs', route => route.fulfill({ body: mockHashBinSDK, contentType: 'text/javascript' }))
  await adapter.configureHashBin(context, 'contract-client')
  await ready(page)
  const source = Array.from({ length: 2000 }, (_, index) => `${index.toString(36)}-${(index * 2654435761 >>> 0).toString(36)}`).join(' ')
  await adapter.edit(page, `# ${source}`)
  await page.locator(adapter.qr).click()
  await page.getByRole('button', { name: 'Save to HashBin for a scannable link', exact: true }).click()
  await expect(page.locator('#hashbin-confirm')).toBeEnabled()
  await page.locator('#hashbin-dialog .fk-close').click()
  await page.locator('#save').click()
  await expect(page.locator('#hashbin-confirm')).toBeEnabled()
  await page.locator('#hashbin-confirm').click()
  await expect(page.locator('#hashbin-message')).toContainText('Open saved source')
  await expect(page.locator(adapter.qrDialog)).toBeHidden()
})
