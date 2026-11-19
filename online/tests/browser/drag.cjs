const assert = require('node:assert/strict')
const process = require('node:process')
const { chromium, firefox, webkit, expect } = require('@playwright/test')

async function main() {
  const engine = process.argv[3] || process.env.BROWSER || 'chromium'
  const browser = await ({ chromium, firefox, webkit })[engine].launch()
  try {
    const context = await browser.newContext({
      viewport: { width: 1000, height: 800 },
    })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(String(error)))
    const initialize = async () => {
      await page.goto(process.argv[2] || 'http://127.0.0.1:8016/')
      await page.waitForSelector('body[data-ready="true"]')
      await page.evaluate(async () => {
        const { createPreviewBridge } = await import('./src/preview-bridge.js')
        const host = document.createElement('div')
        host.id = 'drag-test'
        host.style.cssText = 'position:fixed;top:0;left:0;width:980px;height:552px;z-index:2000;background:white'
        const style = document.createElement('style')
        style.textContent = '#drag-test iframe {width:100%;height:100%;border:0} #drag-editor {position:fixed;top:560px;left:0;width:980px;height:200px;z-index:2000}'
        document.head.append(style)
        const editor = document.createElement('textarea')
        editor.id = 'drag-editor'
        editor.setAttribute('aria-label', 'Markdown')
        document.body.append(host, editor)
        const state = window.dragTest = {
          ready: false,
          patches: [],
          errors: [],
          position: 0,
          editor,
        }
        state.bridge = createPreviewBridge({
          container: host,
          getSource: () => editor.value,
          onSourceChange: (src, patch) => {
            editor.value = src
            state.patches.push(patch)
          },
          onDragError: message => state.errors.push(message),
          onError: message => state.errors.push(message),
          onStatus: status => state.ready = status === 'rendered',
          onPosition: position => state.position = position.slide,
        })
      })
    }
    const source = '---\nlayout: default\ndragPos:\n  named: 50,330,100,60\n---\n# Move things\n\n<VDrag pos="100,100,180,80" class="bg-blue-100">Box</VDrag>\n\n<div v-drag="[400,120,160,60]" class="bg-red-100">Directive</div>\n\n<VDragArrow pos="150,430,200,30" color="red" />\n\n<VDrag pos="named">Named</VDrag>\n\n<button class="absolute left-600px top-400px z-200" @click="count++">Count {{ count }}</button>\n\n<script setup>import { ref } from "vue"; const count = ref(0)</script>\n\n---\n\n# Auto height\n\n<VDrag pos="100,150,200,_" class="bg-green-100">Auto box</VDrag>\n\n<VDrag pos="400,300,80,40">Repeat one</VDrag> <VDrag pos="550,300,80,40">Repeat two</VDrag>\n\n<!-- keep these notes -->\n'
    const render = async (src = source) => {
      await page.evaluate((src) => {
        const state = window.dragTest
        state.ready = false
        state.errors = []
        state.patches = []
        state.editor.value = src
        state.bridge.render({ src })
      }, src)
      await page.waitForFunction(() => window.dragTest.ready || window.dragTest.errors.length)
      assert.deepEqual(await page.evaluate(() => window.dragTest.errors), [])
    }
    const frame = page.frameLocator('#drag-test iframe')
    const moveControl = async (selector = '#drag-control-container', dx = 40, dy = 30) => {
      const box = await frame.locator(selector).boundingBox()
      assert.ok(box)
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.mouse.down()
      await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 3 })
      await page.mouse.up()
    }
    const count = () => page.evaluate(() => window.dragTest.patches.length)
    const latest = () => page.evaluate(() => window.dragTest.patches.at(-1))
    const waitForPosition = position => expect.poll(async () => (await latest())?.position).toBe(position)
    const changed = async (before) => {
      await expect.poll(count).toBeGreaterThan(before)
    }
    const goto = async (slide) => {
      await page.evaluate(slide => window.dragTest.bridge.goto(slide), slide)
      await page.waitForFunction(slide => window.dragTest.position === slide, slide)
    }
    const verify = async () => {
      assert.equal(await page.locator('#drag-test iframe').getAttribute('sandbox'), 'allow-scripts')
      assert.equal(await frame.locator('#online-notices').count(), 0)
      assert.equal(await count(), 0, 'Initial layout must not edit the source')
      await frame.getByRole('button', { name: 'Count 0' }).click()
      const box = frame.getByText('Box', { exact: true })
      await box.dblclick()
      await frame.locator('#drag-control-container').waitFor()
      await moveControl()
      await waitForPosition('140,130,180,80')
      assert.equal((await latest()).source, 'prop')
      assert.equal(await frame.getByRole('button', { name: 'Count 1' }).count(), 1, 'Writeback must not rerun author scripts')
      assert.match(await page.getByRole('textbox', { name: 'Markdown' }).inputValue(), /pos="140,130,180,80"/)
      let before = await count()
      const handle = frame.locator('#drag-control-container [style*="cursor: ew-resize"]').nth(1)
      const b = await handle.boundingBox()
      assert.ok(b)
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
      await page.mouse.down()
      await page.mouse.move(b.x + b.width / 2 + 30, b.y + b.height / 2)
      await page.mouse.up()
      await changed(before)
      assert.ok(Number((await latest()).position.split(',')[2]) > 180)
      const rotate = frame.locator('#drag-control-container [style*="cursor: grab"]')
      const rotationHandle = await rotate.boundingBox()
      const bounds = await frame.locator('#drag-control-container').boundingBox()
      assert.ok(rotationHandle && bounds)
      await page.mouse.move(rotationHandle.x + rotationHandle.width / 2, rotationHandle.y + rotationHandle.height / 2)
      await page.mouse.down()
      await page.mouse.move(bounds.x + bounds.width + 30, bounds.y + bounds.height / 2, { steps: 3 })
      await page.mouse.up()
      await expect.poll(async () => (await latest())?.position.split(',')[4]).toBe('90')
      const saved = (await latest()).position
      before = await count()
      await frame.locator('body').press('ArrowRight', { delay: 100 })
      await changed(before)
      assert.equal(await page.evaluate(() => window.dragTest.position), 1, 'Drag arrows must not navigate slides')
      assert.ok(Number((await latest()).position.split(',')[0]) > Number(saved.split(',')[0]))
      await frame.locator('body').press('Escape')
      await expect(frame.locator('#drag-control-container')).toHaveCount(0)
      const geometry = (await latest()).position
      await goto(2)
      await goto(1)
      assert.equal(await frame.getByText('Box', { exact: true }).evaluate(el => el.style.left), `${geometry.split(',')[0]}px`, 'Geometry must survive navigation')
      await frame.getByText('Directive', { exact: true }).dblclick()
      await moveControl()
      await waitForPosition('[440,150,160,60]')
      assert.equal((await latest()).source, 'directive')
      assert.match(await page.getByRole('textbox', { name: 'Markdown' }).inputValue(), /v-drag="\[440,150,160,60\]"/)
      await frame.locator('body').press('Escape')
      await frame.getByText('Named', { exact: true }).dblclick()
      await moveControl()
      await waitForPosition('90,360,100,60')
      assert.equal((await latest()).source, 'frontmatter')
      assert.match(await page.getByRole('textbox', { name: 'Markdown' }).inputValue(), /named: 90,360,100,60/)
      await frame.locator('body').press('Escape')
      await frame.locator('svg[data-drag-id] line').last().dblclick()
      await moveControl()
      await waitForPosition('190,460,200,30')
      assert.match(await page.getByRole('textbox', { name: 'Markdown' }).inputValue(), /VDragArrow pos="190,460,200,30"/)
      await goto(2)
      before = await count()
      await frame.getByText('Auto box', { exact: true }).dblclick()
      await moveControl()
      await changed(before)
      assert.match((await latest()).position, /,_$/)
      assert.match(await page.getByRole('textbox', { name: 'Markdown' }).inputValue(), /keep these notes/)
      for (const [label, x] of [
        ['Repeat one', 440],
        ['Repeat two', 590],
      ]) {
        await frame.locator('body').press('Escape')
        await frame.getByText(label, { exact: true }).dblclick()
        await moveControl()
        await waitForPosition(`${x},330,80,40`)
      }
      const cumulative = await page.getByRole('textbox', { name: 'Markdown' }).inputValue()
      assert.match(cumulative, /pos="440,330,80,40"/)
      assert.match(cumulative, /pos="590,330,80,40"/)

      assert.deepEqual(await page.evaluate(() => window.dragTest.errors), [])
      await frame.locator('body').press('Escape')
      await expect(frame.locator('#drag-control-container')).toHaveCount(0)
      await page.getByRole('textbox', { name: 'Markdown' }).fill('# User changed the Markdown')
      await frame.getByText('Repeat two', { exact: true }).dblclick()
      await moveControl()
      await expect.poll(() => page.evaluate(() => window.dragTest.errors.at(-1))).toMatch(/Markdown changed/)
      assert.equal(await page.getByRole('textbox', { name: 'Markdown' }).inputValue(), '# User changed the Markdown')
    }
    await initialize()
    await render()
    await verify()
    await page.evaluate(() => {
      document.querySelector('#drag-test').style.cssText += ';width:490px;height:276px'
    })
    await render(source.replace('layout: default', 'layout: default\nzoom: 1.5'))
    await frame.getByText('Box', { exact: true }).dblclick()
    await moveControl('#drag-control-container', 30, 30)
    // Pointer deltas must account for frame scale and slide zoom.
    await waitForPosition('140,140,180,80')
    await page.waitForFunction(() => document.querySelector('#offline-status').textContent === 'Available offline')
    await context.setOffline(true)
    await initialize()
    await render()
    await verify()
    assert.deepEqual(errors, [])
    await context.close()
    process.stdout.write(`${engine}: drag components/directive/arrows, resize, keyboard, named and auto-height positions, cumulative writeback, stale-source protection, navigation and offline reload passed\n`)
  }
  finally { await browser.close() }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
