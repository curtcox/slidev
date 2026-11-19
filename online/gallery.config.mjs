import process from 'node:process'
import { examples } from './src/examples.js'
import { walk } from './vendor/fragment-kit-v0.4.4/tools/lib.mjs'

export default {
  output: 'gallery',
  catalog: examples,
  dependencies: [
    'src/examples.js',
    'src/preview-bridge.js',
    'src/runtime-assets.js',
    'src/document-type.js',
    'gallery.html',
    'style.css',
    'vendor/fragment-kit-v0.4.4/vendor/hashbin-sdk-v0.6.0.mjs',
    ...(await walk(new URL('runtime/dist/', import.meta.url).pathname)).map(file => `runtime/dist/${file}`),
  ],
  async renderCover(page, example) {
    const base = process.env.SLIDEV_GALLERY_URL
    if (!base)
      throw new Error('Run npm run gallery to start the local cover server')
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.goto(base)
    await page.waitForSelector('body[data-ready="true"]')
    await page.evaluate(async (doc) => {
      const { createPreviewBridge } = await import('./src/preview-bridge.js')
      document.body.replaceChildren()
      const host = document.createElement('div')
      host.id = 'preview'
      document.body.append(host)
      host.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:1000;background:white'
      const state = window.galleryCover = { rendered: false, errors: [] }
      state.bridge = createPreviewBridge({
        container: host,
        onStatus: status => state.rendered = status === 'rendered',
        onError: message => state.errors.push(message),
      })
      state.bridge.render(doc)
    }, example.document)
    await page.waitForFunction(() => window.galleryCover.rendered || window.galleryCover.errors.length)
    const errors = await page.evaluate(() => window.galleryCover.errors)
    if (errors.length)
      throw new Error(`${example.id}: ${errors.join('; ')}`)
    const frame = page.frames().find(frame => frame.parentFrame())
    if (await frame.evaluate(() => globalThis.origin) !== 'null' || await page.locator('#preview iframe').getAttribute('sandbox') !== 'allow-scripts')
      throw new Error('Gallery covers require an opaque preview')
    if (await frame.locator('#online-notices').count())
      throw new Error(`${example.id}: unexpected runtime notice`)
    await frame.evaluate(async () => {
      await document.fonts.ready
      await Promise.all([...document.images].map(image => image.decode()))
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    })
    return page.locator('#preview')
  },
}
