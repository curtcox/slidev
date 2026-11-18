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
    page.on('pageerror', error => errors.push(String(error)))
    page.on('request', request => /\/runtime\/diagrams\/mermaid.js$/.test(request.url()) && requests.push(request.url()))
    const initialize = async () => {
      await page.goto(process.argv[2] || 'http://127.0.0.1:8016/')
      await page.waitForSelector('body[data-ready="true"]')
      await page.evaluate(async () => {
        const { createPreviewBridge } = await import('./src/preview-bridge.js')
        const host = document.createElement('div')
        host.id = 'diagrams-test'
        document.body.append(host)
        const state = window.diagramsTest = { done: false, errors: [], position: 0 }
        state.bridge = createPreviewBridge({
          container: host,
          onStatus: status => state.done = status === 'rendered',
          onError: message => state.errors.push(message),
          onPosition: position => state.position = position.slide,
        })
      })
    }
    const source = '# Diagrams\n\n```mermaid {scale: 0.7}\ngraph LR\n A[Author] --> B[Preview]\n```\n\n```mermaid {theme: \'dark\', scale: 0.5}\ngraph LR\n C[Dark] --> D[Diagram]\n```\n\n---\n\n# Sequence\n\n```mermaid\nsequenceDiagram\n Alice->>Bob: Hello\n Bob-->>Alice: Hi\n```\n\n---\n\n# Pie\n\n```mermaid\npie title Pets\n "Dogs" : 3\n "Cats" : 2\n```\n\n---\n\n# Invalid\n\n```mermaid\nthis is not a diagram\n```\n\n---\n\n# Recovered\n\n```mermaid\nflowchart TB\n Start --> Finish\n```'
    const render = async (src = source, dark = false) => {
      await page.evaluate(({ src, dark }) => {
        window.diagramsTest.done = false
        window.diagramsTest.errors = []
        window.diagramsTest.bridge.render({ src, dark })
      }, { src, dark })
      await page.waitForFunction(() => window.diagramsTest.done || window.diagramsTest.errors.length)
      assert.deepEqual(await page.evaluate(() => window.diagramsTest.errors), [])
    }
    const frame = page.frameLocator('#diagrams-test iframe')
    const goto = async (slide) => {
      await page.evaluate(slide => window.diagramsTest.bridge.goto(slide), slide)
      await page.waitForFunction(slide => window.diagramsTest.position === slide, slide)
    }
    const verify = async () => {
      assert.equal(await page.locator('#diagrams-test iframe').getAttribute('sandbox'), 'allow-scripts')
      await frame.locator('.mermaid svg').nth(1).waitFor()
      assert.equal(await frame.locator('.mermaid svg').count(), 2)
      assert.match(await frame.locator('.mermaid svg').first().textContent(), /Author/)
      assert.equal(await frame.locator('#online-notices').count(), 0)
      const background = await frame.locator('.mermaid').nth(1).locator('svg .node rect').first().evaluate(el => getComputedStyle(el).fill)
      assert.notEqual(background, await frame.locator('.mermaid').first().locator('svg .node rect').first().evaluate(el => getComputedStyle(el).fill), 'Concurrent diagrams must keep their own theme')
      assert.equal(await frame.locator('.mermaid svg').first().getAttribute('width'), null, 'The upstream scale prop removes SVG width')
      await goto(2)
      await frame.locator('.mermaid svg').waitFor()
      assert.match(await frame.locator('.mermaid svg').textContent(), /Alice.*Bob/s)
      await goto(3)
      await frame.locator('.mermaid svg').waitFor()
      assert.match(await frame.locator('.mermaid svg').textContent(), /Dogs.*Cats/s)
      await goto(4)
      await frame.locator('pre').waitFor()
      assert.match(await frame.locator('pre').textContent(), /UnknownDiagramError|No diagram type detected/)
      await goto(5)
      await frame.locator('.mermaid svg').waitFor()
      assert.match(await frame.locator('.mermaid svg').textContent(), /Finish/)
    }
    await initialize()
    assert.equal(requests.length, 0, 'Plain slides must not load the diagram renderer')
    await render()
    await verify()
    assert.equal(requests.length, 1, 'One standalone module is reused across diagram types')
    await render('# Dark mode\n\n```mermaid\ngraph LR\n A --> B\n```', true)
    await frame.locator('.mermaid svg').waitFor()
    assert.equal(await frame.locator('html').getAttribute('class'), 'dark')
    await page.waitForFunction(() => document.querySelector('#offline-status').textContent === 'Available offline')
    await context.setOffline(true)
    await initialize()
    await render()
    await verify()
    assert.deepEqual(errors, [])
    await context.close()
    const failureContext = await browser.newContext({ serviceWorkers: 'block' })
    const failurePage = await failureContext.newPage()
    await failurePage.route('**/runtime/diagrams/mermaid.js', route => route.fulfill({ status: 404, body: 'Unavailable' }))
    await failurePage.goto(process.argv[2] || 'http://127.0.0.1:8016/')
    await failurePage.waitForSelector('body[data-ready="true"]')
    await failurePage.evaluate(async () => {
      const { createPreviewBridge } = await import('./src/preview-bridge.js')
      const host = document.createElement('div')
      host.id = 'missing-diagram'
      document.body.append(host)
      const bridge = createPreviewBridge({
        container: host,
        onStatus() {},
      })
      bridge.render({ src: '# Missing renderer\n\n```mermaid\ngraph LR\n A --> B\n```' })
    })
    assert.match(await failurePage.frameLocator('#missing-diagram iframe').locator('pre').textContent(), /bundled Mermaid renderer is unavailable/)
    await failureContext.close()
    process.stdout.write(`${engine}: lazy diagrams, concurrent themes, scale, sequence, pie, visible errors, recovery, dark mode and offline reload passed\n`)
  }
  finally { await browser.close() }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
