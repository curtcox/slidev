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
    const requests = []
    let highlighterRequests = 0
    page.on('pageerror', error => errors.push(String(error)))
    page.on('request', (request) => {
      if (request.url().endsWith('/runtime/highlighting/shiki.js'))
        highlighterRequests++
      if (/\/runtime\/grammars\/.*\.json$/.test(request.url()))
        requests.push(new URL(request.url()).pathname.split('/').at(-1))
    })
    const initialize = async () => {
      await page.goto(process.argv[2] || 'http://127.0.0.1:8000/')
      await page.waitForSelector('body[data-ready="true"]')
      await page.evaluate(async () => {
        const { createPreviewBridge } = await import('./src/preview-bridge.js')
        const host = document.createElement('div')
        host.id = 'languages-test'
        document.body.append(host)
        const state = window.languagesTest = { done: false, errors: [] }
        state.bridge = createPreviewBridge({
          container: host,
          onStatus: status => state.done = status === 'rendered',
          onError: message => state.errors.push(message),
        })
      })
    }
    const render = async (src) => {
      await page.evaluate((src) => {
        window.languagesTest.done = false
        window.languagesTest.errors = []
        window.languagesTest.bridge.render({ src })
      }, src)
      await page.waitForFunction(() => window.languagesTest.done || window.languagesTest.errors.length)
      assert.deepEqual(await page.evaluate(() => window.languagesTest.errors), [])
    }
    await initialize()
    assert.deepEqual(requests, [], 'The welcome deck must not load grammars into its sandbox')
    assert.equal(highlighterRequests, 0, 'Slides without code must not import the highlighting engine')
    const source = '# Lazy code\n\n```py\ndef greet(name):\n    return f"Hello {name}"\n```\n\n```python\nprint(42)\n```\n\n```vue\n<script setup lang="ts">const n: number = 1</script>\n<template><div>{{ n }}</div></template>\n```\n\n---\n# Reuse\n\n```py\nprint("reused")\n```'
    await render(source)
    const frame = page.frameLocator('#languages-test iframe')
    assert.equal(await page.locator('#languages-test iframe').getAttribute('sandbox'), 'allow-scripts')
    assert.equal(await frame.locator('.slidev-code').count(), 3)
    assert.ok(await frame.locator('.slidev-code span[style]').count() > 10, 'Code must contain highlighted tokens')
    assert.equal(await frame.locator('#online-notices').count(), 0)
    assert.deepEqual([...requests].sort(), ['python.json', 'vue.json'])
    assert.equal(highlighterRequests, 1, 'Multiple code fences share one engine import')
    await page.evaluate(() => window.languagesTest.bridge.goto(2))
    await frame.getByRole('heading', { name: 'Reuse', exact: true }).waitFor()
    assert.equal(requests.filter(name => name === 'python.json').length, 1)
    assert.equal(highlighterRequests, 1, 'Navigation reuses the loaded engine')

    const beforeUnknown = requests.length
    await render('# Unknown\n\n```not-bundled\nplain code\n```')
    assert.match(await frame.locator('#online-notices').textContent(), /Language not-bundled is unavailable; showing plain text/)
    assert.equal(requests.length, beforeUnknown, 'Unknown languages cannot request URLs')

    await page.waitForFunction(() => document.querySelector('#offline-status').textContent === 'Available offline')
    await context.setOffline(true)
    await initialize()
    await render(source)
    assert.equal(await frame.locator('.slidev-code').count(), 3)
    assert.ok(await frame.locator('.slidev-code span[style]').count() > 10)
    assert.equal(await frame.locator('#online-notices').count(), 0)
    assert.deepEqual(errors, [])
    // Disable the cache in a separate context so this actually exercises a
    // missing asset, rather than successfully reading verified offline bytes.
    const failureContext = await browser.newContext({ serviceWorkers: 'block' })
    const failurePage = await failureContext.newPage()
    await failurePage.route('**/runtime/grammars/python.json', route => route.fulfill({ status: 404, body: 'Unavailable' }))
    await failurePage.goto(process.argv[2] || 'http://127.0.0.1:8000/')
    await failurePage.waitForSelector('body[data-ready="true"]')
    await failurePage.evaluate(async () => {
      const { createPreviewBridge } = await import('./src/preview-bridge.js')
      const host = document.createElement('div')
      host.id = 'failed-language'
      document.body.append(host)
      await new Promise((resolve, reject) => {
        const bridge = createPreviewBridge({
          container: host,
          onStatus: status => status === 'rendered' && resolve(),
          onError: message => reject(new Error(message)),
        })
        bridge.render({ src: '# Missing data\n\n```py\nprint("still readable")\n```' })
      })
    })
    const failedFrame = failurePage.frameLocator('#failed-language iframe')
    assert.match(await failedFrame.locator('#online-notices').textContent(), /Language py is unavailable; showing plain text/)
    assert.match(await failedFrame.locator('.slidev-code').textContent(), /still readable/)

    await failurePage.route('**/runtime/highlighting/shiki.js', route => route.fulfill({ status: 503, body: 'Unavailable' }))
    const tryHighlighter = () => failurePage.evaluate(async () => {
      const { createPreviewBridge } = await import('./src/preview-bridge.js')
      document.querySelector('#failed-highlighter')?.remove()
      const host = document.createElement('div')
      host.id = 'failed-highlighter'
      document.body.append(host)
      return new Promise((resolve) => {
        const bridge = createPreviewBridge({
          container: host,
          onStatus: status => status === 'rendered' && resolve('rendered'),
          onError: message => resolve(message),
        })
        bridge.render({ src: '# Engine recovery\n\n```js\nconst answer = 42\n```' })
      })
    })
    assert.match(await tryHighlighter(), /bundled code highlighter is unavailable/)
    await failurePage.unroute('**/runtime/highlighting/shiki.js')
    assert.equal(await tryHighlighter(), 'rendered')
    assert.ok(await failurePage.frameLocator('#failed-highlighter iframe').locator('.slidev-code span[style]').count() > 0)
    await failureContext.close()
    process.stdout.write(`${engine}: lazy engine/grammars, aliases, embedded Vue languages, cache reuse, failure recovery and offline reload passed\n`)
    await context.close()
  }
  finally { await browser.close() }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
