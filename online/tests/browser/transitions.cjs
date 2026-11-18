const assert = require('node:assert/strict')
const process = require('node:process')
const { expect } = require('@playwright/test')
const { chromium, firefox, webkit } = require('playwright')

async function main() {
  const engine = process.argv[3] || process.env.BROWSER || 'chromium'
  const browser = await ({ chromium, firefox, webkit })[engine].launch()
  try {
    const page = await browser.newPage({
      viewport: { width: 980, height: 552 },
    })
    const errors = []
    page.on('pageerror', error => errors.push(String(error)))
    await page.goto(process.argv[2] || 'http://127.0.0.1:8000/')
    await page.waitForSelector('body[data-ready="true"]')
    await page.evaluate(async () => {
      const { createPreviewBridge } = await import('./src/preview-bridge.js')
      const host = document.createElement('div')
      host.id = 'transition-test'
      host.style.cssText = 'position:fixed;inset:0;background:white;z-index:10000'
      document.body.append(host)
      const state = window.transitions = { events: [], errors: [] }
      state.bridge = createPreviewBridge({
        container: host,
        onStatus: (status, detail) => state.events.push({ status, ...detail }),
        onPosition: position => state.events.push(position),
        onError: message => state.errors.push(message),
      })
    })
    const render = async (src, css = '') => {
      await page.evaluate(({ src, css }) => {
        window.transitions.events = []
        window.transitions.errors = []
        window.transitions.bridge.render({ src, css })
      }, { src, css })
      await page.waitForFunction(() => window.transitions.events.some(event => event.status === 'rendered') || window.transitions.errors.length)
      assert.deepEqual(await page.evaluate(() => window.transitions.errors), [])
    }
    const go = async (slide, click = 0) => {
      await page.evaluate(({ slide, click }) => {
        window.transitions.events = []
        window.transitions.bridge.goto(slide, click)
      }, { slide, click })
      await page.waitForFunction(slide => window.transitions.events.some(event => event.slide === slide) || window.transitions.errors.length, slide)
      assert.deepEqual(await page.evaluate(() => window.transitions.errors), [])
    }
    const src = `---
transition: slide-left
fonts:
  provider: none
---
# First {{ count }}

<button @click="count++">Increment</button>
<div v-click>Revealed</div>

<script setup>
import { ref, onUnmounted } from 'vue'
const count = ref(0)
document.body.dataset.mounts = String(Number(document.body.dataset.mounts || 0) + 1)
onUnmounted(() => document.body.dataset.left = 'yes')
</script>

<style scoped>h1 { color: rgb(200, 0, 0) }</style>

---
transition: fade
---
# Second

<style scoped>h1 { color: rgb(0, 0, 200) }</style>

---
transition:
  name: slide-up | slide-down
---
# Third

---
transition: none
---
# Fourth

---
# Fifth
`
    await render(src, ':root { --slidev-transition-duration: 0.2s; }')
    const getFrame = async () => (await page.locator('#transition-test iframe').elementHandle()).contentFrame()
    let frame = await getFrame()
    assert.equal(await frame.evaluate(() => globalThis.origin), 'null')
    assert.equal(await page.locator('#transition-test iframe').getAttribute('sandbox'), 'allow-scripts')
    assert.equal(await frame.locator('[class*="-enter-"]').count(), 0, 'Initial render must not animate')
    await frame.getByRole('button', { name: 'Increment' }).click()
    await go(1, 1)
    assert.equal(await frame.locator('h1').textContent(), 'First 1', 'Click navigation must preserve author state')
    assert.equal(await frame.locator('.slidev-vclick-hidden').count(), 0)
    await go(1)
    assert.equal(await frame.locator('.slidev-vclick-hidden').count(), 1)
    assert.equal(await frame.locator('body').getAttribute('data-mounts'), '1', 'Click changes must not rerun author scripts')

    // Record transient classes and their computed CSS without relying on the
    // automation round-trip arriving inside a particular animation frame.
    await frame.evaluate(() => {
      window.samples = []
      new MutationObserver(() => {
        for (const element of document.querySelectorAll('.slidev-page')) {
          if (!/-(?:enter|leave)-active/.test(element.className))
            continue
          const style = getComputedStyle(element)
          window.samples.push({
            no: element.dataset.slidevNo,
            classes: element.className,
            duration: style.transitionDuration,
            translate: style.translate,
            opacity: style.opacity,
            pages: document.querySelectorAll('.slidev-page').length,
            styles: [
              ...document.querySelectorAll('style[data-online-slide]'),
            ].map(style => style.dataset.onlineSlide),
          })
        }
      }).observe(document.querySelector('#app'), {
        subtree: true,
        attributes: true,
        attributeFilter: ['class'],
        childList: true,
      })
    })
    const transition = async (no, name, kind) => {
      await frame.evaluate(() => window.samples = [])
      await go(no)
      await expect(frame.locator('.slidev-page')).toHaveCount(1)
      await expect(frame.locator(`.slidev-page[data-slidev-no="${no}"]`)).toHaveCount(1)
      await expect(frame.locator('[class*="-enter-"], [class*="-leave-"]')).toHaveCount(0)
      const samples = await frame.evaluate(() => window.samples)
      const entering = samples.filter(sample => sample.classes.includes(`${name}-enter-active`))
      const leaving = samples.filter(sample => sample.classes.includes(`${name}-leave-active`))
      assert.ok(entering.length && leaving.length, `${name}: both slides must animate`)
      assert.ok(samples.some(sample => sample.pages === 2 && sample.styles.length === 2), 'Departing styles must survive the animation')
      assert.ok(entering.every(sample => sample.duration === '0.2s'), 'Upstream transition CSS must use the deck duration')
      assert.ok(entering.some(sample => kind === 'fade'
        ? Number(sample.opacity) < 1
        : sample.translate !== 'none' && sample.translate !== '0px'), `${name}: animation must have a visible effect`)
      assert.equal(await frame.locator('style[data-online-slide]').count(), 1, 'Departing styles must be removed after leave')
    }
    await transition(2, 'slide-left', 'slide')
    assert.equal(await frame.locator('body').getAttribute('data-left'), 'yes')
    await expect(frame.locator('h1')).toHaveCSS('color', 'rgb(0, 0, 200)')
    await transition(1, 'slide-right', 'slide')
    await expect(frame.locator('h1')).toHaveCSS('color', 'rgb(200, 0, 0)')
    await transition(2, 'slide-left', 'slide')
    await transition(3, 'fade', 'fade')
    await transition(2, 'fade', 'fade')
    await transition(3, 'fade', 'fade')
    await transition(4, 'slide-up', 'slide')
    await transition(3, 'slide-down', 'slide')
    await transition(4, 'slide-up', 'slide')
    await frame.evaluate(() => window.samples = [])
    await go(5)
    await expect(frame.locator('.slidev-page')).toHaveCount(1)
    assert.equal(await frame.locator('h1').textContent(), 'Fifth')
    assert.ok((await frame.evaluate(() => window.samples)).every(sample => sample.duration === '0s'), 'An explicit none override must disable inherited animation')
    assert.equal(await frame.locator('style[data-online-slide]').count(), 1)

    // Rapid reversals must release cancelled leave nodes and their styles.
    await page.evaluate(() => {
      window.transitions.bridge.goto(2)
      window.transitions.bridge.goto(3)
      window.transitions.bridge.goto(2)
    })
    await expect(frame.locator('.slidev-page')).toHaveCount(1)
    await expect(frame.locator('.slidev-page[data-slidev-no="2"]')).toHaveCount(1)
    await expect(frame.locator('[class*="-enter-"], [class*="-leave-"]')).toHaveCount(0)
    assert.equal(await frame.locator('style[data-online-slide]').count(), 1)

    // A new document gets a fresh frame even while old author code is leaving.
    await go(3)
    const oldFrame = frame
    await render('# Replacement')
    frame = await getFrame()
    assert.ok(oldFrame.isDetached())
    assert.equal(await frame.locator('h1').textContent(), 'Replacement')
    assert.equal(await frame.locator('style[data-online-slide]').count(), 1)
    assert.deepEqual(await page.evaluate(() => window.transitions.errors), [])

    await render('---\ntransition: view-transition\nfonts:\n  provider: none\n---\n# Native transition fallback\n\n---\n# Fade destination')
    frame = await getFrame()
    assert.match(await frame.locator('#online-notices').textContent(), /Native view transitions are not available online; using fade/)
    await go(2)
    await expect(frame.locator('.slidev-page')).toHaveCount(1)
    assert.equal(await frame.locator('h1').textContent(), 'Fade destination')
    assert.match(await frame.locator('#online-notices').textContent(), /using fade/)

    await page.waitForFunction(() => document.querySelector('#offline-status').textContent === 'Available offline')
    await page.context().setOffline(true)
    await render(src)
    frame = await getFrame()
    await go(2)
    await expect(frame.locator('.slidev-page')).toHaveCount(1)
    await expect(frame.locator('[class*="-enter-"], [class*="-leave-"]')).toHaveCount(0)
    assert.equal(await frame.locator('h1').textContent(), 'Second')
    assert.equal(await frame.locator('style[data-online-slide]').count(), 1)
    assert.deepEqual(errors, [])
    process.stdout.write(`${engine}: directional transitions, overrides, actual CSS, style cleanup, click state, rapid navigation, replacement isolation, native fallback and offline rendering passed\n`)
  }
  finally { await browser.close() }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
