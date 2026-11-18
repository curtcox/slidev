import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { parseSync } from '@slidev/parser/core'
import { chromium, firefox, webkit } from 'playwright'
import { serve } from '../../vendor/fragment-kit-v0.4.4/tools/serve.mjs'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const cache = resolve(root, 'online/runtime/.cache')

// These exclusions cover demo filesystem components, the unavailable embed
// widget and an unbundled icon collection. New missing widgets must fail.
const titleComponents = [
  'MarkerCore',
  'MarkerPattern',
  'MarkerTips',
  'Marker',
]
const missingComponents: Record<string, Record<number, string[]>> = {
  'demo/starter/slides.md': {
    7: ['Counter', 'Tweet'],
  },
  'demo/composable-vue/slides.md': {
    2: ['ri-github-line', 'ri-twitter-line', 'ri-user-3-line'],
    11: ['DarkToggle', 'VueUse'],
    12: ['Connections'],
    16: ['VueUse'],
    22: ['VueUse'],
    23: ['VueUse'],
    29: ['VueUse'],
  },
}

const expectedErrors: Record<string, Record<number, string>> = {
  'demo/starter/slides.md': {
    5: 'Error: File snippets (<<<) are not available online',
    14: 'Error: Slide imports (src:) are not available online',
  },
}

async function main() {
  await mkdir(cache, { recursive: true })
  const engine = process.env.BROWSER || 'chromium'
  const browserType = ({ chromium, firefox, webkit })[engine as 'chromium' | 'firefox' | 'webkit']
  assert.ok(browserType, `Unknown browser: ${engine}`)
  const { server, url } = await serve({
    root: resolve(root, 'online/dist'),
    port: 0,
  })
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
  const errors: string[] = []
  const results: Record<string, unknown>[] = []
  const sources: Record<string, unknown> = {}
  const plantUmlRequests: string[] = []
  let passed = false
  try {
    browser = await browserType.launch()
    const page = await browser.newPage({
      viewport: { width: 1100, height: 900 },
    })
    page.on('pageerror', error => errors.push(String(error)))
    await page.route('**/*', (route) => {
      const request = route.request()
      const target = new URL(request.url())
      if (target.hostname === 'www.plantuml.com')
        plantUmlRequests.push(target.href)
      if (target.origin === new URL(url).origin || ['blob:', 'data:'].includes(target.protocol))
        return route.continue()
      if (request.resourceType() === 'image') {
        assert.equal(request.headers().referer, undefined, 'Remote images must not receive the editor URL')
        return route.fulfill({
          contentType: 'image/svg+xml',
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#e2e8f0"/></svg>',
        })
      }
      return route.abort()
    })
    await page.goto(url)
    await page.waitForSelector('body[data-ready="true"]')
    await page.evaluate(`(async () => {
      const { createPreviewBridge } = await import('./src/preview-bridge.js')
      document.body.replaceChildren()
      const host = document.createElement('div')
      host.id = 'corpus-preview'
      host.style.cssText = 'position:fixed;inset:0'
      document.body.append(host)
      const state = window.corpus = { events: [], errors: [] }
      state.bridge = createPreviewBridge({
        container: host,
        onStatus: (status, detail) => state.events.push({ status, ...detail }),
        onPosition: position => state.events.push(position),
        onError: message => state.errors.push(message),
      })
    })()`)
    const corpus = [
      'demo/starter/slides.md',
      'demo/composable-vue/slides.md',
      ...(await readdir(resolve(root, 'online/examples'))).filter(file => file.endsWith('.md')).sort().map(file => `online/examples/${file}`),
    ]
    for (const path of corpus) {
      const src = await readFile(resolve(root, path), 'utf8')
      const parsed = parseSync(src, 'slides.md')
      const slides = parsed.slides.filter(slide => !slide.frontmatter.disabled && !slide.frontmatter.hide)
      sources[path] = {
        sha256: createHash('sha256').update(src).digest('hex'),
        sourceSlides: parsed.slides.length,
        visibleSlides: slides.length,
        hiddenSlides: parsed.slides.filter(slide => slide.frontmatter.hide || slide.frontmatter.disabled).map(slide => slide.index + 1),
      }
      let mounted = false
      for (let index = 0; index < slides.length; index++) {
        const no = index + 1
        const label = `${path} slide ${no}`
        await page.evaluate(({ src, no, mounted }) => {
          const state = (window as any).corpus
          state.events = []
          state.errors = []
          if (mounted)
            state.bridge.goto(no)
          else
            state.bridge.render({ src, slide: no })
        }, { src, no, mounted })
        await page.waitForFunction(({ no, mounted }) => {
          const state = (window as any).corpus
          return state.errors.length || state.events.some((event: any) => mounted
            ? event.slide === no
            : event.status === 'rendered')
        }, { no, mounted })
        const failures = await page.evaluate(() => (window as any).corpus.errors)
        if (expectedErrors[path]?.[no]) {
          assert.deepEqual(failures, [expectedErrors[path][no]], label)
          assert.equal(await page.locator('#corpus-preview iframe').count(), 0, `${label}: failures must terminate the frame`)
          results.push({ path, slide: no, errors: failures })
          process.stdout.write(`${label}: ${failures.join('; ')}\n`)
          mounted = false
          continue
        }
        assert.deepEqual(failures, [], label)
        if (!mounted)
          assert.equal(await page.evaluate(() => (window as any).corpus.events.find((event: any) => event.status === 'rendered').slides), slides.length, `${label}: visible slide count`)
        mounted = true
        const frame = page.frames().find(frame => frame.parentFrame())!
        assert.equal(await frame.evaluate(() => globalThis.origin), 'null', label)
        assert.equal(await page.locator('#corpus-preview iframe').getAttribute('sandbox'), 'allow-scripts', label)
        const slide = frame.locator(`.slidev-page[data-slidev-no="${no}"]`)
        await slide.waitFor()
        const notices = (await frame.locator('#online-notices').allTextContents()).flatMap(notice => notice.split('\n'))
        const expectedMissing = [
          ...(path === 'demo/composable-vue/slides.md'
            ? titleComponents
            : []),
          ...(missingComponents[path]?.[no] ?? []),
        ].map(name => `Component ${name} is unavailable online`)
        assert.deepEqual(notices.toSorted(), expectedMissing.toSorted(), `${label}: every missing widget must be documented`)
        const content = slides[index].content
        const images = slide.locator('img[src^="https://"]')
        for (const image of await images.all()) {
          await image.evaluate(element => (element as HTMLImageElement).decode())
          assert.equal(await image.evaluate(element => (element as HTMLImageElement).naturalWidth), 100, `${label}: remote images must receive the mock bytes`)
        }
        const monaco = [
          ...content.matchAll(/^```[^\n]*\{monaco(?:-run)?\b/gm),
        ].length
        assert.equal(await slide.locator('.online-notice').count(), monaco, `${label}: Monaco must show its static-code notice`)
        for (const notice of await slide.locator('.online-notice').allTextContents())
          assert.match(notice, /Monaco editing and execution are not available yet/)
        if (/^```(?:ts|js|html|vue|yaml)\b/m.test(content))
          assert.ok(await slide.locator('pre.slidev-code span[style]').count() > 0, `${label}: code must actually highlight`)
        const diagrams = [
          ...content.matchAll(/^```mermaid\b/gm),
        ].length
        if (diagrams) {
          await slide.locator('.mermaid svg').nth(diagrams - 1).waitFor()
          assert.equal(await slide.locator('.mermaid svg').count(), diagrams, `${label}: every diagram must finish rendering`)
        }
        const plantUml = [
          ...content.matchAll(/^```plantuml\b/gm),
        ].length
        assert.equal(await slide.getByRole('button', { name: 'Enable PlantUML for this deck' }).count(), plantUml, `${label}: remote diagrams must await consent`)
        if (path === 'demo/starter/slides.md' && no === 11) {
          assert.equal(await slide.locator('.katex').count(), 5, `${label}: title, text, inline and block math must render`)
          assert.ok(await slide.locator('.katex .dishonored').count() > 0, `${label}: equation click ranges must initialize`)
        }
        const hidden = await slide.locator('.slidev-vclick-hidden').count()
        await page.evaluate((no) => {
          const state = (window as any).corpus
          state.events = []
          state.bridge.goto(no, 1000000)
        }, no)
        await page.waitForFunction((no) => {
          const state = (window as any).corpus
          return state.errors.length || state.events.some((event: any) => event.slide === no)
        }, no)
        assert.deepEqual(await page.evaluate(() => (window as any).corpus.errors), [], `${label}: final clicks`)
        const final = await page.evaluate(() => (window as any).corpus.events.find((event: any) => event.slide))
        assert.ok(final.click < 1000000, `${label}: clicks must clamp to their actual total`)
        if (hidden)
          assert.ok(final.click > 0, `${label}: hidden reveals must register click steps`)
        await page.evaluate((no) => {
          const state = (window as any).corpus
          state.events = []
          state.bridge.goto(no)
        }, no)
        await page.waitForFunction((no) => {
          const state = (window as any).corpus
          return state.errors.length || state.events.some((event: any) => event.slide === no)
        }, no)
        assert.deepEqual(await page.evaluate(() => (window as any).corpus.errors), [], `${label}: reset clicks`)
        assert.equal(await slide.locator('.slidev-vclick-hidden').count(), hidden, `${label}: initial click state must be restored`)
        results.push({
          path,
          slide: no,
          notices,
          monaco,
          diagrams,
          plantUml,
          finalClick: final.click,
        })
        process.stdout.write(`${label}: mounted; final click ${final.click}; ${notices.length} documented notices\n`)
      }
      await page.evaluate(() => (window as any).corpus.bridge.stop())
      assert.equal(await page.locator('#corpus-preview iframe').count(), 0)
    }
    assert.deepEqual(errors, [])
    assert.deepEqual(plantUmlRequests, [], 'Corpus loading must never enable remote diagrams')
    passed = true
    process.stdout.write(`${engine}: ${results.length} visible corpus slides verified, including two explicit file-import errors\n`)
  }
  catch (error) {
    errors.push(String(error))
    throw error
  }
  finally {
    const report = `${JSON.stringify({
      passed,
      browser: `${engine} ${browser?.version() ?? 'not launched'}`,
      scope: 'Unchanged starter, composable-vue and all online example sources, through the staged bridge in opaque frames; initial/final/reset clicks, lazy diagrams, math, highlighting, explicit unsupported features and error recovery. External images are mocked and other external traffic blocked. No visual comparison or phone timing.',
      runtimeSha256: createHash('sha256').update(await readFile(resolve(root, 'online/dist/runtime/sandbox.js'))).digest('hex'),
      sources,
      results,
      errors,
      plantUmlRequests,
    }, null, 2)}\n`
    await writeFile(resolve(cache, `corpus-${engine}.json`), report)
    if (!passed) {
      // The immutable shared workflow uploads this directory on failure.
      const artifacts = resolve(root, 'online/test-results')
      await mkdir(artifacts, { recursive: true })
      await writeFile(resolve(artifacts, `corpus-${engine}.json`), report)
    }
    await browser?.close()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
