const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const process = require('node:process')
const { chromium, firefox, webkit } = require('playwright')

async function main() {
  const engine = process.argv[3] || process.env.BROWSER || 'chromium'
  const browser = await ({ chromium, firefox, webkit })[engine].launch()
  try {
    const context = await browser.newContext()
    const page = await context.newPage()
    const errors = []
    const remote = []
    const bundled = []
    page.on('pageerror', error => errors.push(String(error)))
    page.on('request', (request) => {
      if (/^https:\/\/fonts\./.test(request.url()))
        remote.push(request.url())
      if (/\/runtime\/fonts\/.*\.css$/.test(request.url()))
        bundled.push(request.url())
    })
    const initialize = async () => {
      await page.goto(process.argv[2] || 'http://127.0.0.1:8000/')
      await page.waitForSelector('body[data-ready="true"]')
      await page.evaluate(async () => {
        const { createPreviewBridge } = await import('./src/preview-bridge.js')
        const host = document.createElement('div')
        host.id = 'font-test'
        document.body.append(host)
        const state = window.fontTest = { done: false, errors: [] }
        state.bridge = createPreviewBridge({
          container: host,
          onStatus: status => state.done = status === 'rendered',
          onError: message => state.errors.push(message),
        })
      })
    }
    const render = async (src) => {
      await page.evaluate(src => window.fontTest.bridge.render({ src }), src)
      await page.waitForFunction(() => window.fontTest.done || window.fontTest.errors.length)
      assert.deepEqual(await page.evaluate(() => window.fontTest.errors), [])
    }
    const frame = page.frameLocator('#font-test iframe')
    const loaded = () => frame.locator('body').evaluate(() => [...document.fonts]
      .filter(font => font.status === 'loaded')
      .map(font => ({
        family: font.family.replaceAll('"', '').replaceAll('\'', ''),
        style: font.style,
        weight: font.weight,
      })))
    const verifyThemes = async () => {
      for (const [theme, sans, mono] of [
        ['default', 'Nunito Sans', 'Fira Code'],
        ['seriph', 'PT Serif', 'PT Mono'],
      ]) {
        await render(`---\ntheme: ${theme}\n---\n# Theme fonts\n\nA paragraph with *italic text*.\n\n\`\`\`js\nconst answer = 42\n\`\`\`\n\n---\n# Another slide`)
        assert.equal(await frame.locator('#online-notices').count(), 0)
        assert.equal(await page.locator('#font-test iframe').getAttribute('sandbox'), 'allow-scripts')
        assert.equal(await frame.locator('body').evaluate(() => globalThis.origin), 'null')
        // Avenir Next can satisfy the default stack on macOS. Explicitly load
        // the bundled fallback as well, including its non-Latin subsets.
        await frame.locator('body').evaluate(async (_, families) => {
          for (const family of families)
            await document.fonts.load(`400 16px "${family}"`, 'Hello Ā Я Ά ế ∑')
        }, [sans, mono])
        const faces = await loaded()
        assert.ok(faces.some(font => font.family === sans), `${sans} must actually load`)
        assert.ok(faces.some(font => font.family === mono), `${mono} must actually load`)
        if (theme === 'seriph')
          assert.ok(faces.some(font => font.family === sans && font.style === 'italic'))
        const before = bundled.length
        await page.evaluate(() => window.fontTest.bridge.goto(2))
        await frame.getByRole('heading', { name: 'Another slide' }).waitFor()
        assert.equal(bundled.length, before, 'Navigation must reuse theme font styles')
      }
    }
    await initialize()
    await verifyThemes()
    assert.equal(remote.length, 0, 'Bundled themes must never contact a font service')
    await page.waitForFunction(() => document.querySelector('#offline-status').textContent === 'Available offline')
    await context.setOffline(true)
    await initialize()
    await verifyThemes()
    assert.equal(remote.length, 0, 'Bundled themes must work completely offline')
    await context.setOffline(false)

    const fontBytes = await fs.readFile(require.resolve('../../runtime/node_modules/@fontsource-variable/fira-code/files/fira-code-latin-wght-normal.woff2'))
    let failSheet = false
    let failFont = false
    const queries = []
    await context.route('https://fonts.googleapis.com/**', (route) => {
      const request = route.request()
      queries.push({
        url: request.url(),
        headers: request.headers(),
      })
      return route.fulfill({
        status: failSheet ? 404 : 200,
        contentType: 'text/css',
        body: `@font-face { font-family: 'Remote Sans'; font-style: normal; font-weight: 100 900; src: url(https://fonts.gstatic.com/online-test.woff2) format('woff2'); }`,
      })
    })
    await context.route('https://fonts.gstatic.com/**', route => route.fulfill({
      status: failFont ? 404 : 200,
      contentType: 'font/woff2',
      headers: { 'access-control-allow-origin': '*' },
      body: failFont ? 'missing' : fontBytes,
    }))
    const custom = '---\nfonts:\n  sans: Remote Sans\n  mono: Fira Code\n  weights: [700, 400]\n  italic: true\n---\n# Remote font\n\nA paragraph'
    await render(custom)
    assert.equal(await frame.locator('#online-notices').count(), 0)
    assert.ok((await loaded()).some(font => font.family === 'Remote Sans'))
    assert.equal(queries.length, 1)
    const query = new URL(queries[0].url)
    assert.deepEqual(query.searchParams.getAll('family'), ['Remote Sans:ital,wght@0,400;0,700;1,400;1,700'])
    assert.equal(query.searchParams.get('display'), 'swap')
    assert.equal(queries[0].headers.referer, undefined)
    assert.equal(await frame.locator('link[data-online-fonts]').getAttribute('referrerpolicy'), 'no-referrer')

    for (const settings of [
      'provider: none',
      'local: [Remote Sans, Fira Code]',
      'webfonts: []',
      'fallbacks: false',
    ]) {
      const before = remote.length
      await render(`---\nfonts:\n  sans: Remote Sans\n  mono: Fira Code\n  ${settings}\n---\n# Local fonts`)
      assert.equal(remote.length, before, `${settings} must suppress remote requests`)
      assert.equal(await frame.locator('[data-online-fonts]').count(), 0)
    }
    const before = remote.length
    await render('---\nfonts:\n  provider: coollabs\n---\n# Unsupported provider')
    assert.match(await frame.locator('#online-notices').textContent(), /Only Google and bundled fonts/)
    assert.equal(remote.length, before)
    await render('---\nfonts:\n  weights: invalid\n---\n# Invalid font options')
    assert.match(await frame.locator('#online-notices').textContent(), /Font settings exceed online limits/)
    assert.equal(remote.length, before)
    failSheet = true
    await render(custom)
    assert.match(await frame.locator('#online-notices').textContent(), /Google fonts are unavailable/)
    failSheet = false
    failFont = true
    await render(custom)
    assert.match(await frame.locator('#online-notices').textContent(), /Fonts are unavailable/)
    failFont = false
    await render(custom)
    assert.equal(await frame.locator('#online-notices').count(), 0)
    assert.ok((await loaded()).some(font => font.family === 'Remote Sans'))
    await context.unrouteAll({ behavior: 'wait' })
    await context.setOffline(true)
    await render(custom)
    assert.match(await frame.locator('#online-notices').textContent(), /Google fonts are unavailable/)
    assert.deepEqual(errors, [])
    await context.close()

    const failureContext = await browser.newContext({ serviceWorkers: 'block' })
    const failurePage = await failureContext.newPage()
    await failurePage.route('**/runtime/fonts/nunito-sans.css', route => route.fulfill({ status: 404, body: 'Missing' }))
    await failurePage.goto(process.argv[2] || 'http://127.0.0.1:8000/')
    await failurePage.waitForSelector('body[data-ready="true"]')
    assert.match(await failurePage.frameLocator('#preview iframe').locator('#online-notices').textContent(), /Bundled font Nunito Sans is unavailable/)
    await failureContext.close()
    process.stdout.write(`${engine}: bundled theme fonts, offline non-Latin subsets, Google fonts, local overrides, failure recovery and opaque isolation passed\n`)
  }
  finally { await browser.close() }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
