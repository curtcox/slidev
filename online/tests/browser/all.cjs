const assert = require('node:assert/strict')
const process = require('node:process')
const { chromium, firefox, webkit } = require('playwright')

async function main() {
  const engine = process.argv[3] || process.env.BROWSER || 'chromium'
  const browser = await ({ chromium, firefox, webkit })[engine].launch()
  try {
    const context = await browser.newContext()
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(String(error)))
    await page.goto(process.argv[2] || 'http://127.0.0.1:8000/')
    await page.waitForSelector('body[data-ready="true"]')
    assert.equal(await page.locator('#preview iframe').getAttribute('sandbox'), 'allow-scripts')
    const frame = page.frames().find(frame => frame.parentFrame())
    assert.ok(frame)
    assert.match(await frame.locator('h1').textContent(), /Hello, Slidev/)
    assert.equal(await frame.evaluate(() => globalThis.origin), 'null')
    assert.equal(await frame.evaluate(() => {
      try {
        return Boolean(parent.document)
      }
      catch { return false }
    }), false)
    await page.waitForFunction(() => document.querySelector('#offline-status').textContent === 'Available offline')
    await context.setOffline(true)
    await page.reload()
    await page.waitForSelector('body[data-ready="true"]')
    assert.match(await page.frameLocator('#preview iframe').locator('h1').textContent(), /Hello, Slidev/)
    await page.evaluate(async () => {
      const { createPreviewBridge } = await import('./src/preview-bridge.js')
      const host = document.createElement('div')
      host.id = 'offline-theme-test'
      document.body.append(host)
      await new Promise((resolve, reject) => {
        window.offlineThemeBridge = createPreviewBridge({
          container: host,
          onStatus: state => state === 'rendered' && resolve(),
          onError: message => reject(new Error(message)),
        })
        window.offlineThemeBridge.render({ src: '---\ntheme: seriph\nlayout: fact\n---\n# Offline seriph' })
      })
    })
    assert.equal(await page.frameLocator('#offline-theme-test iframe').locator('h1').textContent(), 'Offline seriph')
    assert.equal(await page.frameLocator('#offline-theme-test iframe').locator('h1').evaluate(element => getComputedStyle(element).fontSize), '96px')
    await page.goto(new URL('gallery.html', process.argv[2] || 'http://127.0.0.1:8000/').href)
    await page.waitForSelector('.fk-gallery-card')
    assert.equal(await page.locator('.fk-gallery-card').count(), 15)
    for (const image of await page.locator('.fk-gallery-card img').all())
      await image.evaluate(image => image.decode())
    await page.getByRole('searchbox', { name: 'Search examples' }).fill('responds')
    await page.getByRole('link', { name: 'Open A slide that responds', exact: true }).click()
    await page.waitForSelector('body[data-ready="true"]')
    await page.frameLocator('#preview iframe').getByRole('button', { name: 'Votes: 0' }).click()
    await page.frameLocator('#preview iframe').getByRole('button', { name: 'Votes: 1' }).waitFor()
    assert.deepEqual(errors, [])
    process.stdout.write(`${engine}: welcome deck, opaque boundary, offline reload, offline seriph theme and offline gallery interaction passed\n`)
    await context.close()
  }
  finally { await browser.close() }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
