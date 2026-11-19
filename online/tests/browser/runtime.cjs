const assert = require('node:assert/strict')
const process = require('node:process')
const { expect } = require('@playwright/test')
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
    const render = async (src, css = '', dark = false) => {
      await page.evaluate(({ src, css, dark }) => {
        window.runtimeTest.events = []
        window.runtimeTest.errors = []
        window.runtimeTest.bridge.render({ src, css, dark })
      }, { src, css, dark })
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

    assert.deepEqual(await render('# Branding\n\n<PoweredBySlidev mt-10 />'), [])
    frame = page.frameLocator('#runtime-test iframe')
    const branding = frame.getByAltText('Slidev logo')
    await branding.evaluate(image => image.decode())
    const brandingStyle = await branding.evaluate(image => ({
      display: getComputedStyle(image.closest('span[inline-flex]')).display,
      height: Number.parseFloat(getComputedStyle(image).height),
      expectedHeight: Number.parseFloat(getComputedStyle(image).fontSize) * 1.5,
    }))
    assert.equal(brandingStyle.display, 'inline-flex')
    assert.ok(Math.abs(brandingStyle.height - brandingStyle.expectedHeight) < 0.02, 'Bundled component utilities must constrain the logo to 1.5em')

    const errors = await render('# Missing module\n<script setup>import value from "node:fs"; console.log(value)</script>')
    assert.match(errors.join('\n'), /Module node:fs is unavailable/)
    assert.equal(await page.locator('#runtime-test iframe').count(), 0)
    assert.deepEqual(await render('# Notice\n<MissingOnlineWidget />'), [])
    assert.match(await page.frameLocator('#runtime-test iframe').locator('#online-notices').textContent(), /Component MissingOnlineWidget is unavailable/)

    const navigation = `# Navigation

Page <SlideCurrentNo /> of <SlidesTotal />

<Link to="destination">Go by alias</Link>

<RenderWhen context="main"><p>Main content</p></RenderWhen>
<RenderWhen context="presenter"><p>Presenter only</p><template #fallback><p>Presenter fallback</p></template></RenderWhen>
<LightOrDark><template #light><p>Light content</p></template><template #dark><p>Dark content</p></template></LightOrDark>
<Transform :scale="0.5"><p>Scaled content</p></Transform>

<p>API: {{ nav.total }} / {{ active }} / {{ entered }}</p>
<button @click="toggleDark()">Toggle dark</button>

<script setup>
import { ref } from 'vue'
import { useNav, useDarkMode, useIsSlideActive, onSlideEnter, onSlideLeave } from '@slidev/client'
const nav = useNav()
const active = useIsSlideActive()
const entered = ref(0)
onSlideEnter(() => entered.value++)
onSlideLeave(() => { document.body.dataset.left = 'yes' })
const { toggleDark } = useDarkMode()
</script>

---
routeAlias: destination
---
# Destination

Page <SlideCurrentNo /> of <SlidesTotal />

<button @click="$nav.goFirst()">Go first</button>
`
    assert.deepEqual(await render(navigation), [])
    frame = page.frameLocator('#runtime-test iframe')
    assert.match(await frame.locator('.slidev-layout').textContent(), /Page 1 of 2/)
    assert.match(await frame.locator('.slidev-layout').textContent(), /API: 2 \/ true \/ 1/)
    assert.equal(await frame.getByText('Main content', { exact: true }).count(), 1)
    assert.equal(await frame.getByText('Presenter only', { exact: true }).count(), 0)
    assert.equal(await frame.getByText('Presenter fallback', { exact: true }).count(), 1)
    assert.equal(await frame.getByText('Light content', { exact: true }).count(), 1)
    assert.equal(await frame.getByText('Scaled content', { exact: true }).evaluate(element => getComputedStyle(element.parentElement).transform), 'matrix(0.5, 0, 0, 0.5, 0, 0)')
    await frame.getByRole('button', { name: 'Toggle dark' }).click()
    await frame.getByText('Dark content', { exact: true }).waitFor()
    assert.equal(await frame.locator('html.dark').count(), 1)
    await frame.getByRole('link', { name: 'Go by alias' }).click()
    await frame.getByRole('heading', { name: 'Destination', exact: true }).waitFor()
    assert.match(await frame.locator('.slidev-layout').textContent(), /Page 2 of 2/)
    assert.equal(await frame.locator('body').getAttribute('data-left'), 'yes')
    await page.waitForFunction(() => window.runtimeTest.events.some(event => event.slide === 2 && event.click === 0))
    await frame.getByRole('button', { name: 'Go first' }).click()
    await frame.getByRole('heading', { name: 'Navigation', exact: true }).waitFor()
    assert.equal(await frame.getByText('Dark content', { exact: true }).count(), 1)
    assert.equal(await frame.locator('#online-notices').count(), 0)
    assert.deepEqual(await render(navigation, '', true), [])
    frame = page.frameLocator('#runtime-test iframe')
    assert.equal(await frame.getByText('Dark content', { exact: true }).count(), 1)

    const magicMove = '# Magic move\n\n````md magic-move\n```ts\nconst before = 1\n```\n```ts\nconst after = 2\n```\n````'
    assert.deepEqual(await render(magicMove), [])
    frame = page.frameLocator('#runtime-test iframe')
    await frame.locator('.shiki-magic-move-container').waitFor()
    assert.match(await frame.locator('.slidev-code-magic-move').textContent(), /const before = 1/)
    await frame.getByRole('heading', { name: 'Magic move' }).click()
    await page.keyboard.press('ArrowRight')
    await page.waitForFunction(() => window.runtimeTest.events.some(event => event.slide === 1 && event.click === 1))
    await frame.getByText('after', { exact: true }).waitFor()
    assert.equal(await frame.locator('#online-notices').count(), 0)

    const hiddenSlides = '---\ntheme: seriph\nhide: true\n---\n# Hidden cover\n\n---\n\n# First visible\n\nPage <SlideCurrentNo /> of <SlidesTotal />\n\n---\ndisabled: true\n---\n# Disabled slide\n\n---\n\n# Last visible'
    assert.deepEqual(await render(hiddenSlides), [])
    frame = page.frameLocator('#runtime-test iframe')
    assert.equal(await frame.locator('h1').textContent(), 'First visible')
    assert.match(await frame.locator('.slidev-layout').textContent(), /Page 1 of 2/)
    await page.evaluate(() => window.runtimeTest.bridge.goto(2))
    await frame.getByRole('heading', { name: 'Last visible' }).waitFor()
    assert.equal(await frame.locator('.slidev-page[data-slidev-no="2"] h1').evaluate(element => getComputedStyle(element).color), 'rgb(93, 131, 146)')

    const codeGroup = '# Code groups\n\n<AutoFitText :min="20" :max="40" model-value="Fitted text" />\n\n<CodeGroup>\n\n```ts [first.ts]\nconst first = 1\n```\n\n```ts [second.ts]\nconst second = 2\n```\n\n</CodeGroup>'
    assert.deepEqual(await render(codeGroup), [])
    frame = page.frameLocator('#runtime-test iframe')
    await expect(frame.locator('.slidev-auto-fit-text-inner')).toHaveCSS('font-size', '40px')
    await expect(frame.locator('.slidev-code-wrapper').filter({ hasText: 'const first' })).toBeVisible()
    await expect(frame.locator('.slidev-code-wrapper').filter({ hasText: 'const second' })).toBeHidden()
    await frame.locator('.slidev-code-tab').filter({ hasText: 'second.ts' }).click()
    await expect(frame.locator('.slidev-code-wrapper').filter({ hasText: 'const first' })).toBeHidden()
    await expect(frame.locator('.slidev-code-wrapper').filter({ hasText: 'const second' })).toBeVisible()
    assert.equal(await frame.locator('#online-notices').count(), 0)

    const motion = `---
clicks: 1
---
# Motion and marks

<div class="motion-test" v-motion :initial="{ x: -50, opacity: 0 }" :enter="{ x: 0, opacity: 1, transition: { duration: 0 } }" :click-1="{ x: 50, opacity: 0.5, transition: { duration: 0 } }">Moving content</div>

<span v-mark.red="{ at: 1, animationDuration: 0 }">Marked content</span>

---
# After motion
`
    assert.deepEqual(await render(motion), [])
    frame = page.frameLocator('#runtime-test iframe')
    await expect(frame.locator('.motion-test')).toHaveCSS('opacity', '1')
    await frame.getByRole('heading', { name: 'Motion and marks' }).click()
    await page.keyboard.press('ArrowRight')
    await page.waitForFunction(() => window.runtimeTest.events.some(event => event.slide === 1 && event.click === 1))
    await expect(frame.locator('.motion-test')).toHaveCSS('opacity', '0.5')
    assert.match(await frame.locator('.motion-test').evaluate(element => getComputedStyle(element).transform), /50/)
    assert.equal(await frame.locator('svg.rough-annotation').count(), 1)
    assert.notEqual(await frame.locator('svg.rough-annotation').evaluate(element => getComputedStyle(element).color), 'rgb(0, 0, 0)')
    await page.keyboard.press('ArrowRight')
    await frame.getByRole('heading', { name: 'After motion' }).waitFor()
    assert.equal(await frame.locator('.motion-test').count(), 0)
    assert.equal(await frame.locator('svg.rough-annotation').count(), 0)
    assert.equal(await frame.locator('#online-notices').count(), 0)

    const contents = `---
hideInToc: true
---
# Contents

<Toc />

---
routeAlias: topic
---
# **Section** A

---
routeAlias: child
---
## Child

<Toc />

---
hideInToc: true
---
# Hidden
`
    assert.deepEqual(await render(contents), [])
    frame = page.frameLocator('#runtime-test iframe')
    assert.equal(await frame.locator('.slidev-toc a').count(), 2)
    assert.equal(await frame.locator('.slidev-toc strong').textContent(), 'Section')
    assert.equal(await frame.locator('.slidev-toc-list-level-2 a').textContent(), 'Child')
    await frame.getByRole('link', { name: 'Child', exact: true }).click()
    await frame.getByRole('heading', { name: 'Child', exact: true }).waitFor()
    assert.equal(await frame.locator('.slidev-page[data-slidev-no="3"] .slidev-toc-item-active > a').textContent(), 'Child')
    assert.equal(await frame.locator('.slidev-page[data-slidev-no="3"] .slidev-toc-item-parent-active > a').textContent(), 'Section A')
    assert.equal(await frame.locator('#online-notices').count(), 0)

    for (const theme of ['default', 'seriph', 'unavailable-theme']) {
      const src = `---\ntheme: ${theme}\nbackground: '#e2e8f0'\nfonts:\n  provider: none\n  sans: Arial\n---\n# Theme cover\n\n---\nlayout: section\n---\n# Theme section\n\n---\nlayout: fact\n---\n# 42\n\nA fact\n\n---\n# Theme default\n`
      assert.deepEqual(await render(src), [])
      frame = page.frameLocator('#runtime-test iframe')
      assert.equal(await frame.locator('.slidev-layout.cover').count(), 1)
      assert.equal(await frame.locator('h1').evaluate(element => getComputedStyle(element).fontSize), '60px')
      assert.equal(await frame.locator('.slidev-layout').evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(226, 232, 240)')
      await page.evaluate(() => window.runtimeTest.bridge.goto(2))
      await frame.locator('.slidev-layout.section h1').waitFor()
      assert.equal(await frame.locator('.slidev-layout.section h1').evaluate(element => getComputedStyle(element).fontSize), '60px')
      await page.evaluate(() => window.runtimeTest.bridge.goto(3))
      await frame.locator('.slidev-layout.fact h1').waitFor()
      assert.equal(await frame.locator('.slidev-layout.fact h1').evaluate(element => getComputedStyle(element).fontSize), '96px')
      await page.evaluate(() => window.runtimeTest.bridge.goto(4))
      await frame.locator('.slidev-layout.default h1').waitFor()
      assert.equal(await frame.locator('.slidev-layout.default h1').evaluate(element => getComputedStyle(element).color), theme === 'seriph'
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
    process.stdout.write(`${engine}: scripts, CSS, slots, clicks, isolation, replacement, navigation APIs, built-ins, TOC, magic-move, motion, marks, dark mode, official themes and visible fallbacks passed\n`)
  }
  finally { await browser.close() }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
