import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import { it } from 'node:test'
import vm from 'node:vm'

it('offline artifact covers the actual shipped runtime and SDK bytes', async () => {
  const base = new URL('../dist/', import.meta.url)
  const scope = {
    module: { exports: {} },
    globalThis: {},
  }
  vm.runInNewContext(await fs.readFile(new URL('offline-assets.js', base), 'utf8'), scope)
  const manifest = scope.module.exports
  assert.equal(manifest.prefix, 'slidevonline')
  for (const file of ['runtime/sandbox.js', 'runtime/sandbox.css', 'vendor/fragment-kit-v0.4.4/vendor/hashbin-sdk-v0.6.0.mjs']) {
    const actual = createHash('sha256').update(await fs.readFile(new URL(file, base))).digest('hex')
    assert.equal(manifest.hashes[file], actual)
  }
  assert.ok(manifest.assets.every(file => !file.includes('/wllama-')))
  const release = JSON.parse(await fs.readFile(new URL('release.json', base), 'utf8'))
  assert.match(release.commit, /^[a-f0-9]{40}$/)
  assert.equal(typeof release.dirty, 'boolean')
})

it('ships reviewed, pinned themes and their unchanged licenses offline', async () => {
  const base = new URL('../dist/runtime/', import.meta.url)
  const audit = JSON.parse(await fs.readFile(new URL('theme-audit.json', base), 'utf8'))
  assert.deepEqual(audit.map(theme => theme.name), ['default', 'seriph'])
  for (const theme of audit) {
    assert.equal(theme.version, '0.25.0')
    assert.equal(theme.license, 'MIT')
    const upstream = await fs.readFile(new URL(`../../node_modules/@slidev/theme-${theme.name}/LICENSE`, import.meta.url))
    assert.deepEqual(await fs.readFile(new URL(theme.licenseFile, base)), upstream)
    assert.equal(createHash('sha256').update(upstream).digest('hex'), theme.licenseSha256)
  }
})
