import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { gzipSync } from 'node:zlib'
import vue from '@vitejs/plugin-vue'
import { chromium } from 'playwright-chromium'
import { build } from 'vite'

async function main() {
  const root = fileURLToPath(new URL('../../../', import.meta.url))
  const spike = fileURLToPath(new URL('./', import.meta.url))
  const { values } = parseArgs({
    options: {
      'kit': { type: 'string' },
      'browser': { type: 'string' },
      'sdk-candidate': { type: 'string' },
    },
  })
  const kit = resolve(values.kit ?? resolve(root, 'online/vendor/fragment-kit-v0.4.3'))
  const output = resolve(spike, '.cache/dist')
  const candidate = values['sdk-candidate'] && resolve(values['sdk-candidate'])
  const sdk = await readFile(candidate || resolve(kit, 'vendor/hashbin-sdk-v0.4.0.mjs'))
  const sdkHash = createHash('sha256').update(sdk).digest('hex')
  // Pinned v0.4.3 release manifest, never a modified SDK or a local replacement.
  if (!candidate) {
    assert.equal(sdkHash, '82f25ffe41a0ff79a060fb593754a286e1c85c2502878ab387c3d0045b749fa5')
    assert.equal(JSON.parse(await readFile(resolve(kit, 'package.json'), 'utf8')).version, '0.4.3')
  }
  await mkdir(output, { recursive: true })
  await build({
    configFile: false,
    root,
    logLevel: 'warn',
    plugins: [
      vue(),
    ],
    resolve: {
      alias: {
        '#slidev/configs': resolve(spike, 'configs.ts'),
        '#slidev/global-layers': resolve(spike, 'global-layers.ts'),
      },
    },
    define: { '__DEV__': 'false', '__SLIDEV_HASH_ROUTE__': 'false', 'process.env.NODE_ENV': '"production"' },
    build: {
      outDir: output,
      emptyOutDir: true,
      lib: {
        entry: resolve(spike, 'runtime.ts'),
        formats: ['es'],
        fileName: () => 'runtime.js',
        cssFileName: 'runtime',
      },
      minify: true,
    },
  })
  let html = await readFile(resolve(spike, 'index.html'), 'utf8')
  if (candidate) {
    const { DOM_SANDBOX_BOOTSTRAP, DOM_SANDBOX_BOOTSTRAP_HASH } = await import(pathToFileURL(candidate).href)
    assert.equal(DOM_SANDBOX_BOOTSTRAP_HASH, `sha256-${createHash('sha256').update(DOM_SANDBOX_BOOTSTRAP).digest('base64')}`)
    html = html.replace('script-src \'self\' blob:', `script-src 'self' blob: '${DOM_SANDBOX_BOOTSTRAP_HASH}'`)
    html = html.replace('worker-src blob:', 'worker-src \'self\' blob:')
  }
  await writeFile(resolve(output, 'index.html'), html)
  await copyFile(resolve(spike, 'parent.js'), resolve(output, 'parent.js'))
  await writeFile(resolve(output, 'sdk.mjs'), sdk)
  const fixtures = [
    { name: 'starter-slide-1', src: await readFile(resolve(root, 'demo/starter/slides.md'), 'utf8') },
    { name: 'script-setup', src: await readFile(resolve(spike, 'fixtures/script-setup.md'), 'utf8') },
  ]
  await writeFile(resolve(output, 'fixtures.json'), JSON.stringify(fixtures))
  await writeFile(resolve(output, 'options.json'), JSON.stringify({
    execution: candidate ? 'frame' : 'worker',
  }))
  const files = {
    '/': ['index.html', 'text/html'],
    '/index.html': ['index.html', 'text/html'],
    '/parent.js': ['parent.js', 'text/javascript'],
    '/sdk.mjs': ['sdk.mjs', 'text/javascript'],
    '/runtime.js': ['runtime.js', 'text/javascript'],
    '/fixtures.json': ['fixtures.json', 'application/json'],
    '/options.json': ['options.json', 'application/json'],
  }
  if (candidate) {
    const assets = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([path, [file, type]]) => [
      path,
      {
        type,
        sha256: createHash('sha256').update(await readFile(resolve(output, file))).digest('hex'),
      },
    ])))
    const version = createHash('sha256').update(JSON.stringify(assets)).digest('hex').slice(0, 16)
    const sw = (await readFile(resolve(spike, 'service-worker.js'), 'utf8'))
      .replace('const assets = {}', `const assets = ${JSON.stringify(assets)}`)
      .replace('__VERSION__', version)
    await writeFile(resolve(output, 'service-worker.js'), sw)
    files['/service-worker.js'] = ['service-worker.js', 'text/javascript']
  }
  const server = createServer(async (req, res) => {
    const file = files[req.url]
    if (!file) {
      res.writeHead(404).end()
      return
    }
    try {
      const body = await readFile(resolve(output, file[0]))
      res.writeHead(200, { 'Content-Type': file[1], 'Cache-Control': 'no-store' }).end(body)
    }
    catch {
      res.writeHead(500).end()
    }
  })
  let browser
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    browser = await chromium.launch({ executablePath: values.browser })
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(String(error)))
    await page.goto(`http://127.0.0.1:${server.address().port}/`)
    await page.waitForFunction(() => globalThis.phase0, null, { timeout: 35_000 })
    let report = await page.evaluate(() => globalThis.phase0)
    if (candidate) {
      const onlineReport = report
      assert.equal(onlineReport.error, undefined, JSON.stringify(onlineReport))
      await page.evaluate(async () => {
        await navigator.serviceWorker.register('./service-worker.js')
        await navigator.serviceWorker.ready
      })
      await page.reload()
      await page.waitForFunction(() => navigator.serviceWorker.controller)
      await page.context().setOffline(true)
      await page.reload()
      await page.waitForFunction(() => globalThis.phase0, null, { timeout: 35_000 })
      report = await page.evaluate(() => globalThis.phase0)
      assert.deepEqual(report.results, onlineReport.results, 'Offline rendering and interaction must match the online run')
      assert.equal(report.environment?.serviceWorkerControlled, false, 'Opaque frame must not be controlled by the service worker')
    }
    assert.deepEqual(errors, [], 'Parent page must not execute deck code or throw')
    assert.equal(report.error, undefined, JSON.stringify(report))
    assert.equal(report.sandbox, 'allow-scripts')
    assert.equal(report.environment.origin, 'null')
    assert.equal(report.environment.worker, !candidate)
    assert.equal(report.environment.document, candidate ? 'object' : 'undefined')
    assert.equal(report.environment.window, candidate ? 'object' : 'undefined')
    assert.deepEqual(report.results.map(result => result.name), fixtures.map(fixture => fixture.name))
    for (const result of report.results) {
      if (candidate) {
        assert.equal(result.stage, 'mounted', JSON.stringify(result))
        assert.match(result.text, result.name === 'script-setup'
          ? /Count: 0/
          : /Welcome to Slidev/)
        if (result.name === 'script-setup')
          assert.equal(result.button, 'Count: 1')
      }
      else {
        assert.equal(result.stage, 'mount', `${result.name} must compile and import successfully: ${JSON.stringify(result)}`)
        assert.match(result.error, /document is not defined/)
      }
    }
    const runtime = await readFile(resolve(output, 'runtime.js'))
    const evidence = {
      phase: 0,
      s1: candidate ? 'PASS with unreleased SDK candidate only: DOM mount and script-setup interaction' : 'BLOCKED: SDK source runs in a Worker; Vue requires a DOM to mount',
      s2: candidate ? 'NOT RUN: theme and UnoCSS fidelity gate remains' : 'NOT RUN: depends on S1',
      s3: candidate ? 'PASS with unreleased SDK candidate: offline reload mounts diagnostic Slidev bundle via parent verified service worker' : 'NOT RUN: depends on an agreed DOM sandbox delivery path',
      s4: 'NOT RUN: no complete runtime or first render to measure',
      browser: `Chromium ${browser.version()}`,
      sdk: candidate
        ? { status: 'UNRELEASED CANDIDATE', sha256: sdkHash }
        : { kit: '0.4.3', version: '0.4.0', sha256: sdkHash },
      fixtures: fixtures.map(({ name, src }) => ({
        name,
        sha256: createHash('sha256').update(src).digest('hex'),
      })),
      diagnosticBundle: { bytes: runtime.length, gzipBytes: gzipSync(runtime).length, note: 'S1 subset only; not an S4 measurement' },
      ...report,
    }
    await writeFile(resolve(spike, candidate ? '.cache/candidate-report.json' : '.cache/report.json'), `${JSON.stringify(evidence, null, 2)}\n`)
    process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`)
    // A reproduced blocker is not a passed feasibility gate.
    process.exitCode = candidate ? 0 : 2
  }
  finally {
    await browser?.close()
    await new Promise(resolve => server.close(resolve))
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
