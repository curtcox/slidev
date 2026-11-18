const assert = require('node:assert/strict')
const process = require('node:process')
const { chromium, firefox, webkit } = require('playwright')

async function main() {
  const engine = process.argv[3] || process.env.BROWSER || 'chromium'
  const browser = await ({ chromium, firefox, webkit })[engine].launch()
  try {
    const page = await browser.newPage({
      viewport: { width: 1100, height: 900 },
    })
    const pageErrors = []
    page.on('pageerror', error => pageErrors.push(String(error)))
    await page.goto(process.argv[2] || 'http://127.0.0.1:8000/')
    await page.waitForSelector('body[data-ready="true"]')
    await page.evaluate(async () => {
      const { createPreviewBridge } = await import('./src/preview-bridge.js')
      const host = document.createElement('div')
      host.id = 'runtime-test'
      host.style.cssText = 'position:fixed;inset:0;background:white;z-index:10000'
      document.body.append(host)
      const test = window.runtimeTest = { events: [], errors: [] }
      test.bridge = createPreviewBridge({
        container: host,
        onStatus: (state, detail) => test.events.push({ state, ...detail }),
        onPosition: position => test.events.push(position),
        onError: message => test.errors.push(message),
      })
    })
    const render = async (src, css = '') => {
      await page.evaluate(({ src, css }) => {
        window.runtimeTest.events = []
        window.runtimeTest.errors = []
        window.runtimeTest.bridge.render({ src, css })
      }, { src, css })
      await page.waitForFunction(() => window.runtimeTest.events.some(event => event.state === 'rendered') || window.runtimeTest.errors.length)
      return page.evaluate(() => window.runtimeTest.errors)
    }
    const fixture = `# Count: {{ count }}

<button @click="count++">Increment</button>

<script setup lang="ts">
import { ref } from 'vue'
const count = ref<number>(0)
</script>

<style scoped>
h1 { color: rgb(200, 0, 0); @apply font-bold; }
</style>

---
layout: two-cols
---
# Reveals

<v-clicks>

- One
- Two

</v-clicks>

::right::

# Second column
`
    assert.deepEqual(await render(fixture, '.slidev-layout { background: rgb(240, 250, 240); }'), [])
    let frame = page.frameLocator('#runtime-test iframe')
    assert.equal(await page.locator('#runtime-test iframe').getAttribute('sandbox'), 'allow-scripts')
    await frame.getByRole('button', { name: 'Increment' }).click()
    assert.equal(await frame.locator('h1').textContent(), 'Count: 1')
    assert.deepEqual(await frame.locator('h1').evaluate(element => ({
      color: getComputedStyle(element).color,
      weight: getComputedStyle(element).fontWeight,
    })), { color: 'rgb(200, 0, 0)', weight: '700' })
    assert.equal(await frame.locator('.slidev-layout').evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(240, 250, 240)')
    await page.evaluate(() => window.runtimeTest.bridge.goto(2))
    await frame.getByRole('heading', { name: 'Reveals', exact: true }).waitFor()
    assert.notEqual(await frame.getByRole('heading', { name: 'Reveals', exact: true }).evaluate(element => getComputedStyle(element).color), 'rgb(200, 0, 0)')
    assert.equal(await frame.locator('li.slidev-vclick-hidden').count(), 2)
    await frame.getByRole('heading', { name: 'Reveals', exact: true }).click()
    await page.keyboard.press('ArrowRight')
    await page.waitForFunction(() => window.runtimeTest.events.some(event => event.slide === 2 && event.click === 1))
    assert.equal(await frame.locator('li.slidev-vclick-hidden').count(), 1)
    await page.keyboard.press('ArrowRight')
    await page.waitForFunction(() => window.runtimeTest.events.some(event => event.slide === 2 && event.click === 2))
    assert.equal(await frame.locator('li.slidev-vclick-hidden').count(), 0)
    await page.keyboard.press('ArrowLeft')
    await page.waitForFunction(() => window.runtimeTest.events.filter(event => event.slide === 2 && event.click === 1).length === 2)
    assert.equal(await frame.locator('li.slidev-vclick-hidden').count(), 1)

    const hostile = `# Isolation {{ results.join(',') }}
<script setup>
const results = []
for (const access of [() => parent.document, () => parent.localStorage, () => parent.document.cookie]) {
  try { access(); results.push('escaped') } catch { results.push('blocked') }
}
setInterval(() => postMessage({protocol:1,type:'position',slide:999,click:0}), 20)
</script>`
    assert.deepEqual(await render(hostile), [])
    frame = page.frameLocator('#runtime-test iframe')
    assert.match(await frame.locator('h1').textContent(), /blocked,blocked,blocked/)
    assert.deepEqual(await render('# Replacement'), [])
    frame = page.frameLocator('#runtime-test iframe')
    assert.equal(await frame.locator('h1').textContent(), 'Replacement')
    await page.waitForTimeout(100)
    assert.equal(await page.evaluate(() => window.runtimeTest.events.some(event => event.slide === 999)), false)
    assert.equal(await page.locator('#runtime-test iframe').count(), 1)

    const errors = await render('# Missing module\n<script setup>import value from "node:fs"; console.log(value)</script>')
    assert.match(errors.join('\n'), /Module node:fs is unavailable/)
    assert.equal(await page.locator('#runtime-test iframe').count(), 0)
    assert.deepEqual(await render('# Notice\n<MissingOnlineWidget />'), [])
    assert.match(await page.frameLocator('#runtime-test iframe').locator('#online-notices').textContent(), /Component MissingOnlineWidget is unavailable/)

    for (const theme of ['default', 'seriph', 'unavailable-theme']) {
      const src = `---\ntheme: ${theme}\nbackground: '#e2e8f0'\nfonts:\n  provider: none\n  sans: Arial\n---\n# Theme cover\n\n---\nlayout: section\n---\n# Theme section\n\n---\nlayout: fact\n---\n# 42\n\nA fact\n\n---\n# Theme default\n`
      assert.deepEqual(await render(src), [])
      frame = page.frameLocator('#runtime-test iframe')
      assert.equal(await frame.locator('.slidev-layout.cover').count(), 1)
      assert.equal(await frame.locator('h1').evaluate(element => getComputedStyle(element).fontSize), '60px')
      assert.equal(await frame.locator('.slidev-layout').evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(226, 232, 240)')
      await page.evaluate(() => window.runtimeTest.bridge.goto(2))
      await frame.locator('.slidev-layout.section h1').waitFor()
      assert.equal(await frame.locator('h1').evaluate(element => getComputedStyle(element).fontSize), '60px')
      await page.evaluate(() => window.runtimeTest.bridge.goto(3))
      await frame.locator('.slidev-layout.fact h1').waitFor()
      assert.equal(await frame.locator('h1').evaluate(element => getComputedStyle(element).fontSize), '96px')
      await page.evaluate(() => window.runtimeTest.bridge.goto(4))
      await frame.locator('.slidev-layout.default h1').waitFor()
      assert.equal(await frame.locator('h1').evaluate(element => getComputedStyle(element).color), theme === 'seriph'
        ? 'rgb(93, 131, 146)'
        : 'rgb(0, 0, 0)')
      if (theme === 'unavailable-theme')
        assert.match(await frame.locator('#online-notices').textContent(), /Theme unavailable-theme is unavailable online; using default/)
      else
        assert.equal(await frame.locator('#online-notices').count(), 0)
    }
    await page.evaluate(() => window.runtimeTest.bridge.stop())
    assert.equal(await page.locator('#runtime-test iframe').count(), 0)
    assert.deepEqual(pageErrors, [])
    process.stdout.write(`${engine}: scripts, CSS, slots, clicks, isolation, replacement, official themes and visible fallbacks passed\n`)
  }
  finally { await browser.close() }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
