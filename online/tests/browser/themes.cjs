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
    const remoteFonts = []
    page.on('pageerror', error => errors.push(String(error)))
    page.on('request', (request) => {
      if (/^https:\/\/fonts\./.test(request.url()))
        remoteFonts.push(request.url())
    })
    const base = process.argv[2] || 'http://127.0.0.1:8000/'
    const audit = await (await context.request.get(new URL('runtime/theme-audit.json', base).href)).json()
    const initialize = async () => {
      await page.goto(base)
      await page.waitForSelector('body[data-ready="true"]')
      await page.evaluate(async () => {
        const { createPreviewBridge } = await import('./src/preview-bridge.js')
        const host = document.createElement('div')
        host.id = 'theme-test'
        host.style.cssText = 'position:fixed;inset:0;z-index:10000;background:white'
        document.body.append(host)
        const state = window.themeTest = { done: false, errors: [] }
        state.bridge = createPreviewBridge({
          container: host,
          onStatus: status => state.done = status === 'rendered',
          onError: message => state.errors.push(message),
        })
      })
    }
    const render = async (src) => {
      await page.evaluate(src => window.themeTest.bridge.render({ src }), src)
      await page.waitForFunction(() => window.themeTest.done || window.themeTest.errors.length)
      assert.deepEqual(await page.evaluate(() => window.themeTest.errors), [])
    }
    const frame = page.frameLocator('#theme-test iframe')
    const verify = async () => {
      for (const name of [
        'apple-basic',
        'bricks',
        'shibainu',
        'default',
        'seriph',
      ]) {
        const theme = audit.find(theme => theme.name === name)
        const layouts = theme.sources.filter(source => /^layouts\/.*\.vue$/.test(source.file))
          .map(source => source.file.slice('layouts/'.length, -'.vue'.length))
        const src = layouts.map((layout, index) => `---\n${index === 0
          ? `theme: '@slidev/theme-${name}'\n`
          : ''}layout: ${layout}\nbackground: '#cbd5e1'\nimage: '#cbd5e1'\nimageLeft: '#fee2e2'\nimageTopRight: '#dcfce7'\nimageBottomRight: '#dbeafe'\n---\n# Theme ${index + 1}\n\nA paragraph. Āā.\n\n~~~js\nconst answer = 42\n~~~\n\n::left::\n\nLeft slot\n\n::right::\n\nRight slot\n\n::items::\n\n<div>One</div><div>Two</div>`).join('\n\n')
        await render(src)
        assert.equal(await page.locator('#theme-test iframe').getAttribute('sandbox'), 'allow-scripts')
        assert.equal(await frame.locator('html').evaluate(() => globalThis.origin), 'null')
        assert.equal(await frame.locator('html').getAttribute('data-online-theme'), name)
        if (name === 'bricks' || name === 'shibainu') {
          assert.equal(await frame.locator('html').getAttribute('class'), name === 'shibainu'
            ? 'dark'
            : 'light')
        }
        for (let index = 0; index < layouts.length; index++) {
          await page.evaluate(slide => window.themeTest.bridge.goto(slide), index + 1)
          const slide = frame.locator(`.slidev-page[data-slidev-no="${index + 1}"]`)
          await slide.waitFor()
          assert.equal(await frame.locator('#online-notices').count(), 0, `${name}/${layouts[index]} must not fall back`)
          if (name === 'bricks' && layouts[index] !== 'blank') {
            const background = await slide.locator('.slidev-layout').evaluate(element => getComputedStyle(element).backgroundImage)
            assert.match(background, /^url\("data:image\/svg\+xml/, 'Artwork must be self-contained in the opaque frame')
          }
          if (name === 'shibainu')
            assert.equal(await slide.locator('svg.layout-background').count(), 1, 'Every Shibainu layout must render its artwork')
          if (name === 'apple-basic' && layouts[index] === 'intro-image-right') {
            const imageSlide = await slide.boundingBox()
            const text = await slide.locator('.slidev-layout').boundingBox()
            assert.ok(text.y > imageSlide.y && text.height < imageSlide.height, 'Apple Basic must keep its vertically centered text layout without layouts-base.css')
          }
          if (name === 'default' || name === 'seriph') {
            const background = await slide.locator('.slidev-layout').evaluate(element => getComputedStyle(element).backgroundImage)
            assert.equal(background, 'none', 'Other bundled theme styles must not leak into this theme')
          }
        }
        const families = name === 'bricks'
          ? ['Signika Negative', 'Sigmar One', 'Fira Code']
          : name === 'shibainu'
            ? ['Titillium Web', 'Fira Code']
            : []
        const loaded = await frame.locator('body').evaluate(async (_, families) => {
          for (const family of families)
            await document.fonts.load(`400 16px "${family}"`, 'Hello Āā')
          return [...document.fonts].filter(font => font.status === 'loaded').map(font => font.family.replaceAll('"', '').replaceAll('\'', ''))
        }, families)
        for (const family of families)
          assert.ok(loaded.includes(family), `${name}: ${family} must load, including offline`)
      }
      await render(`---\ntheme: bricks\n---\n# Theme components\n\n<div class="flex">${Array.from({ length: 11 }, (_, index) => `<Polygon${index + 1} class="w-10" />`).join('')}</div>`)
      assert.equal(await frame.locator('.slidev-page svg').count(), 11)
      assert.equal(await frame.locator('#online-notices').count(), 0)
      await render('---\ntheme: default\n---\n# Unavailable component\n\n<Polygon1 />')
      assert.match(await frame.locator('#online-notices').textContent(), /Component Polygon1 is unavailable online/)
    }
    await initialize()
    await verify()
    assert.deepEqual(remoteFonts, [], 'All theme defaults must work without a font service')
    await page.waitForFunction(() => document.querySelector('#offline-status').textContent === 'Available offline')
    await context.setOffline(true)
    await initialize()
    await verify()
    assert.deepEqual(remoteFonts, [])
    assert.deepEqual(errors, [])
    process.stdout.write(`${engine}: all five theme layouts, artwork, fonts, aliases, components, style isolation and full offline reload passed\n`)
  }
  finally { await browser.close() }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
