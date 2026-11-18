import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { chromium, firefox, webkit } from 'playwright'
import YAML from 'yaml'
import { build } from '../../../packages/slidev/node/commands/build'
import { resolveOptions } from '../../../packages/slidev/node/options'
import { serve } from '../../vendor/fragment-kit-v0.4.4/tools/serve.mjs'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const cache = resolve(root, 'online/runtime/.cache/fidelity')
const fixtures = [
  { layout: 'cover', content: '# Theme cover\n\nA browser presentation.' },
  { layout: 'default', content: '# Markdown\n\nA **strong** statement and *emphasis*.\n\n- First\n- Second\n\n> A quotation.\n\n| Name | Value |\n| --- | --- |\n| Answer | 42 |' },
  { layout: 'section', content: '# Section heading' },
  { layout: 'fact', content: '# 42\n\nThe answer' },
  { layout: 'quote', content: '# A useful quotation\n\nAn author' },
  { layout: 'intro', content: '# Introducing Slidev\n\nA short introduction' },
  { layout: 'statement', content: '# A clear statement' },
  { layout: 'two-cols', content: '# Left column\n\nA paragraph\n\n::right::\n\n# Right column\n\nAnother paragraph' },
  { layout: 'default', content: '# Code and scoped styles\n\n```ts\nconst answer: number = 42\nconsole.log(answer)\n```\n\n<style scoped>h1 { color: rgb(120, 40, 60) }</style>' },
  { layout: 'default', content: '# Click reveals\n\n<v-clicks>\n\n- First reveal\n- Second reveal\n\n</v-clicks>' },
  { layout: 'default', content: '# Built-in components\n\nPage <SlideCurrentNo /> of <SlidesTotal />\n\n<RenderWhen context="main"><p>Main content</p></RenderWhen>\n\n<RenderWhen context="presenter"><p>Presenter only</p><template #fallback><p>Presenter fallback</p></template></RenderWhen>\n\n<LightOrDark><template #light><p>Light content</p></template><template #dark><p>Dark content</p></template></LightOrDark>\n\n<Transform :scale="0.8"><p>Scaled content</p></Transform>' },
  { layout: 'default', content: '# Table of contents\n\n<Toc columns="2" maxDepth="1" text-base />' },
  { layout: 'default', content: '# Bundled icons\n\n<div>\n<carbon:arrow-right class="text-4xl" /> <ph-heart class="text-red-500 text-4xl" /> <mdi:home class="text-4xl" /> <logos:vue class="text-4xl" /> <simple-icons:github class="text-4xl" /> <twemoji:rocket class="text-4xl" />\n\n<carbon:logo-github /> <carbon-arrow-right />\n</div>' },
]

async function main() {
  await mkdir(cache, { recursive: true })
  const docs: Record<string, string> = {}
  for (const theme of ['default', 'seriph']) {
    const deck = fixtures.map((fixture, index) => `---\n${YAML.stringify({
      ...(index === 0
        ? {
            theme,
            background: '#e2e8f0',
            fonts: {
              sans: 'Arial',
              serif: 'Georgia',
              mono: 'monospace',
              provider: 'none',
              local: ['Arial', 'Georgia', 'monospace'],
            },
            routerMode: 'hash',
            drawings: { enabled: false },
            record: false,
            presenter: false,
            browserExporter: false,
            wakeLock: false,
            monaco: false,
            twoslash: false,
            codeCopy: false,
            transition: 'none',
            colorSchema: 'light',
          }
        : {}),
      layout: fixture.layout,
    })}---\n\n${fixture.content}\n`).join('\n')
    docs[theme] = deck
    const folder = resolve(cache, 'decks', theme)
    await mkdir(folder, { recursive: true })
    const entry = resolve(folder, 'slides.md')
    await writeFile(entry, deck)
    if (!process.argv.includes('--skip-reference-build')) {
      await build(await resolveOptions({ entry }, 'build'), {
        base: './',
        logLevel: 'warn',
        build: {
          outDir: resolve(cache, 'reference', theme),
          emptyOutDir: true,
        },
      }, {} as any)
    }
  }
  const baseline = await serve({
    root: resolve(cache, 'reference'),
    port: 0,
  })
  const online = await serve({
    root: resolve(root, 'online/dist'),
    port: 0,
  })
  const engine = process.env.BROWSER || 'chromium'
  const browserType = ({ chromium, firefox, webkit })[engine as 'chromium' | 'firefox' | 'webkit']
  assert.ok(browserType, `Unknown browser ${engine}`)
  let browser
  try {
    browser = await browserType.launch()
    const referencePage = await browser.newPage({
      viewport: { width: 980, height: 552 },
    })
    const onlinePage = await browser.newPage({
      viewport: { width: 980, height: 552 },
    })
    const errors: string[] = []
    onlinePage.on('pageerror', error => errors.push(String(error)))
    await referencePage.route('https://**', route => route.abort())
    await onlinePage.route('https://**', route => route.abort())
    await onlinePage.goto(online.url)
    await onlinePage.waitForSelector('body[data-ready="true"]')
    await onlinePage.addStyleTag({ content: 'iframe { width: 100%; height: 100%; border: 0; display: block; }' })
    await onlinePage.evaluate(`(async () => {
      const { createPreviewBridge } = await import('./src/preview-bridge.js')
      document.body.replaceChildren()
      const host = document.createElement('div')
      host.style.cssText = 'position:fixed;inset:0'
      document.body.append(host)
      const state = window.fidelity = { rendered: false, errors: [] }
      state.bridge = createPreviewBridge({
        container: host,
        onStatus: status => state.rendered = status === 'rendered',
        onError: message => state.errors.push(message),
      })
    })()`)
    const decoder = await browser.newPage()
    await decoder.addScriptTag({
      path: resolve(root, 'online/spikes/phase-0/compare-pixels.js'),
    })
    const results = []
    for (const [theme, src] of Object.entries(docs)) {
      await onlinePage.evaluate((src) => {
        const state = (window as any).fidelity
        state.rendered = false
        state.bridge.render({ src })
      }, src)
      await onlinePage.waitForFunction(() => (window as any).fidelity.rendered || (window as any).fidelity.errors.length)
      assert.deepEqual(await onlinePage.evaluate(() => (window as any).fidelity.errors), [])
      for (let index = 0; index < fixtures.length; index++) {
        await referencePage.goto(`${baseline.url}${theme}/index.html#/${index + 1}`)
        const referenceSlide = referencePage.locator(`.slidev-page[data-slidev-no="${index + 1}"]:visible`).first()
        await referenceSlide.waitFor()
        await onlinePage.evaluate(slide => (window as any).fidelity.bridge.goto(slide), index + 1)
        const frame = onlinePage.frames().find(frame => frame.parentFrame())!
        const actualSlide = frame.locator(`.slidev-page[data-slidev-no="${index + 1}"]`)
        await actualSlide.waitFor()
        assert.equal(await frame.evaluate(() => globalThis.origin), 'null')
        assert.equal(await onlinePage.locator('iframe').getAttribute('sandbox'), 'allow-scripts')
        assert.equal(await frame.locator('#online-notices').count(), 0)
        await referencePage.evaluate(() => document.fonts.ready)
        await frame.evaluate(() => document.fonts.ready)
        // Settle layout/paint after a navigation in both clients.
        await frame.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
        const reference = await referenceSlide.screenshot({ animations: 'disabled' })
        const actual = await actualSlide.screenshot({ animations: 'disabled' })
        const diff = await decoder.evaluate(input => (window as any).comparePixels(input), {
          reference: [...reference],
          actual: [...actual],
        })
        assert.equal(diff.error, undefined)
        const folder = resolve(cache, 'screenshots', engine, theme)
        await mkdir(folder, { recursive: true })
        await writeFile(resolve(folder, `${index + 1}-cli.png`), reference)
        await writeFile(resolve(folder, `${index + 1}-online.png`), actual)
        await writeFile(resolve(folder, `${index + 1}-diff.png`), Buffer.from(diff.image.split(',')[1], 'base64'))
        const { image: _image, ...pixels } = diff
        results.push({
          theme,
          slide: index + 1,
          layout: fixtures[index].layout,
          ...pixels,
        })
        process.stdout.write(`${theme} ${index + 1} (${fixtures[index].layout}): ${diff.changed} differing pixels (${diff.exactChanged} exact)\n`)
      }
    }
    const runtime = await readFile(resolve(root, 'online/dist/runtime/sandbox.js'))
    const css = await readFile(resolve(root, 'online/dist/runtime/sandbox.css'))
    const report = {
      browser: `${engine} ${browser.version()}`,
      scope: `Actual staged runtime and editor bridge; ${fixtures.length} deterministic fixtures in each official theme. Full example corpus and phone timing remain open.`,
      adaptations: 'Local Arial/Georgia/monospace fonts, fixed cover background, no remote assets, disabled nonvisual services, initial click position.',
      tolerance: { channelDelta: 8, changedPixelRatio: 0.001 },
      fixtures: Object.fromEntries(Object.entries(docs).map(([name, src]) => [
        name,
        createHash('sha256').update(src).digest('hex'),
      ])),
      runtimeSha256: createHash('sha256').update(runtime).digest('hex'),
      currentPayloadGzip: gzipSync(runtime).length + gzipSync(css).length,
      results,
      errors,
    }
    await writeFile(resolve(cache, `report-${engine}.json`), `${JSON.stringify(report, null, 2)}\n`)
    assert.deepEqual(errors, [])
    assert.ok(results.every(result => result.ratio <= 0.001), 'Visual differences exceed 0.1%; inspect online/runtime/.cache/fidelity/screenshots')
  }
  finally {
    await browser?.close()
    await Promise.all([baseline.server, online.server].map(server => new Promise(resolve => server.close(resolve))))
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
