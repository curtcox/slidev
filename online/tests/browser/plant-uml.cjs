const assert = require('node:assert/strict')
const process = require('node:process')
const { chromium, firefox, webkit, expect } = require('@playwright/test')

// No diagram text is sent to an external service by this acceptance suite.
const server = 'https://www.plantuml.com/plantuml/svg/'
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="80"><text x="10" y="30">Alice to Bob</text></svg>'
const source = '# Diagrams\n\n```plantuml {scale: 0.7, alt: \'A conversation\'}\n@startuml\nAlice -> Bob: Hello\n@enduml\n```\n\n```plantuml\n@startuml\nBob -> Carol: Hi\n@enduml\n```\n\n---\n\n# Later diagram\n\n```plantuml\n@startuml\nCarol -> Dave: Later\n@enduml\n```'

async function main() {
  const engine = process.argv[3] || process.env.BROWSER || 'chromium'
  const browser = await ({ chromium, firefox, webkit })[engine].launch()
  try {
    const context = await browser.newContext()
    const page = await context.newPage()
    const errors = []
    const requests = []
    let fail = false
    page.on('pageerror', error => errors.push(String(error)))
    await context.route(`${server}**`, async (route) => {
      requests.push({
        url: route.request().url(),
        headers: await route.request().allHeaders(),
      })
      if (fail)
        await route.abort('internetdisconnected')
      else
        await route.fulfill({ contentType: 'image/svg+xml', body: svg })
    })
    const initialize = async () => {
      await page.goto(process.argv[2] || 'http://127.0.0.1:8016/')
      await page.waitForSelector('body[data-ready="true"]')
      await page.evaluate(async () => {
        const { createPreviewBridge } = await import('./src/preview-bridge.js')
        const host = document.createElement('div')
        host.id = 'plantuml-test'
        document.body.append(host)
        const state = window.plantumlTest = { done: false, errors: [], position: 0 }
        state.bridge = createPreviewBridge({
          container: host,
          onStatus: status => state.done = status === 'rendered',
          onError: message => state.errors.push(message),
          onPosition: position => state.position = position.slide,
        })
      })
    }
    const frame = page.frameLocator('#plantuml-test iframe')
    const render = async (src = source) => {
      await page.evaluate((src) => {
        window.plantumlTest.done = false
        window.plantumlTest.errors = []
        window.plantumlTest.bridge.render({ src })
      }, src)
      await page.waitForFunction(() => window.plantumlTest.done || window.plantumlTest.errors.length)
      assert.deepEqual(await page.evaluate(() => window.plantumlTest.errors), [])
    }
    const consent = () => frame.getByRole('button', { name: 'Enable PlantUML for this deck' }).first()
    const images = () => frame.locator('.online-plantuml img')
    const goto = async (slide) => {
      await page.evaluate(slide => window.plantumlTest.bridge.goto(slide), slide)
      await page.waitForFunction(slide => window.plantumlTest.position === slide, slide)
    }

    await initialize()
    await render()
    assert.equal(await page.locator('#plantuml-test iframe').getAttribute('sandbox'), 'allow-scripts')
    assert.equal(requests.length, 0, 'Opening a deck never enables PlantUML')
    assert.equal(await images().count(), 0)
    assert.match(await frame.locator('pre').first().textContent(), /Alice -> Bob: Hello/)
    assert.match(await frame.locator('.online-plantuml').first().textContent(), /sends this deck’s diagram text to plantuml.com/)
    await consent().dispatchEvent('click')
    assert.equal(await images().count(), 0, 'A synthetic click must not enable remote rendering')
    await goto(2)
    await expect(consent()).toBeVisible()
    assert.equal(requests.length, 0, 'Navigation never grants permission')
    await goto(1)
    // A consent click updates diagram state without evaluating the slide again.
    await render(source.replace('# Diagrams', '# Diagrams\n\n<script setup>\nglobalThis.plantUmlAuthorRuns = (globalThis.plantUmlAuthorRuns || 0) + 1\n</script>'))
    const authorRuns = await frame.locator('body').evaluate(() => globalThis.plantUmlAuthorRuns)
    assert.equal(authorRuns, 1)
    await consent().click()
    await expect(images()).toHaveCount(2)
    await expect(frame.locator('.online-plantuml [role="status"]')).toHaveCount(0)
    assert.equal(requests.length, 2, 'One click enables all diagrams in this deck')
    assert.equal(await images().first().getAttribute('alt'), 'A conversation')
    assert.equal(await images().first().evaluate(element => element.style.scale), '0.7')
    assert.equal(await frame.locator('pre').count(), 0)
    assert.equal(await frame.locator('body').evaluate(() => globalThis.plantUmlAuthorRuns), authorRuns)
    for (const request of requests) {
      assert.match(request.url, /^https:\/\/www\.plantuml\.com\/plantuml\/svg\/[\w-]+$/)
      assert.equal(request.headers.referer, undefined, 'The document URL must not accompany diagram text')
    }
    await goto(2)
    await expect(images()).toHaveCount(1)
    await expect(frame.locator('.online-plantuml [role="status"]')).toHaveCount(0)
    assert.equal(await consent().count(), 0, 'Permission lasts across navigation')

    // Replacing the frame resets consent, even for identical document bytes.
    await render()
    await expect(consent()).toBeVisible()
    assert.equal(await images().count(), 0)
    const beforeCustom = requests.length
    await render(`---\nplantUmlServer: https://example.com/private\n---\n${source}`)
    assert.match(await frame.locator('.online-plantuml').first().textContent(), /Custom PlantUML servers are unavailable/)
    assert.equal(await consent().count(), 0)
    assert.equal(requests.length, beforeCustom)

    // Direct built-in use and its import use the same consent component.
    for (const src of [
      '# Direct component\n\n<PlantUml code="abc" />',
      '# Imported component\n\n<Diagram code="abc" />\n\n<script setup>\nimport Diagram from "@slidev/client/builtin/PlantUml.vue"\n</script>',
    ]) {
      await render(src)
      await expect(consent()).toBeVisible()
      assert.equal(requests.length, beforeCustom)
    }

    await render()
    fail = true
    await consent().click()
    await expect(frame.getByRole('button', { name: 'Retry diagram' })).toHaveCount(2)
    assert.match(await frame.locator('pre').first().textContent(), /Alice -> Bob: Hello/)
    fail = false
    await frame.getByRole('button', { name: 'Retry diagram' }).first().click()
    await expect(frame.getByRole('button', { name: 'Retry diagram' })).toHaveCount(1)

    await page.waitForFunction(() => document.querySelector('#offline-status').textContent === 'Available offline')
    await page.waitForFunction(() => navigator.serviceWorker.controller)
    // Firefox's intercepted network channel bypasses offline SW navigation.
    // Remove the mock so this section exercises real offline image failures.
    await context.unroute(`${server}**`)
    const offlineRequests = []
    page.on('request', request => request.url().startsWith(server) && offlineRequests.push(request.url()))
    await context.setOffline(true)
    await initialize()
    await render()
    await expect(consent()).toBeVisible()
    assert.equal(offlineRequests.length, 0, 'Offline reload must not remember remote consent')
    await consent().click()
    await expect(frame.getByRole('button', { name: 'Retry diagram' })).toHaveCount(2)
    assert.ok(offlineRequests.length > 0, 'The enabled diagrams must attempt real offline requests')
    assert.match(await frame.locator('pre').first().textContent(), /Alice -> Bob: Hello/)
    assert.deepEqual(errors, [])
    await context.close()
    process.stdout.write(`${engine}: PlantUML consent, trusted clicks, shared permission, reset, options, custom-server rejection, direct/imported components, retry and offline fallback passed (mocked service)\n`)
  }
  finally { await browser.close() }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
