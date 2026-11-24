import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { expect, test } from '@playwright/test'
import { adapter, ready } from '../../vendor/fragment-kit-v0.4.4/testing/contract/adapter.js'

test.use({ serviceWorkers: 'allow' })
test.setTimeout(120000)

const distDir = fileURLToPath(new URL('../../dist', import.meta.url))
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
}

async function mutableAppServer() {
  let revision = 1
  const swSource = await fs.readFile(path.join(distDir, 'service-worker.js'), 'utf8')
  const manifestSource = await fs.readFile(path.join(distDir, 'offline-assets.js'), 'utf8')
  const scope = {
    module: { exports: {} },
    globalThis: {},
  }
  vm.runInNewContext(manifestSource, scope)
  const baseManifest = scope.module.exports

  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://127.0.0.1')
      const rel = url.pathname === '/'
        ? 'index.html'
        : url.pathname.replace(/^\/+/, '')
      if (rel === 'service-worker.js') {
        const body = `${swSource}\n// release ${revision}\n`
        response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' })
        response.end(body)
        return
      }
      if (rel === 'offline-assets.js') {
        const updated = {
          ...baseManifest,
          revision,
          hashes: {
            ...baseManifest.hashes,
            'service-worker.js': createHash('sha256').update(`${swSource}\n// release ${revision}\n`).digest('hex'),
          },
        }
        updated.version = `slidevonline-${createHash('sha256').update(JSON.stringify(updated.hashes)).digest('hex').slice(0, 16)}`
        const body = `// Generated test manifest\n(function (self) { self.OfflineAssets = ${JSON.stringify(updated)}; })(globalThis);\n`
        response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' })
        response.end(body)
        return
      }
      const target = path.resolve(distDir, rel)
      if (!target.startsWith(`${distDir}${path.sep}`) && target !== distDir) {
        response.writeHead(403)
        response.end()
        return
      }
      const bytes = await fs.readFile(target)
      const contentType = mimeTypes[path.extname(target)] ?? 'application/octet-stream'
      response.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-store' })
      response.end(bytes)
    }
    catch {
      response.writeHead(404)
      response.end()
    }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  return {
    url: `http://127.0.0.1:${server.address().port}/`,
    bump() {
      revision++
    },
    close: () => new Promise((resolve) => {
      server.closeAllConnections()
      server.close(resolve)
    }),
  }
}

test('PWA manifest, icons, prefixed caches and offline gallery/docs work after disconnecting', async ({ page, context }) => {
  await ready(page)
  await expect(page.locator('#offline-status')).toHaveText('Available offline', { timeout: 60000 })
  await page.reload()
  await page.locator(adapter.ready).waitFor()

  const cacheNames = await page.evaluate(() => caches.keys())
  expect(cacheNames.length).toBeGreaterThan(0)
  expect(cacheNames.every(name => name.startsWith('slidevonline-'))).toBe(true)

  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href')
  expect(manifestHref).toBe('manifest.webmanifest')

  await context.setOffline(true)
  try {
    const manifest = await page.evaluate(async (href) => {
      const res = await fetch(href)
      if (!res.ok)
        throw new Error(`HTTP ${res.status}`)
      return res.json()
    }, manifestHref)
    expect(manifest.name).toBe('Slidev Online')
    expect(manifest.display).toBe('standalone')

    for (const icon of manifest.icons) {
      const dims = await page.evaluate(async (src) => {
        const img = new Image()
        img.src = src
        await img.decode()
        return { width: img.naturalWidth, height: img.naturalHeight }
      }, icon.src)
      expect(dims.width).toBeGreaterThan(0)
      if (icon.sizes !== 'any') {
        const [expectedW, expectedH] = icon.sizes.split('x').map(Number)
        expect(dims).toEqual({ width: expectedW, height: expectedH })
      }
    }

    await page.goto('gallery.html')
    await expect(page.locator('.fk-gallery-card')).toHaveCount(15)
    for (const image of await page.locator('.fk-gallery-card img').all()) {
      await image.scrollIntoViewIfNeeded()
      await expect.poll(() => image.evaluate(el => el.naturalWidth)).toBeGreaterThan(0)
      await image.evaluate(el => el.decode())
    }
    await page.getByRole('link', { name: 'Open Equations and diagrams', exact: true }).click()
    await page.waitForSelector('body[data-ready="true"]')
    expect(await page.locator('#preview iframe').getAttribute('sandbox')).toBe('allow-scripts')
    const frame = page.frames().find(f => f.parentFrame())
    expect(await frame.evaluate(() => globalThis.origin)).toBe('null')
    await expect(page.frameLocator('#preview iframe').locator('.katex')).toHaveCount(2, { timeout: 20000 })
    await page.locator('#next-slide').click()
    await expect(page.frameLocator('#preview iframe').locator('.mermaid svg')).toHaveCount(1, { timeout: 20000 })

    await page.goto('docs/supported.html')
    await expect(page.locator('main h1')).toHaveText('Supported features')
  }
  finally {
    await context.setOffline(false)
  }
})

test('an offline update waits for user action and preserves edited Markdown and CSS', async ({ page, context }) => {
  const fixture = await mutableAppServer()
  try {
    await page.goto(fixture.url)
    await page.locator(adapter.ready).waitFor()
    await expect(page.locator('#offline-status')).toHaveText('Available offline', { timeout: 60000 })
    await page.reload()
    await page.locator(adapter.ready).waitFor()
    const beforeCaches = await page.evaluate(() => caches.keys())

    const editedDoc = {
      src: '# Unsaved offline update\n\nKeep every character intact.\n',
      slidev: { css: 'h1 { color: rgb(8, 126, 172); }' },
    }
    await adapter.edit(page, editedDoc)

    fixture.bump()
    await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration()
      await reg.update()
    })

    await adapter.openMore(page)
    await expect(page.locator('#offline-update')).toBeVisible({ timeout: 60000 })
    // Waiting update must not have altered the live editor buffers.
    expect(await adapter.getDocument(page)).toEqual(editedDoc)

    const activated = page.evaluate(() => new Promise((resolve) => {
      navigator.serviceWorker.addEventListener('controllerchange', () => resolve(true), { once: true })
    }))
    await page.locator('#offline-update').click()
    await activated

    await expect(page.locator('#offline-update')).toBeHidden()
    await expect(page.locator('#offline-update-status')).toContainText('Update applied')
    expect(await adapter.getDocument(page)).toEqual(editedDoc)

    const afterCaches = await page.evaluate(() => caches.keys())
    expect(afterCaches.every(name => name.startsWith('slidevonline-'))).toBe(true)
    expect(afterCaches).not.toEqual(beforeCaches)

    await context.setOffline(true)
    await page.reload()
    await page.locator(adapter.ready).waitFor()
    expect(await adapter.getDocument(page)).toEqual(editedDoc)
    await page.waitForSelector('body[data-ready="true"]')
    await expect(page.frameLocator('#preview iframe').locator('h1')).toHaveText('Unsaved offline update')
  }
  finally {
    await context.setOffline(false)
    await fixture.close()
  }
})
