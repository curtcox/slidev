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
    assert.deepEqual(errors, [])
    process.stdout.write(`${engine}: welcome deck, opaque boundary and offline reload passed\n`)
    await context.close()
  }
  finally { await browser.close() }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
