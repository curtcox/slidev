import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { walk } from '../vendor/fragment-kit-v0.4.4/tools/lib.mjs'
import { generateOffline } from '../vendor/fragment-kit-v0.4.4/tools/offline-assets.mjs'
import { verifyManifest } from '../vendor/fragment-kit-v0.4.4/tools/vendor-sync.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const output = path.join(root, 'dist')
const vendor = 'vendor/fragment-kit-v0.4.4'
await verifyManifest(path.join(root, vendor))
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
const dirty = Boolean(execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim())
if (process.argv.includes('--release') && dirty)
  throw new Error('A release build requires a clean committed checkout')
await fs.rm(output, { recursive: true, force: true })
await fs.mkdir(output, { recursive: true })
for (const name of [
  'index.html',
  'gallery.html',
  'style.css',
  'fragment-kit.config.json',
  'service-worker.js',
  'src',
  'docs',
  'examples',
  vendor,
])
  await fs.cp(path.join(root, name), path.join(output, name), { recursive: true })
await fs.cp(path.join(root, 'runtime/dist'), path.join(output, 'runtime'), { recursive: true })
await fs.writeFile(path.join(output, 'release.json'), `${JSON.stringify({ commit, dirty }, null, 2)}\n`)
// Optional AI engines stay in the immutable pin but are not downloaded for offline use.
const files = (await walk(output)).filter(file => !file.startsWith(`${vendor}/vendor/wllama-`))
await fs.writeFile(path.join(output, 'offline.config.json'), `${JSON.stringify({ prefix: 'slidevonline', files }, null, 2)}\n`)
await generateOffline(path.join(output, 'offline.config.json'))
await fs.writeFile(path.join(output, '.nojekyll'), '')
console.log(`Built Slidev Online at ${commit}${dirty ? ' (uncommitted changes)' : ''}`)
