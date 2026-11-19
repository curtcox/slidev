import { expect, test } from '@playwright/test'
import { adapter, ready } from '../../vendor/fragment-kit-v0.4.4/testing/contract/adapter.js'

test.use({
  hasTouch: true,
  viewport: { width: 390, height: 844 },
})

const deck = `---
transition: none
---
# First

<p v-click>One reveal</p>
<button @click="count++">Count: {{ count }}</button>
<input aria-label="Slide input" />
<pre>Selectable code</pre>

<script setup>
import { ref } from 'vue'
const count = ref(0)
globalThis.executions = (globalThis.executions || 0) + 1
</script>

---
hide: true
---
# Hidden

---
title: '<img src=x onerror=alert(1)>'
---
# Second
`

async function open(page) {
  await ready(page)
  const href = await adapter.build(page, { src: deck })
  await ready(page, href)
  const frame = page.frameLocator('#preview iframe')
  await expect(frame.locator('h1')).toHaveText('First')
  return frame
}

test('overview uses inert titles, visible slide numbers and keyboard navigation', async ({ page }) => {
  const frame = await open(page)
  await page.locator('#overview').click()
  const dialog = page.locator('#overview-dialog')
  await expect(dialog.locator('ol button')).toHaveCount(2)
  await expect(dialog.locator('[aria-current="page"]')).toBeFocused()
  await expect(dialog.locator('ol button').nth(1)).toHaveText('2. <img src=x onerror=alert(1)>')
  await expect(dialog.locator('img')).toHaveCount(0)
  const sandbox = page.frames().find(frame => frame.parentFrame())
  expect(await sandbox.evaluate(() => globalThis.executions)).toBe(1)
  await dialog.locator('ol button').nth(1).focus()
  await page.keyboard.press('Enter')
  await expect(dialog).toBeHidden()
  await expect(frame.locator('h1')).toHaveText('Second')
  await expect(page.locator('#slide-position')).toHaveText('2 / 2')
  expect(new URL(page.url()).searchParams.get('slide')).toBe('2')
  await page.locator('#overview').click()
  await expect(dialog.locator('[aria-current="page"]')).toHaveText('2. <img src=x onerror=alert(1)>')
  await page.keyboard.press('Escape')
  await expect(page.locator('#overview')).toBeFocused()
})

test('touch taps and swipes follow click steps and preserve interactive controls', async ({ page, browserName }) => {
  const frame = await open(page)
  const position = () => page.locator('#slide-position')
  // A real browser touch on the author button keeps its state and position.
  await frame.getByRole('button', { name: 'Count: 0', exact: true }).tap()
  await expect(frame.getByRole('button', { name: 'Count: 1', exact: true })).toBeVisible()
  await expect(frame.locator('.slidev-vclick-hidden')).toHaveCount(1)
  const layout = frame.locator('.slidev-layout')
  const box = await layout.boundingBox()
  await layout.tap({
    position: { x: box.width * 0.8, y: box.height * 0.8 },
  })
  await expect(frame.locator('.slidev-vclick-hidden')).toHaveCount(0)
  await expect(position()).toHaveText('1 / 2')
  const gesture = async (target, dx, dy = 0) => {
    await target.dispatchEvent('pointerdown', {
      pointerType: 'touch',
      isPrimary: true,
      pointerId: 7,
      clientX: 200,
      clientY: 100,
    })
    await target.dispatchEvent('pointerup', {
      pointerType: 'touch',
      isPrimary: true,
      pointerId: 7,
      clientX: 200 + dx,
      clientY: 100 + dy,
    })
  }
  // Synthetic pointer paths exercise cancellation/scroll cases in every engine.
  await gesture(frame.locator('pre'), -100)
  await gesture(frame.locator('input'), -100)
  await gesture(layout, 0, 100)
  await layout.dispatchEvent('pointerdown', { pointerType: 'touch', isPrimary: true, pointerId: 7 })
  await layout.dispatchEvent('pointercancel', { pointerType: 'touch', pointerId: 7 })
  await layout.dispatchEvent('pointerup', {
    pointerType: 'touch',
    isPrimary: true,
    pointerId: 7,
    clientX: -100,
  })
  await expect(position()).toHaveText('1 / 2')
  if (browserName === 'chromium') {
    // Native touch delivery verifies that touch-action permits horizontal swipes.
    const session = await page.context().newCDPSession(page)
    const x = box.x + box.width * 0.8
    const y = box.y + box.height * 0.8
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { x, y },
      ],
    })
    for (let step = 1; step <= 5; step++) {
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [
          { x: x - box.width * 0.6 * step / 5, y },
        ],
      })
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await session.detach()
  }
  else {
    await gesture(layout, -100)
  }
  await expect(frame.locator('h1')).toHaveText('Second')
  await expect(position()).toHaveText('2 / 2')
  await gesture(frame.locator('.slidev-layout'), 100)
  await expect(frame.locator('h1')).toHaveText('First')
  await expect(frame.locator('.slidev-vclick-hidden')).toHaveCount(0)
  await layout.tap({
    position: { x: box.width * 0.1, y: box.height * 0.8 },
  })
  await expect(frame.locator('.slidev-vclick-hidden')).toHaveCount(1)
})
