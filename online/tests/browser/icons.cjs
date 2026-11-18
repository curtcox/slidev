const assert = require('node:assert/strict')
const process = require('node:process')
const { chromium, firefox, webkit } = require('playwright')

async function main() {
  const engine = process.argv[3] || process.env.BROWSER || 'chromium'
  const browser = await ({ chromium, firefox, webkit })[engine].launch()
  try {
    const context = await browser.newContext({
      viewport: { width: 1100, height: 900 },
    })
    const page = await context.newPage()
    const errors = []
    const requests = []
    page.on('pageerror', error => errors.push(String(error)))
    page.on('request', (request) => {
      if (request.url().includes('/runtime/icons/'))
        requests.push(new URL(request.url()).pathname.split('/').at(-1))
    })
    await page.goto(process.argv[2] || 'http://127.0.0.1:8000/')
    await page.waitForSelector('body[data-ready="true"]')
    assert.deepEqual(requests, [], 'A deck without icons must not load an icon collection into the sandbox')
    await page.evaluate(async () => {
      const { createPreviewBridge } = await import('./src/preview-bridge.js')
      const host = document.createElement('div')
      host.id = 'icons-test'
      host.style.cssText = 'position:fixed;inset:0;background:white;z-index:10000'
      document.body.append(host)
      const test = window.iconsTest = { done: false, errors: [] }
      test.bridge = createPreviewBridge({
        container: host,
        onStatus: state => test.done = state === 'rendered',
        onError: message => test.errors.push(message),
      })
    })
    const render = async (src) => {
      await page.evaluate((src) => {
        window.iconsTest.done = false
        window.iconsTest.errors = []
        window.iconsTest.bridge.render({ src })
      }, src)
      await page.waitForFunction(() => window.iconsTest.done || window.iconsTest.errors.length)
      assert.deepEqual(await page.evaluate(() => window.iconsTest.errors), [])
    }
    const icons = [
      'carbon:arrow-right',
      'ph:heart',
      'mdi:home',
      'logos:vue',
      'simple-icons:github',
      'twemoji:rocket',
      'svg-spinners:ring-resize',
    ]
    const source = `# Bundled icons\n\n<div>\n${icons.map(name => `<${name} class="text-3xl" />`).join('\n')}\n<carbon-arrow-right />\n<carbon-arrow-right />\n</div>\n\n---\n# Reused <carbon-arrow-right />\n\n<Toc />`
    await render(source)
    let frame = page.frameLocator('#icons-test iframe')
    assert.equal(await page.locator('#icons-test iframe').getAttribute('sandbox'), 'allow-scripts')
    assert.equal(await frame.locator('svg[data-online-icon]').count(), 9, await frame.locator('body').innerHTML())
    for (const name of icons) {
      const svg = frame.locator(`svg[data-online-icon="${name}"]`).first()
      assert.ok(await svg.getAttribute('viewBox'))
      assert.ok(await svg.locator('*').count())
      assert.equal(await svg.getAttribute('aria-hidden'), 'true')
    }
    assert.equal(await frame.locator('#online-notices').count(), 0)
    for (const name of icons.map(name => `${name.split(':')[0]}.json`))
      assert.equal(requests.filter(request => request === name).length, 1, `${name} must be loaded once per frame`)
    await page.evaluate(() => window.iconsTest.bridge.goto(2))
    await frame.getByRole('heading', { name: 'Reused', exact: true }).waitFor()
    assert.equal(await frame.locator('svg[data-online-icon="carbon:arrow-right"]').count(), 2)
    assert.equal(requests.filter(request => request === 'carbon.json').length, 1)

    await render('# Aliases and SVG definitions\n<div>\n<carbon-app-switcher />\n<mdi-123 />\n<logos-firefox />\n<logos-firefox />\n</div>')
    frame = page.frameLocator('#icons-test iframe')
    assert.equal(await frame.locator('svg[data-online-icon]').count(), 4)
    assert.equal(await frame.locator('#online-notices').count(), 0)
    const ids = await frame.locator('svg [id]').evaluateAll(elements => elements.map(element => element.id))
    assert.ok(ids.length > 0, 'Gradient icon exercises SVG ID rewriting')
    assert.equal(new Set(ids).size, ids.length, 'Repeated gradient icons must have unique definition IDs')

    await render(`# Imported icon\n<Imported />\n<script setup>import Imported from '~icons/carbon/arrow-right'</script>`)
    frame = page.frameLocator('#icons-test iframe')
    assert.equal(await frame.locator('svg[data-online-icon="carbon:arrow-right"]').count(), 1)
    assert.equal(await frame.locator('#online-notices').count(), 0)
    const beforeUnknown = requests.length
    await render('# Missing icons\n<div>\n<carbon-not-a-real-icon />\n<not-bundled:unknown />\n</div>')
    frame = page.frameLocator('#icons-test iframe')
    assert.equal(await frame.locator('.online-icon-missing').count(), 2)
    assert.match(await frame.locator('#online-notices').textContent(), /Icon carbon-not-a-real-icon is unavailable online/)
    assert.match(await frame.locator('#online-notices').textContent(), /Collection is not bundled/)
    assert.equal(requests.length, beforeUnknown + 1, 'Unknown collections must never trigger a fetch')
    const missingImport = `<Missing />\n<script setup>import Missing from '~icons/not-bundled/unknown'</script>`
    await render(`# Missing import\n${missingImport}\n---\n# Reused missing import\n${missingImport}`)
    frame = page.frameLocator('#icons-test iframe')
    assert.equal(await frame.locator('.online-icon-missing').count(), 1)
    assert.match(await frame.locator('#online-notices').textContent(), /Collection is not bundled/)
    await page.evaluate(() => window.iconsTest.bridge.goto(2))
    await frame.getByRole('heading', { name: 'Reused missing import' }).waitFor()
    assert.equal(await frame.locator('.online-icon-missing').count(), 1)
    assert.match(await frame.locator('#online-notices').textContent(), /Collection is not bundled/)

    await page.waitForFunction(() => document.querySelector('#offline-status').textContent === 'Available offline')
    await context.setOffline(true)
    await page.reload()
    await page.waitForSelector('body[data-ready="true"]')
    await page.evaluate(async (source) => {
      const { createPreviewBridge } = await import('./src/preview-bridge.js')
      const host = document.createElement('div')
      host.id = 'offline-icons'
      document.body.append(host)
      await new Promise((resolve, reject) => {
        window.offlineIcons = createPreviewBridge({
          container: host,
          onStatus: state => state === 'rendered' && resolve(),
          onError: message => reject(new Error(message)),
        })
        window.offlineIcons.render({ src: source })
      })
    }, source)
    assert.equal(await page.frameLocator('#offline-icons iframe').locator('svg[data-online-icon]').count(), 9)
    assert.equal(await page.frameLocator('#offline-icons iframe').locator('#online-notices').count(), 0)
    assert.deepEqual(errors, [])
    process.stdout.write(`${engine}: seven lazy icon collections, aliases, imports, TOC titles, cache reuse, missing-icon placeholders and fully offline reload passed\n`)
    await context.close()
  }
  finally { await browser.close() }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
