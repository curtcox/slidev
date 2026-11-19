const assert = require('node:assert/strict')
const process = require('node:process')
const { chromium, firefox, webkit } = require('playwright')

async function main() {
  const engine = process.argv[3] || process.env.BROWSER || 'chromium'
  const browser = await ({ chromium, firefox, webkit })[engine].launch()
  try {
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(String(error)))
    await page.goto(process.argv[2] || 'http://127.0.0.1:8000/')
    await page.waitForSelector('body[data-ready="true"]')
    const originalFrame = page.frames().find(frame => frame.parentFrame())
    await originalFrame.evaluate(() => {
      globalThis.livePreviewMarker = 42
    })
    const result = await page.evaluate(async () => {
      const { checkSlidevProposal } = await import('./src/ai-check.js')
      const checks = []
      const observer = new MutationObserver(() => {
        for (const frame of document.querySelectorAll('[data-ai-check] iframe'))
          checks.push(frame.getAttribute('sandbox'))
      })
      observer.observe(document.body, { childList: true, subtree: true })
      const good = await checkSlidevProposal({
        document: {
          src: '# Safe\n\n<script setup>globalThis.authorRan = true; throw new Error("Do not execute")</script>\n\n---\n\n# Second',
          slidev: { css: 'h1 { color: red }' },
        },
      })
      const bad = await checkSlidevProposal({
        document: {
          src: '# First\n\n---\n\n# Second\n<script setup>const broken = </script>\n\n---\n\n# Third\n<style scoped>h1 {</style>',
          slidev: { css: 'h1 {' },
        },
      })
      const controller = new AbortController()
      const pending = checkSlidevProposal({
        document: { src: '# Abort' },
        signal: controller.signal,
      })
      controller.abort(new Error('Cancelled check'))
      let cancelled
      try {
        await pending
      }
      catch (error) { cancelled = error.message }
      observer.disconnect()
      return {
        good,
        bad,
        cancelled,
        checks,
        remaining: document.querySelectorAll('[data-ai-check]').length,
        authorRan: globalThis.authorRan,
      }
    })
    assert.equal(result.good.slides, 2)
    assert.deepEqual(result.good.errors, [])
    assert.ok(result.bad.errors.some(error => error.slide === 2), JSON.stringify(result.bad))
    assert.ok(result.bad.errors.some(error => error.slide === 3), JSON.stringify(result.bad))
    assert.ok(result.bad.errors.some(error => error.file === 'style.css'), JSON.stringify(result.bad))
    assert.equal(result.cancelled, 'Cancelled check')
    assert.ok(result.checks.length >= 2)
    assert.ok(result.checks.every(flags => flags === 'allow-scripts'))
    assert.equal(result.remaining, 0)
    assert.equal(result.authorRan, undefined)
    assert.equal(await originalFrame.evaluate(() => globalThis.livePreviewMarker), 42)
    assert.deepEqual(errors, [])
    process.stdout.write(`${engine}: fresh opaque AI checks, every-slide diagnostics, CSS errors, no author evaluation, cancellation and live preview isolation passed\n`)
  }
  finally { await browser.close() }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
