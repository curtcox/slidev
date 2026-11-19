const assert = require('node:assert/strict')
const process = require('node:process')
const { expect } = require('@playwright/test')
const { chromium, firefox, webkit } = require('playwright')

async function main() {
  const engine = process.argv[3] || process.env.BROWSER || 'chromium'
  const base = new URL(process.argv[2] || 'http://127.0.0.1:8000/')
  const browser = await ({ chromium, firefox, webkit })[engine].launch()
  const context = await browser.newContext({ serviceWorkers: 'block' })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(String(error)))
  try {
    await page.goto(new URL('gallery.html', base).href)
    await expect(page.locator('.fk-gallery-card')).toHaveCount(15)
    assert.equal(await page.locator('iframe').count(), 0, 'Browsing examples must not execute deck code')
    for (const image of await page.locator('.fk-gallery-card img').all()) {
      await image.evaluate(image => image.decode())
      assert.ok(await image.evaluate(image => image.naturalWidth > 0))
    }
    const search = page.getByRole('searchbox', { name: 'Search examples' })
    await search.fill('no matching example')
    await expect(page.locator('.fk-gallery-card')).toHaveCount(0)
    await search.fill('magic')
    await expect(page.locator('.fk-gallery-card')).toHaveCount(1)
    await search.fill('')
    await page.getByRole('combobox', { name: 'Filter by tag' }).selectOption('themes')
    await expect(page.locator('.fk-gallery-card')).toHaveCount(5)
    await page.getByRole('link', { name: 'Open seriph theme', exact: true }).click()
    await page.waitForSelector('body[data-ready="true"]')
    assert.equal(new URL(page.url()).pathname, base.pathname)
    await expect(page.frameLocator('#preview iframe').locator('h1')).toHaveText('The seriph theme')
    assert.equal(await page.locator('#preview iframe').getAttribute('sandbox'), 'allow-scripts')
    assert.equal(await page.frames().find(frame => frame.parentFrame()).evaluate(() => globalThis.origin), 'null')
    await page.goto(new URL('?example=interactivity&run=0', base).href)
    await page.waitForSelector('body[data-editor-ready="true"]')
    await expect(page.locator('#preview iframe')).toHaveCount(0)
    await page.locator('#render').click()
    await page.frameLocator('#preview iframe').getByRole('button', { name: 'Votes: 0' }).click()
    await expect(page.frameLocator('#preview iframe').getByRole('button', { name: 'Votes: 1' })).toBeVisible()
    for (const name of [
      'index',
      'supported',
      'sharing',
      'ai',
      'themes',
      'fonts',
      'plantuml',
    ]) {
      await page.goto(new URL(`docs/${name}.html`, base).href)
      await expect(page.locator('main h1')).toHaveCount(1)
      for (const href of await page.locator('main a').evaluateAll(links => links.map(link => link.href))) {
        const target = new URL(href)
        if (target.origin === base.origin) {
          assert.ok(!target.pathname.endsWith('.md'), `Docs must link to rendered HTML: ${href}`)
          const response = await context.request.get(href)
          assert.ok(response.ok(), `Broken docs link: ${href}`)
        }
      }
    }
    await page.setViewportSize({ width: 360, height: 740 })
    await page.goto(new URL('gallery.html', base).href)
    await expect(page.locator('.fk-gallery-card')).toHaveCount(15)
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Gallery must fit a phone')
    for (const control of [
      search,
      page.getByRole('combobox', { name: 'Filter by tag' }),
    ]) {
      assert.ok((await control.boundingBox()).height >= 40)
      assert.ok(await control.evaluate(node => Number.parseFloat(getComputedStyle(node).fontSize) >= 16))
    }
    assert.deepEqual(errors, [])
    process.stdout.write(`${engine}: gallery covers, filters, local links, opaque interaction, deferred rendering, docs links and phone layout passed\n`)
  }
  finally { await browser.close() }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
