const assert = require('node:assert/strict')
const { Buffer } = require('node:buffer')
const process = require('node:process')
const { expect } = require('@playwright/test')
const { chromium, firefox, webkit } = require('playwright')

async function main() {
  const engine = process.argv[3] || process.env.BROWSER || 'chromium'
  const browser = await ({ chromium, firefox, webkit })[engine].launch()
  const context = await browser.newContext({
    viewport: { width: 1400, height: 950 },
    serviceWorkers: 'block',
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(String(error)))
  const base = process.argv[2] || 'http://127.0.0.1:8000/'
  const source = () => page.evaluate(() => globalThis.ace.edit('markdown-editor').getValue())
  const edit = src => page.evaluate(src => globalThis.ace.edit('markdown-editor').setValue(src, -1), src)
  const build = (doc, options = {}) => page.evaluate(async ({ doc, options }) => {
    const { createConfig } = await import('./vendor/fragment-kit-v0.4.4/src/core/config.js')
    const { createWorkspaceUrls } = await import('./src/links.js')
    const input = await (await fetch('fragment-kit.config.json')).json()
    const config = createConfig({ ...input, canonicalOrigin: input.recoveryOrigin })
    return createWorkspaceUrls({
      config,
      getSlide: () => options.slide ?? 1,
    }).build(doc, options).href
  }, { doc, options })
  const frame = () => page.frameLocator('#preview iframe')
  try {
    await page.goto(base)
    await page.waitForSelector('body[data-editor-ready="true"]')
    await expect(frame().locator('h1')).toHaveText('Hello, Slidev.')
    const deck = '# First\n\n<!-- <img src=x onerror=alert(1)> notes -->\n\n---\n\n# Second\n\n<script setup>globalThis.started = (globalThis.started || 0) + 1</script>\n'
    const css = 'h1 { color: rgb(12, 34, 56); }'
    const href = await build({
      src: deck,
      slidev: {
        css,
        future: { keep: true },
      },
    }, { run: false, view: 'edit', slide: 2 })
    await page.goto(href)
    await page.waitForSelector('body[data-editor-ready="true"]')
    assert.equal(await source(), deck)
    assert.equal(await page.evaluate(() => globalThis.ace.edit('css-editor').getValue()), css)
    await expect(page.locator('#preview iframe')).toHaveCount(0)
    await expect(page.getByRole('tab', { name: 'Markdown', exact: true })).toHaveAttribute('aria-selected', 'true')
    const changed = deck.replace('# Second', '# Edited second')
    await edit(changed)
    await expect.poll(() => new URL(page.url()).hash.startsWith('#v1.')).toBe(true)
    await expect(page.locator('#preview-status')).toContainText('Press Render')
    await expect(page.locator('#preview iframe')).toHaveCount(0)
    await page.locator('#render').click()
    await page.getByRole('tab', { name: 'Split', exact: true }).click()
    await expect(frame().locator('h1')).toHaveText('Edited second')
    assert.equal(await frame().locator('h1').evaluate(element => getComputedStyle(element).color), 'rgb(12, 34, 56)')
    assert.equal(new URL(page.url()).searchParams.get('slide'), '2')
    assert.equal(await page.frames().find(frame => frame.parentFrame()).evaluate(() => globalThis.started), 1)
    await page.locator('#previous-slide').click()
    await expect(frame().locator('h1')).toHaveText('First')
    await expect(page.locator('#slide-notes')).toHaveText('<img src=x onerror=alert(1)> notes')
    assert.equal(await page.locator('#slide-notes img').count(), 0)
    await page.evaluate(() => {
      const editor = globalThis.ace.edit('markdown-editor')
      editor.focus()
      editor.moveCursorTo(7, 0)
    })
    await expect(frame().locator('h1')).toHaveText('Edited second')
    assert.equal(await page.evaluate(() => globalThis.ace.edit('markdown-editor').getCursorPosition().row), 7)
    await edit(changed.replace('# Edited second', '# Live edit'))
    await expect(frame().locator('h1')).toHaveText('Live edit')
    await page.locator('#share').click()
    await page.locator('#share-run').uncheck()
    const shared = await page.locator('#share-link').inputValue()
    const sharedDoc = await page.evaluate(async (href) => {
      const { createDocuments } = await import('./vendor/fragment-kit-v0.4.4/src/core/envelope.js')
      const { slidevDocument } = await import('./src/document-type.js')
      const { decompress } = await import('./vendor/fragment-kit-v0.4.4/src/core/compression.js')
      return createDocuments(slidevDocument).parse(decompress(new URL(href).hash.slice(4)))
    }, shared)
    assert.deepEqual(sharedDoc.slidev, {
      css,
      future: { keep: true },
    })
    assert.equal(new URL(shared).searchParams.get('run'), '0')
    assert.equal(new URL(shared).searchParams.get('slide'), '2')
    await context.route('https://api.allorigins.win/**', route => route.fulfill({
      json: {
        contents: 'https://is.gd/editor123',
        status: { http_code: 200 },
      },
    }))
    await page.getByRole('button', { name: 'Shorten link', exact: true }).click()
    await expect(page.locator('#share-link')).toHaveValue('https://is.gd/editor123')
    await page.locator('#share-dialog .fk-close').click()
    const kept = await source()
    const draft = await page.evaluate(() => localStorage.getItem('slidevonline:draft'))
    await page.evaluate(() => {
      location.hash = 'v9.bad'
    })
    await expect(page.locator('#preview-status')).toContainText('Unsupported URL state version')
    assert.equal(await source(), kept)
    assert.equal(await page.evaluate(() => localStorage.getItem('slidevonline:draft')), draft)
    // A failed link on a new page must not silently recover a local draft.
    await page.reload()
    await page.waitForSelector('body[data-editor-ready="true"]')
    assert.equal(await source(), '')
    await expect(page.locator('#preview iframe')).toHaveCount(0)
    await page.locator('.fk-more').click()
    await page.locator('#resume-work').click()
    await page.locator('#restore-work').click()
    assert.equal(await source(), kept)
    await expect(page.locator('#preview iframe')).toHaveCount(0)
    await page.locator('#fk-more-drawer .fk-close').click()
    await page.locator('#save').click()
    await expect(page.locator('#hashbin-message')).toContainText('registered client ID')
    await expect(page.locator('#hashbin-confirm')).toBeDisabled()
    await page.locator('#hashbin-dialog .fk-close').click()
    const cid = await page.evaluate(async () => {
      const { computeCID } = await import('./vendor/fragment-kit-v0.4.4/src/core/cid.js')
      return computeCID('# Inline CID')
    })
    await page.goto(`${base}#${cid}`)
    await page.waitForSelector('body[data-ready="true"]')
    assert.equal(await source(), '# Inline CID')
    await page.locator('#qr').click()
    await expect(page.locator('#qr-code svg')).toBeVisible()
    assert.equal(await page.locator('#qr-code svg').count(), 1)
    await page.locator('#qr-dialog .fk-close').click()
    const forged = await page.evaluate(async () => {
      const { computeCID } = await import('./vendor/fragment-kit-v0.4.4/src/core/cid.js')
      return computeCID('# Wrong saved deck '.repeat(20))
    })
    await context.route(`https://256t.us/${forged}`, route => route.fulfill({ body: '# Forged content', contentType: 'text/plain' }))
    await page.evaluate((cid) => {
      location.hash = cid
    }, forged)
    await expect(page.locator('#preview-status')).toContainText('does not match its CID')
    assert.equal(await source(), '# Inline CID')
    await page.locator('#open').click()
    await page.getByLabel('Open Markdown, CSS or saved document').setInputFiles({
      name: 'import.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from('# Imported file\n\n<script setup>throw new Error("must wait for Render")</script>'),
    })
    await expect(page.locator('#preview-status')).toContainText('Press Render')
    await expect(page.locator('#preview iframe')).toHaveCount(0)
    assert.match(await source(), /^# Imported file/)
    const hostile = '# Isolated\n\n<script setup>\nlet result = []\nfor (const read of [() => parent.document, () => parent.localStorage, () => parent.document.cookie]) { try { read(); result.push("escaped") } catch { result.push("blocked") } }\nglobalThis.boundaryResult = result\n</script>\n'
    await page.goto(await build({ src: hostile }))
    await page.waitForSelector('body[data-ready="true"]')
    assert.equal(await page.locator('#preview iframe').getAttribute('sandbox'), 'allow-scripts')
    assert.deepEqual(await page.frames().find(frame => frame.parentFrame()).evaluate(() => globalThis.boundaryResult), ['blocked', 'blocked', 'blocked'])
    for (const viewport of [
      { width: 360, height: 640 },
      { width: 900, height: 400 },
    ]) {
      await page.setViewportSize(viewport)
      await expect(page.getByRole('tab', { name: 'Slides', exact: true })).toHaveAttribute('aria-selected', 'true')
      await expect(page.getByRole('tab', { name: 'Split', exact: true })).toBeHidden()
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
      await page.getByRole('tab', { name: 'Markdown', exact: true }).click()
      await expect(page.locator('#markdown-editor')).toBeVisible()
      await expect(page.locator('#slides-panel')).toBeHidden()
      assert.equal(await page.evaluate(() => globalThis.ace.edit('markdown-editor').getFontSize()), 16)
      await page.getByRole('tab', { name: 'CSS', exact: true }).click()
      await expect(page.locator('#css-editor')).toBeVisible()
      const targets = await page.locator('button:visible').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().height))
      assert.ok(targets.every(height => height >= 40))
      await page.locator('.fk-more').click()
      await expect(page.getByRole('dialog').getByRole('link', { name: 'Syntax', exact: true })).toBeVisible()
      await page.locator('#fk-more-drawer .fk-close').click()
      await page.getByRole('tab', { name: 'Slides', exact: true }).click()
    }
    assert.deepEqual(errors, [])
    process.stdout.write(`${engine}: editor, CSS/extensions, run consent, navigation, share, drafts, CID/QR, isolation and compact layout passed\n`)
  }
  finally { await browser.close() }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
