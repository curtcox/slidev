import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { checkVirtualModules } from '../runtime/check-virtual-modules.ts'
import { check } from '../vendor/fragment-kit-v0.4.4/tools/check.mjs'
import { generateOffline } from '../vendor/fragment-kit-v0.4.4/tools/offline-assets.mjs'
import { verifyManifest } from '../vendor/fragment-kit-v0.4.4/tools/vendor-sync.mjs'

execFileSync(process.execPath, [new URL('./render-docs.mjs', import.meta.url).pathname, '--check'], { stdio: 'inherit' })

execFileSync(process.execPath, [new URL('./gen-examples.mjs', import.meta.url).pathname, '--check'], { stdio: 'inherit' })
execFileSync(process.execPath, [new URL('./render-gallery.mjs', import.meta.url).pathname, '--check'], { stdio: 'inherit' })

const root = fileURLToPath(new URL('../', import.meta.url))
const kit = path.join(root, 'vendor/fragment-kit-v0.4.4')
await checkVirtualModules()
await verifyManifest(kit)
await check({
  root: kit,
  appConfig: path.join(root, 'dist/fragment-kit.config.json'),
})
const html = await fs.readFile(path.join(root, 'dist/index.html'), 'utf8')
assert.ok(html.includes('slidev-fragment-kit-v0.4.4'))
assert.ok(html.includes('href="manifest.webmanifest"'))
const manifest = JSON.parse(await fs.readFile(path.join(root, 'dist/manifest.webmanifest'), 'utf8'))
assert.equal(manifest.name, 'Slidev Online')
assert.equal(manifest.display, 'standalone')
assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 3)
const worker = await fs.readFile(path.join(root, 'dist/service-worker.js'), 'utf8')
assert.ok(worker.includes('offline-assets.js') && worker.includes('sw-core.js'))
for (const file of [
  'gallery.html',
  'manifest.webmanifest',
  ...manifest.icons.map(icon => icon.src),
  'docs/index.html',
  'examples/welcome.md',
  'runtime/sandbox.js',
  'runtime/sandbox.css',
])
  assert.ok((await fs.stat(path.join(root, 'dist', file))).size > 0, `${file} must be shipped`)
await generateOffline(path.join(root, 'dist/offline.config.json'), true)
console.log('Online scaffold, docs, gallery, runtime, PWA manifest and offline assets verified')
