import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname, extname, resolve, sep } from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { gzipSync } from 'node:zlib'
import { parseSync } from '@slidev/parser/core'
import vue from '@vitejs/plugin-vue'
import { chromium } from 'playwright-chromium'
import UnoCSS from 'unocss/vite'
import Icons from 'unplugin-icons/vite'
import { build as viteBuild } from 'vite'
import YAML from 'yaml'
import { build as slidevBuild } from '../../../packages/slidev/node/commands/build'
import { resolveOptions } from '../../../packages/slidev/node/options'
import setupUnocss from '../../../packages/slidev/node/setups/unocss'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const spike = fileURLToPath(new URL('./', import.meta.url))
const cache = resolve(spike, '.cache/fidelity')
const selectedSlides = [1, 2, 3, 8, 16]
const themes = ['default', 'seriph']

async function server(folder: string, fallback = false) {
  const instance = createServer(async (req, res) => {
    try {
      let path = resolve(folder, `.${decodeURIComponent(new URL(req.url!, 'http://localhost').pathname)}`)
      assert.ok(path === folder || path.startsWith(folder + sep))
      if (path === folder || path.endsWith(sep))
        path = resolve(path, 'index.html')
      let body
      try {
        body = await readFile(path)
      }
      catch (error) {
        if (!fallback)
          throw error
        path = resolve(dirname(path), 'index.html')
        body = await readFile(path)
      }
      const types: Record<string, string> = {
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'text/javascript',
        '.mjs': 'text/javascript',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.woff2': 'font/woff2',
      }
      const gzipped = ['.js', '.mjs', '.css'].includes(extname(path))
      res.writeHead(200, {
        'Content-Type': types[extname(path)] || 'application/octet-stream',
        ...(gzipped
          ? { 'Content-Encoding': 'gzip' }
          : {}),
      })
      res.end(gzipped
        ? gzipSync(body)
        : body)
    }
    catch { res.writeHead(404).end() }
  })
  await new Promise<void>((resolve, reject) => {
    instance.once('error', reject)
    instance.listen(0, '127.0.0.1', resolve)
  })
  return { instance, url: `http://127.0.0.1:${(instance.address() as any).port}` }
}

async function main() {
  const { values } = parseArgs({
    options: {
      'sdk-candidate': { type: 'string' },
      'skip-reference-build': { type: 'boolean' },
      'skip-performance': { type: 'boolean' },
    },
  })
  assert.ok(values['sdk-candidate'], 'Pass --sdk-candidate /path/to/hashbin.js')
  const sdkPath = resolve(values['sdk-candidate'])
  const sdk = await readFile(sdkPath)
  const { DOM_SANDBOX_BOOTSTRAP_HASH } = await import(pathToFileURL(sdkPath).href)
  const original = await readFile(resolve(root, 'demo/starter/slides.md'), 'utf8')
  const starter = parseSync(original, 'starter.md')
  const placeholder = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="#e2e8f0"/><path d="M0 200L200 0L400 200" fill="#38bdf8"/></svg>').toString('base64')}`
  const docs: Record<string, string> = {}
  const themeMetadata: Record<string, { version: string, license: string, licenseSha256: string, stylesSourceBytes: number, coverSourceBytes: number }> = {}
  let options
  for (const theme of themes) {
    const packageFolder = resolve(root, `node_modules/@slidev/theme-${theme}`)
    const [packageJson, license, styles, cover] = await Promise.all([
      readFile(resolve(packageFolder, 'package.json'), 'utf8'),
      readFile(resolve(packageFolder, 'LICENSE')),
      readFile(resolve(packageFolder, 'styles/layouts.css')),
      readFile(resolve(packageFolder, 'layouts/cover.vue')),
    ])
    const metadata = JSON.parse(packageJson)
    assert.equal(metadata.version, '0.25.0', 'Updated themes require a fresh compatibility, license and size review')
    assert.equal(metadata.license, 'MIT')
    themeMetadata[theme] = {
      version: metadata.version,
      license: metadata.license,
      licenseSha256: createHash('sha256').update(license).digest('hex'),
      stylesSourceBytes: styles.length,
      coverSourceBytes: cover.length,
    }
    const folder = resolve(cache, 'reference', theme)
    const deckFolder = resolve(cache, 'decks', theme)
    await mkdir(deckFolder, { recursive: true })
    const src = selectedSlides.map((no, index) => {
      const slide = starter.slides[no - 1]
      const frontmatter = index === 0
        ? {
            ...slide.frontmatter,
            theme,
            background: '#e2e8f0',
            comark: false,
            fonts: {
              sans: 'Arial',
              serif: 'Georgia',
              mono: 'monospace',
              provider: 'none',
              local: ['Arial', 'Georgia', 'monospace'],
            },
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
        : slide.frontmatter
      return `---\n${YAML.stringify(frontmatter)}---\n\n${slide.content.replace(/src="https:[^"]+"/g, `src="${placeholder}"`)}\n`
    }).join('\n')
    docs[theme] = src
    const entry = resolve(deckFolder, 'slides.md')
    await writeFile(entry, src)
    const resolved = await resolveOptions({ entry }, 'build')
    if (theme === 'default')
      options = resolved
    if (!values['skip-reference-build']) {
      await slidevBuild(resolved, {
        base: `/${theme}/`,
        logLevel: 'warn',
        build: { outDir: folder, emptyOutDir: true },
      }, {} as any)
    }
  }
  assert.ok(options)
  const output = resolve(cache, 'online')
  await viteBuild({
    configFile: false,
    root,
    logLevel: 'warn',
    plugins: [
      vue(),
      Icons({ compiler: 'vue3', defaultClass: 'slidev-icon' }),
      UnoCSS({
        configFile: false,
        ...await setupUnocss(options),
      }),
    ],
    resolve: {
      alias: {
        'unocss': resolve(spike, 'uno-browser.ts'),
        '#slidev/configs': resolve(spike, 'configs.ts'),
        '#slidev/global-layers': resolve(spike, 'global-layers.ts'),
        '@slidev/client': resolve(root, 'packages/client'),
      },
    },
    define: { '__DEV__': 'false', '__SLIDEV_HASH_ROUTE__': 'false', 'process.env.NODE_ENV': '"production"' },
    build: {
      outDir: output,
      emptyOutDir: true,
      minify: true,
      cssMinify: false,
      lib: {
        entry: resolve(spike, 'fidelity-runtime.ts'),
        formats: ['es'],
        fileName: () => 'runtime.js',
        cssFileName: 'runtime',
      },
      rolldownOptions: {
        output: { codeSplitting: false },
      },
    },
  })
  await writeFile(resolve(output, 'sdk.mjs'), sdk)
  await copyFile(resolve(spike, 'fidelity-parent.js'), resolve(output, 'parent.js'))
  await writeFile(resolve(output, 'index.html'), `<!doctype html><meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self' blob: '${DOM_SANDBOX_BOOTSTRAP_HASH}'; worker-src 'self' blob:; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'self'; frame-src 'self' blob:; base-uri 'none'; form-action 'none'">
  <title>Opaque Slidev fidelity probe</title><div id="preview"></div><script type="module" src="./parent.js"></script>`)
  const assets: Record<string, { type: string, sha256: string }> = {}
  for (const [file, type] of Object.entries({
    'index.html': 'text/html',
    'parent.js': 'text/javascript',
    'sdk.mjs': 'text/javascript',
    'runtime.js': 'text/javascript',
    'runtime.css': 'text/css',
  })) {
    const asset = {
      type,
      sha256: createHash('sha256').update(await readFile(resolve(output, file))).digest('hex'),
    }
    assets[`/${file}`] = asset
    if (file === 'index.html')
      assets['/'] = asset
  }
  const version = createHash('sha256').update(JSON.stringify(assets)).digest('hex').slice(0, 16)
  const sw = (await readFile(resolve(spike, 'service-worker.js'), 'utf8'))
    .replace('const assets = {}', `const assets = ${JSON.stringify(assets)}`)
    .replace('__VERSION__', version)
  await writeFile(resolve(output, 'service-worker.js'), sw)
  const baseline = await server(resolve(cache, 'reference'), true)
  const online = await server(output)
  const browser = await chromium.launch()
  const results = []
  const errors: string[] = []
  try {
    const referencePage = await browser.newPage({
      viewport: { width: 980, height: 552 },
    })
    const onlinePage = await browser.newPage({
      viewport: { width: 1000, height: 600 },
    })
    await referencePage.route('https://**', route => route.abort())
    onlinePage.on('pageerror', error => errors.push(String(error)))
    await onlinePage.goto(online.url)
    await onlinePage.waitForFunction(() => (globalThis as any).fidelityRender)
    const decodePage = await browser.newPage()
    await decodePage.addScriptTag({
      path: resolve(spike, 'compare-pixels.js'),
    })
    for (const theme of themes) {
      for (let index = 0; index < selectedSlides.length; index++) {
        await referencePage.goto(`${baseline.url}/${theme}/${index + 1}`)
        const referenceSlide = referencePage.locator(`.slidev-page[data-slidev-no="${index + 1}"]:visible`).first()
        await referenceSlide.waitFor()
        await referencePage.evaluate(() => document.fonts.ready)
        const rendered = await onlinePage.evaluate(async ({ src, index }) => (globalThis as any).fidelityRender(src, index), { src: docs[theme], index })
        assert.equal(rendered.origin, 'null')
        const expectedTitle = starter.slides[selectedSlides[index] - 1].title!
        assert.ok(rendered.text.includes(expectedTitle), 'The runtime must render the expected starter heading')
        assert.equal(await referenceSlide.locator('h1').first().textContent(), expectedTitle)
        const frame = onlinePage.frames().find(frame => frame !== onlinePage.mainFrame())!
        await frame.locator('.slidev-page').waitFor()
        await frame.locator('img').evaluateAll(images => Promise.all(images.map(img => (img as HTMLImageElement).decode().catch(() => {}))))
        await referenceSlide.locator('img').evaluateAll(images => Promise.all(images.map(img => (img as HTMLImageElement).decode().catch(() => {}))))
        const reference = await referenceSlide.screenshot({ animations: 'disabled' })
        const actual = await frame.locator('.slidev-page').screenshot({ animations: 'disabled' })
        const diff = await decodePage.evaluate(inputs => (globalThis as any).comparePixels(inputs), {
          reference: [...reference],
          actual: [...actual],
        })
        assert.equal(diff.error, undefined)
        const folder = resolve(cache, 'screenshots', theme)
        await mkdir(folder, { recursive: true })
        await writeFile(resolve(folder, `${index + 1}-cli.png`), reference)
        await writeFile(resolve(folder, `${index + 1}-online.png`), actual)
        await writeFile(resolve(folder, `${index + 1}-diff.png`), Buffer.from(diff.image!.split(',')[1], 'base64'))
        const result = {
          theme,
          starterSlide: selectedSlides[index],
          index: index + 1,
          changed: diff.changed,
          exactChanged: diff.exactChanged,
          maxChannelDelta: diff.maxChannelDelta,
          total: diff.total,
          ratio: diff.ratio,
          elapsedMs: rendered.elapsedMs,
        }
        results.push(result)
        process.stdout.write(`${JSON.stringify(result)}\n`)
      }
    }
    await onlinePage.evaluate(async () => {
      await navigator.serviceWorker.register('./service-worker.js')
      await navigator.serviceWorker.ready
    })
    await onlinePage.reload()
    await onlinePage.waitForFunction(() => navigator.serviceWorker.controller)
    await onlinePage.context().setOffline(true)
    await onlinePage.reload()
    await onlinePage.waitForFunction(() => (globalThis as any).fidelityRender)
    const offlineRender = await onlinePage.evaluate(src => (globalThis as any).fidelityRender(src, 0), docs.default)
    assert.equal(offlineRender.origin, 'null')
    assert.equal(offlineRender.serviceWorkerControlled, false)
    const offlineFrame = onlinePage.frames().find(frame => frame !== onlinePage.mainFrame())!
    const offlinePng = await offlineFrame.locator('.slidev-page').screenshot({ animations: 'disabled' })
    const offlineDiff = await decodePage.evaluate(inputs => (globalThis as any).comparePixels(inputs), {
      reference: [
        ...await readFile(resolve(cache, 'screenshots/default/1-cli.png')),
      ],
      actual: [...offlinePng],
    })
    assert.equal(offlineDiff.error, undefined)
    assert.equal(offlineDiff.changed, 0, 'The offline themed runtime must still match slidev build')
    await writeFile(resolve(cache, 'screenshots/default/1-offline.png'), offlinePng)
    await onlinePage.context().setOffline(false)
    const runtime = await readFile(resolve(output, 'runtime.js'))
    const css = await readFile(resolve(output, 'runtime.css'))
    const profile = {
      name: 'Chromium phone simulation (not physical-device acceptance)',
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      cpuSlowdown: 4,
      latencyMs: 40,
      downloadBytesPerSecond: 1_500_000,
      uploadBytesPerSecond: 750_000,
    }
    const samples = []
    for (let attempt = 0; attempt < (values['skip-performance'] ? 0 : 5); attempt++) {
      const context = await browser.newContext({
        viewport: profile.viewport,
        deviceScaleFactor: profile.deviceScaleFactor,
        isMobile: true,
        hasTouch: true,
      })
      try {
        const page = await context.newPage()
        const cdp = await context.newCDPSession(page)
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpuSlowdown })
        await cdp.send('Network.enable')
        await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
        await cdp.send('Network.emulateNetworkConditions', {
          offline: false,
          latency: profile.latencyMs,
          downloadThroughput: profile.downloadBytesPerSecond,
          uploadThroughput: profile.uploadBytesPerSecond,
        })
        const started = performance.now()
        await page.goto(online.url, { waitUntil: 'domcontentloaded' })
        await page.waitForFunction(() => (globalThis as any).fidelityRender)
        const result = await page.evaluate(src => (globalThis as any).fidelityRender(src, 0), docs.default)
        assert.equal(result.origin, 'null')
        const sample = { coldNavigationToMountMs: performance.now() - started, compileAndMountMs: result.elapsedMs }
        samples.push(sample)
        process.stdout.write(`${JSON.stringify({ performanceSample: attempt + 1, ...sample })}\n`)
      }
      finally {
        await context.close()
      }
    }
    const report = {
      browser: `Chromium ${browser.version()}`,
      sdk: {
        status: 'UNRELEASED CANDIDATE',
        sha256: createHash('sha256').update(sdk).digest('hex'),
      },
      selectedSlides,
      themes: Object.fromEntries(themes.map(theme => [
        theme,
        {
          ...themeMetadata[theme],
          fixtureSha256: createHash('sha256').update(docs[theme]).digest('hex'),
        },
      ])),
      adaptations: 'Local Arial/Georgia/monospace fonts, fixed cover color and identical data-URL remote-image placeholders; nonvisual services disabled in both renderers.',
      tolerance: { channelDelta: 8, changedPixelRatio: 0.001 },
      results,
      errors,
      offline: {
        origin: offlineRender.origin,
        sandboxServiceWorkerControlled: offlineRender.serviceWorkerControlled,
        changedPixels: offlineDiff.changed,
        exactChangedPixels: offlineDiff.exactChanged,
      },
      prototypePayload: {
        javascriptGzip: gzipSync(runtime).length,
        cssGzip: gzipSync(css).length,
        totalGzip: gzipSync(runtime).length + gzipSync(css).length,
        runtimeSha256: createHash('sha256').update(runtime).digest('hex'),
        cssSha256: createHash('sha256').update(css).digest('hex'),
        budgetBytes: 3_000_000,
        note: 'Compiler + UnoCSS + two themes + YAML Shiki + selected client components only; not the complete product runtime.',
      },
      prototypePerformance: {
        state: samples.length ? 'MEASURED' : 'NOT RUN: explicitly skipped',
        profile,
        samples,
        budgetMs: 2000,
        maxColdNavigationToMountMs: samples.length
          ? Math.max(...samples.map(sample => sample.coldNavigationToMountMs))
          : null,
        note: 'Each sample uses a fresh browser context with cache disabled and gzip HTTP delivery. Navigation timing includes SDK, CSS, runtime transfer and compilation. Full runtime and physical phones remain unverified.',
      },
    }
    await writeFile(resolve(cache, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
    assert.deepEqual(errors, [])
    assert.ok(results.every(result => result.ratio! <= 0.001), 'Visual fidelity exceeds 0.1% changed pixels; inspect .cache/fidelity/screenshots')
    assert.ok(report.prototypePayload.totalGzip <= report.prototypePayload.budgetBytes, 'Prototype exceeds the 3 MB initial gzip budget')
    if (samples.length)
      assert.ok(report.prototypePerformance.maxColdNavigationToMountMs! <= 2000, 'Prototype exceeds the 2 s first-render budget on the recorded simulation')
  }
  finally {
    await browser.close()
    await Promise.all([baseline.instance, online.instance].map(instance => new Promise(resolve => instance.close(resolve))))
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
