const assert = require('node:assert/strict')
const process = require('node:process')
const { expect } = require('@playwright/test')
const { chromium, firefox, webkit } = require('playwright')

async function main() {
  const engine = process.argv[3] || process.env.BROWSER || 'chromium'
  const browser = await ({ chromium, firefox, webkit })[engine].launch()
  try {
    const context = await browser.newContext()
    const page = await context.newPage()
    const errors = []
    const requests = []
    page.on('pageerror', error => errors.push(String(error)))
    page.on('request', (request) => {
      const asset = request.url().match(/\/runtime\/math\/(katex\.(?:css|js))$/)?.[1]
      if (asset)
        requests.push(asset)
    })
    const initialize = async () => {
      await page.goto(process.argv[2] || 'http://127.0.0.1:8000/')
      await page.waitForSelector('body[data-ready="true"]')
      await page.evaluate(async () => {
        const { createPreviewBridge } = await import('./src/preview-bridge.js')
        const host = document.createElement('div')
        host.id = 'math-test'
        document.body.append(host)
        const state = window.mathTest = { done: false, errors: [] }
        state.bridge = createPreviewBridge({
          container: host,
          onStatus: status => state.done = status === 'rendered',
          onPosition: position => state.slide = position.slide,
          onError: message => state.errors.push(message),
        })
      })
    }
    const source = String.raw`# Introduction

The equations are on the next slide.

---

# Equations

Inline $E = mc^2$.

$$ {1|2|all}
\begin{aligned}
a &= b + c \\
x &= y + z
\end{aligned}
$$

---

# More math

$\int_0^1 x^2\,dx = \frac{1}{3}$
`
    const render = async () => {
      await page.evaluate(src => window.mathTest.bridge.render({ src }), source)
      await page.waitForFunction(() => window.mathTest.done || window.mathTest.errors.length)
      assert.deepEqual(await page.evaluate(() => window.mathTest.errors), [])
    }
    const verify = async () => {
      const frame = page.frameLocator('#math-test iframe')
      assert.equal(await page.locator('#math-test iframe').getAttribute('sandbox'), 'allow-scripts')
      await page.evaluate(() => window.mathTest.bridge.goto(2))
      await page.waitForFunction(() => window.mathTest.slide === 2 || window.mathTest.errors.length)
      assert.deepEqual(await page.evaluate(() => window.mathTest.errors), [])
      await frame.getByRole('heading', { name: 'Equations', exact: true }).waitFor()
      assert.equal(await frame.locator('.katex').count(), 2)
      assert.equal(await frame.locator('#online-notices').count(), 0)
      assert.ok(await frame.locator('.katex .dishonored').count() > 0)
      assert.equal(await frame.locator('.katex-mathml').first().evaluate(el => getComputedStyle(el).position), 'absolute')
      assert.equal(await frame.locator('body').evaluate(async () => {
        await document.fonts.ready
        const fonts = [...document.fonts].filter(font => font.status === 'loaded')
        return fonts.some(font => font.family.replaceAll('"', '') === 'KaTeX_Main')
      }), true, 'Bundled fonts must actually load in the opaque frame')
      const before = await frame.locator('.katex .dishonored').first().textContent()
      await page.evaluate(() => window.mathTest.bridge.goto(2, 1))
      await expect(frame.locator('.katex .dishonored').first()).not.toHaveText(before)
      await page.evaluate(() => window.mathTest.bridge.goto(3))
      await frame.getByRole('heading', { name: 'More math', exact: true }).waitFor()
      assert.equal(await frame.locator('#online-notices').count(), 0)
    }
    await initialize()
    assert.deepEqual(requests, [], 'The welcome deck must not load math assets')
    await render()
    assert.deepEqual(requests, [], 'A plain slide must not load math assets for later slides')
    await verify()
    assert.deepEqual(requests, ['katex.js', 'katex.css'], 'Later math slides must reuse the renderer and stylesheet')
    await page.waitForFunction(() => document.querySelector('#offline-status').textContent === 'Available offline')
    await context.setOffline(true)
    await initialize()
    await render()
    await verify()
    assert.deepEqual(errors, [])
    await page.evaluate(() => {
      window.mathTest.done = false
      window.mathTest.errors = []
      window.mathTest.bridge.render({ src: '# Contents\n\n<Toc />\n\n---\n\n# $E = mc^2$' })
    })
    await page.waitForFunction(() => window.mathTest.done || window.mathTest.errors.length)
    assert.deepEqual(await page.evaluate(() => window.mathTest.errors), [])
    const titles = page.frameLocator('#math-test iframe')
    assert.equal(await titles.locator('.katex').count(), 1, 'The plain contents slide must render its math title')
    assert.equal(await titles.locator('#online-math-css').count(), 1, 'Math in TOC titles must load its stylesheet in a fresh frame')
    assert.equal(await titles.locator('.katex-mathml').evaluate(el => getComputedStyle(el).position), 'absolute')
    await context.close()
    const failureContext = await browser.newContext({ serviceWorkers: 'block' })
    const failurePage = await failureContext.newPage()
    let rendererUnavailable = true
    await failurePage.route('**/runtime/math/katex.js', route => rendererUnavailable
      ? route.fulfill({ status: 404, body: 'Unavailable' })
      : route.continue())
    await failurePage.route('**/runtime/math/katex.css', route => route.fulfill({ status: 404, body: 'Unavailable' }))
    await failurePage.goto(process.argv[2] || 'http://127.0.0.1:8000/')
    await failurePage.waitForSelector('body[data-ready="true"]')
    await failurePage.evaluate(async () => {
      const { createPreviewBridge } = await import('./src/preview-bridge.js')
      const host = document.createElement('div')
      host.id = 'missing-math'
      document.body.append(host)
      window.renderMissingMath = () => new Promise((resolve, reject) => {
        createPreviewBridge({
          container: host,
          onStatus: s => s === 'rendered' && resolve(),
          onError: message => reject(new Error(message)),
        }).render({ src: '# Still readable\n\n$x^2$' })
      })
    })
    await assert.rejects(failurePage.evaluate(() => window.renderMissingMath()), /bundled KaTeX renderer is unavailable/)
    await expect(failurePage.locator('#missing-math iframe')).toHaveCount(0)
    rendererUnavailable = false
    await failurePage.evaluate(() => window.renderMissingMath())
    assert.match(await failurePage.frameLocator('#missing-math iframe').locator('#online-notices').textContent(), /Math styles and fonts are unavailable/)
    await failureContext.close()
    process.stdout.write(`${engine}: lazy math renderer and styles, bundled fonts, equation click ranges, reuse, TOC title styles, visible failure and offline reload passed\n`)
  }
  finally { await browser.close() }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
