import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { chromium } from 'playwright'
import { serve } from '../../vendor/fragment-kit-v0.4.4/tools/serve.mjs'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const cache = resolve(root, 'online/runtime/.cache')
const profile = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  cpuSlowdown: 4,
  latencyMs: 40,
  downloadBytesPerSecond: 1_500_000,
  uploadBytesPerSecond: 750_000,
}
const budget = { firstPaintMs: 2000, runtimeGzipBytes: 3_000_000 }

async function main() {
  await mkdir(cache, { recursive: true })
  const local = process.argv[2]
    ? undefined
    : await serve({
        root: resolve(root, 'online/dist'),
        port: 0,
      })
  const url = process.argv[2] || local.url
  const report = {
    url,
    scope: 'Five fresh Chromium mobile contexts, cold HTTP and service-worker caches, real welcome deck and opaque runtime. Measures navigation to two frames after the editor receives the rendered message.',
    budgets: budget,
    profile,
    samples: [],
  }
  let browser
  try {
    const [runtime, css, release] = await Promise.all([
      'runtime/sandbox.js',
      'runtime/sandbox.css',
      'release.json',
    ].map(async (path) => {
      const response = await fetch(new URL(path, url))
      assert.ok(response.ok, `${path}: HTTP ${response.status}`)
      return Buffer.from(await response.arrayBuffer())
    }))
    report.release = JSON.parse(release.toString())
    report.runtimeSha256 = createHash('sha256').update(runtime).digest('hex')
    report.runtimeGzipBytes = gzipSync(runtime).length + gzipSync(css).length
    browser = await chromium.launch()
    report.browser = `Chromium ${browser.version()}`
    for (let attempt = 1; attempt <= 5; attempt++) {
      const context = await browser.newContext({
        viewport: profile.viewport,
        deviceScaleFactor: profile.deviceScaleFactor,
        isMobile: true,
        hasTouch: true,
      })
      try {
        const page = await context.newPage()
        const errors = []
        page.on('pageerror', error => errors.push(String(error)))
        await page.addInitScript(() => {
          const observer = new MutationObserver(() => {
            if (document.body?.dataset.ready !== 'true')
              return
            observer.disconnect()
            requestAnimationFrame(() => requestAnimationFrame(() => {
              window.slidevFirstPaintMs = performance.now()
            }))
          })
          observer.observe(document, {
            subtree: true,
            attributes: true,
            attributeFilter: ['data-ready'],
          })
        })
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
        const [runtimeResponse] = await Promise.all([
          page.waitForResponse(new URL('runtime/sandbox.js', url).href),
          page.goto(url, { waitUntil: 'domcontentloaded' }),
        ])
        await page.waitForFunction(() => Number.isFinite(window.slidevFirstPaintMs))
        const preview = page.locator('#preview iframe')
        assert.equal(await preview.getAttribute('sandbox'), 'allow-scripts')
        const heading = preview.contentFrame().locator('h1')
        assert.match(await heading.textContent(), /Hello, Slidev/)
        assert.equal(await heading.evaluate(() => globalThis.origin), 'null')
        assert.deepEqual(errors, [])
        const sample = {
          firstPaintMs: Math.round(await page.evaluate(() => window.slidevFirstPaintMs)),
          runtimeEncoding: await runtimeResponse.headerValue('content-encoding') ?? 'identity',
          runtimeResponseBytes: (await runtimeResponse.request().sizes()).responseBodySize,
        }
        report.samples.push(sample)
        process.stdout.write(`${attempt}: ${JSON.stringify(sample)}\n`)
      }
      finally {
        await context.close()
      }
    }
    report.medianFirstPaintMs = report.samples.map(sample => sample.firstPaintMs).sort((a, b) => a - b)[2]
    report.maxFirstPaintMs = Math.max(...report.samples.map(sample => sample.firstPaintMs))
    report.meetsPaintBudget = report.maxFirstPaintMs <= budget.firstPaintMs
    report.meetsPayloadBudget = report.runtimeGzipBytes <= budget.runtimeGzipBytes
    process.stdout.write(`Median ${report.medianFirstPaintMs} ms, max ${report.maxFirstPaintMs} ms, initial runtime ${report.runtimeGzipBytes} bytes gzip\n`)
  }
  catch (error) {
    report.error = String(error)
    throw error
  }
  finally {
    await browser?.close()
    if (local) {
      await new Promise((resolve, reject) => local.server.close(error => error
        ? reject(error)
        : resolve()))
    }
    await writeFile(resolve(cache, 'performance-chromium.json'), `${JSON.stringify(report, null, 2)}\n`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
