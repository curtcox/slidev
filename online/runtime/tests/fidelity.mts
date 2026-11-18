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
import fontCatalog from '../src/font-catalog.json' with { type: 'json' }

const root = fileURLToPath(new URL('../../../', import.meta.url))
const cache = resolve(root, 'online/runtime/.cache/fidelity')
const fixtures = [
  { layout: 'default', expectedPlantUml: true, content: '# Remote diagram\n\n```plantuml {scale: 0.7, alt: \'Conversation\'}\n@startuml\nAlice -> Bob: Hello\n@enduml\n```\n\nA caption below the diagram.' },
  { layout: 'default', expectedDragElements: 3, content: '# Positioned elements\n\n<v-drag pos="100,130,180,80" class="bg-blue-100">A draggable box</v-drag>\n\n<div v-drag="[450,200,200,70]" class="bg-red-100">A directive</div>\n\n<v-drag-arrow pos="150,340,300,40" color="red" />' },
  { layout: 'default', expectedDiagrams: 1, content: '# A diagram\n\n```mermaid\ngraph LR\n A[Author] --> B[Preview] --> C[Present]\n```' },
  { layout: 'default', expectedDiagrams: 1, content: '# A conversation\n\n```mermaid\nsequenceDiagram\n Alice->>Bob: Hello\n Bob-->>Alice: Hi\n```' },
  { layout: 'default', expectedMath: 2, content: String.raw`# Equations

Inline $E = mc^2$.

$$ {1|2|all}
\begin{aligned}
a &= b + c \\
x &= y + z
\end{aligned}
$$
` },
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
  { layout: 'default', expectedIcons: 8, content: '# Bundled icons\n\n<div>\n<carbon:arrow-right class="text-4xl" /> <ph-heart class="text-red-500 text-4xl" /> <mdi:home class="text-4xl" /> <logos:vue class="text-4xl" /> <simple-icons:github class="text-4xl" /> <twemoji:rocket class="text-4xl" />\n<carbon:logo-github /> <carbon-arrow-right />\n</div>' },
  { layout: 'default', expectedCodeBlocks: 3, content: '# Lazy syntax languages\n\n```py\ndef greet(name):\n    return f"Hello {name}"\n```\n\n```rs\nfn main() { println!("hello"); }\n```\n\n```vue\n<script setup lang="ts">const n: number = 1</script>\n<template><div>{{ n }}</div></template>\n```' },
]

async function main() {
  await mkdir(cache, { recursive: true })
  const docs: Record<string, string> = {}
  type Fixture = typeof fixtures[number] & { expectedFonts?: string[] }
  const variants = ['default', 'seriph'].flatMap(theme => [
    {
      name: theme,
      theme,
      cases: fixtures as Fixture[],
      themeFonts: false,
    },
    {
      name: `${theme}-fonts`,
      theme,
      themeFonts: true,
      cases: [
        {
          layout: 'default',
          expectedFonts: theme === 'default'
            ? ['Nunito Sans', 'Fira Code']
            : ['PT Serif', 'PT Mono'],
          content: `# Bundled theme fonts\n\n<div style="font-family: '${theme === 'default'
            ? 'Nunito Sans'
            : 'PT Serif'}'">Regular, <strong>bold</strong> and <em>italic</em>. Latin: Āā. Cyrillic: Привет.</div>\n\n\`\`\`js\nconst answer = 42\n\`\`\``,
        },
      ] as Fixture[],
    },
  ])
  for (const { name, theme, cases, themeFonts } of variants) {
    const deck = cases.map((fixture, index) => `---\n${YAML.stringify({
      ...(index === 0
        ? {
            theme,
            background: '#e2e8f0',
            fonts: themeFonts
              ? {}
              : {
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
    docs[name] = deck
    const folder = resolve(cache, 'decks', name)
    await mkdir(folder, { recursive: true })
    const entry = resolve(folder, 'slides.md')
    await writeFile(entry, deck)
    if (!process.argv.includes('--skip-reference-build')) {
      await build(await resolveOptions({ entry }, 'build'), {
        base: './',
        logLevel: 'warn',
        build: {
          outDir: resolve(cache, 'reference', name),
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
      serviceWorkers: 'block',
    })
    const onlinePage = await browser.newPage({
      viewport: { width: 980, height: 552 },
      serviceWorkers: 'block',
    })
    const errors: string[] = []
    const fontCss = new Map(await Promise.all(Object.entries(fontCatalog).map(async ([family, entry]) => [
      family,
      await readFile(resolve(root, 'online/dist/runtime/fonts', `${entry.id}.css`), 'utf8'),
    ] as const)))
    onlinePage.on('pageerror', error => errors.push(String(error)))
    for (const page of [referencePage, onlinePage]) {
      await page.context().route('**/*', (route) => {
        const url = new URL(route.request().url())
        if (url.origin === 'https://fonts.googleapis.com') {
          const families = url.searchParams.getAll('family').map(value => value.split(':')[0])
          assert.ok(families.length && families.every(family => fontCss.has(family)), 'CLI must only request the reviewed theme fonts')
          return route.fulfill({
            contentType: 'text/css',
            body: families.map(family => fontCss.get(family)).join('\n'),
          })
        }
        if (url.href.startsWith('https://www.plantuml.com/plantuml/svg/'))
          return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="80"><text x="10" y="30">Alice to Bob</text></svg>' })
        if (url.hostname === '127.0.0.1' || url.protocol === 'blob:' || url.protocol === 'data:')
          return route.continue()
        return route.abort()
      })
    }
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
    for (const { name: theme, cases } of variants) {
      const src = docs[theme]
      await onlinePage.evaluate((src) => {
        const state = (window as any).fidelity
        state.rendered = false
        state.bridge.render({ src })
      }, src)
      await onlinePage.waitForFunction(() => (window as any).fidelity.rendered || (window as any).fidelity.errors.length)
      assert.deepEqual(await onlinePage.evaluate(() => (window as any).fidelity.errors), [])
      for (let index = 0; index < cases.length; index++) {
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
        if (cases[index].expectedPlantUml) {
          await actualSlide.getByRole('button', { name: 'Enable PlantUML for this deck' }).click()
          for (const slide of [actualSlide, referenceSlide]) {
            const image = slide.getByAltText('Conversation')
            await image.evaluate(async (element) => {
              const image = element as HTMLImageElement
              if (!image.complete) {
                await new Promise<void>((resolve, reject) => {
                  image.addEventListener('load', () => resolve(), { once: true })
                  image.addEventListener('error', () => reject(new Error('Mock diagram failed to load')), { once: true })
                })
              }
            })
            assert.equal(await image.evaluate(element => (element as HTMLImageElement).naturalWidth), 240, 'Both renderers must receive the mocked SVG')
          }
        }
        if (cases[index].expectedDragElements) {
          for (const slide of [actualSlide, referenceSlide])
            assert.equal(await slide.locator('[data-drag-id]').count(), cases[index].expectedDragElements)
        }
        if (cases[index].expectedDiagrams) {
          for (const slide of [actualSlide, referenceSlide]) {
            await slide.locator('.mermaid svg').nth(cases[index].expectedDiagrams! - 1).waitFor()
            assert.equal(await slide.locator('.mermaid svg').count(), cases[index].expectedDiagrams)
          }
        }
        if (cases[index].expectedMath) {
          for (const slide of [actualSlide, referenceSlide]) {
            assert.equal(await slide.locator('.katex').count(), cases[index].expectedMath)
            assert.ok(await slide.locator('.katex .dishonored').count() > 0)
          }
        }
        if (cases[index].expectedIcons) {
          assert.equal(await actualSlide.locator('svg.slidev-icon').count(), cases[index].expectedIcons, 'Every fixture icon must render as SVG online')
          assert.equal(await referenceSlide.locator('svg.slidev-icon').count(), cases[index].expectedIcons, 'Every fixture icon must render as SVG in the CLI')
        }
        if (cases[index].expectedCodeBlocks) {
          for (const slide of [actualSlide, referenceSlide]) {
            assert.equal(await slide.locator('pre.slidev-code').count(), cases[index].expectedCodeBlocks)
            assert.ok(await slide.locator('pre.slidev-code span[style]').count() > 10, 'Grammar fixtures must contain highlighted tokens')
          }
        }
        if (cases[index].expectedFonts) {
          for (const slide of [actualSlide, referenceSlide]) {
            const families = await slide.evaluate(async () => {
              document.body.getBoundingClientRect()
              await document.fonts.ready
              return [...document.fonts].filter(font => font.status === 'loaded').map(font => font.family.replaceAll('"', '').replaceAll('\'', ''))
            })
            for (const family of cases[index].expectedFonts!)
              assert.ok(families.includes(family), `${theme}: ${family} must actually render in both clients`)
          }
        }
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
          layout: cases[index].layout,
          ...pixels,
        })
        process.stdout.write(`${theme} ${index + 1} (${cases[index].layout}): ${diff.changed} differing pixels (${diff.exactChanged} exact)\n`)
      }
    }
    const runtime = await readFile(resolve(root, 'online/dist/runtime/sandbox.js'))
    const css = await readFile(resolve(root, 'online/dist/runtime/sandbox.css'))
    const report = {
      browser: `${engine} ${browser.version()}`,
      scope: `Actual staged runtime and editor bridge; ${fixtures.length} deterministic fixtures in each official theme plus two theme-font fixtures. Full example corpus and phone timing remain open.`,
      adaptations: 'Local Arial/Georgia/monospace fonts in the original fixtures; pinned font bytes supplied identically to both clients in theme-font fixtures; fixed cover background, mocked PlantUML SVG after explicit consent, no external network, disabled nonvisual services, initial click position.',
      tolerance: { channelDelta: 8, changedPixelRatio: 0.001 },
      fixtures: Object.fromEntries(Object.entries(docs).map(([name, src]) => [
        name,
        createHash('sha256').update(src).digest('hex'),
      ])),
      runtimeSha256: createHash('sha256').update(runtime).digest('hex'),
      currentPayloadGzip: gzipSync(runtime).length + gzipSync(css).length,
      bundledFontPayloadGzip: Object.fromEntries([...fontCss].map(([family, css]) => [family, gzipSync(css).length])),
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
