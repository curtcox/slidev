import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { check } from '../vendor/fragment-kit-v0.4.4/tools/check.mjs'
import { generateOffline } from '../vendor/fragment-kit-v0.4.4/tools/offline-assets.mjs'
import { verifyManifest } from '../vendor/fragment-kit-v0.4.4/tools/vendor-sync.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const kit = path.join(root, 'vendor/fragment-kit-v0.4.4')
await verifyManifest(kit)
await check({
  root: kit,
  appConfig: path.join(root, 'dist/fragment-kit.config.json'),
})
const html = await fs.readFile(path.join(root, 'dist/index.html'), 'utf8')
assert.ok(html.includes('slidev-fragment-kit-v0.4.4'))
for (const file of [
  'gallery.html',
  'docs/index.html',
  'examples/welcome.md',
  'runtime/sandbox.js',
  'runtime/sandbox.css',
])
  assert.ok((await fs.stat(path.join(root, 'dist', file))).size > 0, `${file} must be shipped`)
await generateOffline(path.join(root, 'dist/offline.config.json'), true)
console.log('Online scaffold, docs, gallery, runtime and offline assets verified')
