import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
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
  for (const file of [
    'runtime/sandbox.js',
    'runtime/sandbox.css',
    'runtime/editor/document.js',
    'runtime/highlighting/shiki.js',
    'src/ai.mjs',
    'src/ai-type.js',
    'src/ai-check.js',
    'ai-suite.json',
    'vendor/fragment-kit-v0.4.4/src/ai/ui/ai.css',
    'vendor/fragment-kit-v0.4.4/vendor/hashbin-sdk-v0.6.0.mjs',
  ]) {
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
  assert.deepEqual(audit.map(theme => theme.name), [
    'default',
    'seriph',
    'apple-basic',
    'bricks',
    'shibainu',
  ])
  for (const theme of audit) {
    assert.equal(theme.version, theme.name === 'apple-basic'
      ? '0.25.1'
      : '0.25.0')
    assert.equal(theme.license, 'MIT')
    const upstream = await fs.readFile(new URL(`../../node_modules/@slidev/theme-${theme.name}/LICENSE`, import.meta.url))
    assert.deepEqual(await fs.readFile(new URL(theme.licenseFile, base)), upstream)
    assert.equal(createHash('sha256').update(upstream).digest('hex'), theme.licenseSha256)
    for (const source of theme.sources) {
      const bytes = await fs.readFile(new URL(`../../node_modules/@slidev/theme-${theme.name}/${source.file}`, import.meta.url))
      assert.equal(bytes.length, source.bytes)
      assert.equal(createHash('sha256').update(bytes).digest('hex'), source.sha256)
    }
  }
})

it('ships all curated icon collections with original attribution and verified offline bytes', async () => {
  const base = new URL('../dist/runtime/', import.meta.url)
  const audit = JSON.parse(await fs.readFile(new URL('icons/attribution.json', base), 'utf8'))
  const scope = {
    module: { exports: {} },
    globalThis: {},
  }
  vm.runInNewContext(await fs.readFile(new URL('../offline-assets.js', base), 'utf8'), scope)
  assert.deepEqual(audit.map(collection => collection.prefix), [
    'carbon',
    'ph',
    'mdi',
    'logos',
    'simple-icons',
    'twemoji',
    'svg-spinners',
  ])
  for (const collection of audit) {
    assert.equal(collection.packageVersion, '2.2.553')
    const data = await fs.readFile(new URL(collection.fileName, base))
    assert.deepEqual(data, await fs.readFile(new URL(`../runtime/node_modules/@iconify/json/json/${collection.prefix}.json`, import.meta.url)))
    assert.equal(createHash('sha256').update(data).digest('hex'), collection.sha256)
    assert.equal(scope.module.exports.hashes[`runtime/${collection.fileName}`], collection.sha256)
    assert.equal(data.length, collection.bytes)
    assert.deepEqual(JSON.parse(data).info, collection.info)
    assert.ok(collection.info.author.name)
    assert.ok(collection.info.license.spdx)
  }
})

it('ships forty pinned grammar bundles, embedded dependencies and the license in the verified offline artifact', async () => {
  const base = new URL('../dist/runtime/', import.meta.url)
  const audit = JSON.parse(await fs.readFile(new URL('grammars/audit.json', base), 'utf8'))
  const catalog = JSON.parse(await fs.readFile(new URL('../runtime/src/compiler/languages.json', import.meta.url), 'utf8'))
  assert.equal(audit.version, '4.6.0')
  assert.equal(audit.license, 'MIT')
  assert.equal(audit.languages.length, 40)
  assert.deepEqual(audit.languages.map(language => language.name), Object.keys(catalog))
  assert.match(await fs.readFile(new URL(audit.licenseFile, base), 'utf8'), /Copyright.*Anthony Fu/)
  const scope = {
    module: { exports: {} },
    globalThis: {},
  }
  vm.runInNewContext(await fs.readFile(new URL('../offline-assets.js', base), 'utf8'), scope)
  for (const language of audit.languages) {
    const bytes = await fs.readFile(new URL(language.fileName, base))
    assert.equal(bytes.length, language.bytes)
    assert.equal(createHash('sha256').update(bytes).digest('hex'), language.sha256)
    assert.equal(scope.module.exports.hashes[`runtime/${language.fileName}`], language.sha256)
    assert.deepEqual(language.aliases, catalog[language.name])
    assert.deepEqual(JSON.parse(bytes).map(grammar => grammar.name), language.dependencies)
    assert.ok(language.dependencies.includes(language.name))
  }
})

it('ships the original KaTeX renderer and self-contained fonts offline', async () => {
  const base = new URL('../dist/runtime/', import.meta.url)
  const audit = JSON.parse(await fs.readFile(new URL('math/audit.json', base), 'utf8'))
  assert.equal(audit.version, '0.19.1')
  assert.equal(audit.license, 'MIT')
  assert.equal(audit.fonts.length, 20)
  const css = await fs.readFile(new URL(audit.fileName, base))
  assert.equal(css.length, audit.bytes)
  assert.equal(createHash('sha256').update(css).digest('hex'), audit.sha256)
  const renderer = await fs.readFile(new URL(audit.renderer.fileName, base))
  assert.deepEqual(renderer, await fs.readFile(new URL('../../node_modules/katex/dist/katex.mjs', import.meta.url)))
  assert.equal(renderer.length, audit.renderer.bytes)
  assert.equal(createHash('sha256').update(renderer).digest('hex'), audit.renderer.sha256)
  const embedded = [
    ...css.toString().matchAll(/data:font\/woff2;base64,([A-Za-z0-9+/=]+)/g),
  ]
  assert.equal(embedded.length, 20)
  for (const [index, font] of audit.fonts.entries()) {
    const upstream = await fs.readFile(new URL(`../../node_modules/katex/dist/fonts/${font.name}`, import.meta.url))
    assert.deepEqual(Buffer.from(embedded[index][1], 'base64'), upstream)
    assert.equal(upstream.length, font.bytes)
    assert.equal(createHash('sha256').update(upstream).digest('hex'), font.sha256)
  }
  assert.deepEqual(await fs.readFile(new URL(audit.licenseFile, base)), await fs.readFile(new URL('../../node_modules/katex/LICENSE', import.meta.url)))
  const scope = {
    module: { exports: {} },
    globalThis: {},
  }
  vm.runInNewContext(await fs.readFile(new URL('../offline-assets.js', base), 'utf8'), scope)
  assert.equal(scope.module.exports.hashes[`runtime/${audit.fileName}`], audit.sha256)
  assert.equal(scope.module.exports.hashes[`runtime/${audit.renderer.fileName}`], audit.renderer.sha256)
})

it('ships all theme font subsets with unchanged bytes, licenses and offline hashes', async () => {
  const base = new URL('../dist/runtime/', import.meta.url)
  const audit = JSON.parse(await fs.readFile(new URL('fonts/audit.json', base), 'utf8'))
  assert.deepEqual(audit.map(font => font.family), [
    'Nunito Sans',
    'Fira Code',
    'PT Serif',
    'PT Mono',
    'Signika Negative',
    'Sigmar One',
    'Titillium Web',
  ])
  const scope = {
    module: { exports: {} },
    globalThis: {},
  }
  vm.runInNewContext(await fs.readFile(new URL('../offline-assets.js', base), 'utf8'), scope)
  for (const font of audit) {
    assert.equal(font.version, '5.3.0')
    assert.equal(font.license, 'OFL-1.1')
    assert.ok(font.attribution)
    const css = await fs.readFile(new URL(font.fileName, base))
    assert.equal(css.length, font.bytes)
    assert.equal(createHash('sha256').update(css).digest('hex'), font.sha256)
    const embedded = [
      ...css.toString().matchAll(/data:font\/woff2;base64,([A-Za-z0-9+/=]+)/g),
    ]
    assert.equal(embedded.length, font.fonts.length)
    for (const [index, face] of font.fonts.entries()) {
      const upstream = await fs.readFile(new URL(`../runtime/node_modules/${font.package}/files/${face.name}`, import.meta.url))
      assert.deepEqual(Buffer.from(embedded[index][1], 'base64'), upstream)
      assert.equal(upstream.length, face.bytes)
      assert.equal(createHash('sha256').update(upstream).digest('hex'), face.sha256)
    }
    const license = await fs.readFile(new URL(font.licenseFile, base))
    assert.deepEqual(license, await fs.readFile(new URL(`../runtime/node_modules/${font.package}/LICENSE`, import.meta.url)))
    assert.equal(createHash('sha256').update(license).digest('hex'), font.licenseSha256)
    assert.equal(scope.module.exports.hashes[`runtime/${font.fileName}`], font.sha256)
    assert.equal(scope.module.exports.hashes[`runtime/${font.licenseFile}`], font.licenseSha256)
  }
})

it('ships the pinned standalone Mermaid module and its license in the verified offline artifact', async () => {
  const base = new URL('../dist/runtime/', import.meta.url)
  const audit = JSON.parse(await fs.readFile(new URL('diagrams/audit.json', base), 'utf8'))
  assert.equal(audit.version, '12.3.0')
  assert.equal(audit.license, 'MIT')
  const bytes = await fs.readFile(new URL(audit.fileName, base))
  assert.equal(bytes.length, audit.bytes)
  assert.equal(createHash('sha256').update(bytes).digest('hex'), audit.sha256)
  assert.deepEqual(await fs.readFile(new URL(audit.licenseFile, base)), await fs.readFile(new URL('../../node_modules/mermaid/LICENSE', import.meta.url)))
  const scope = {
    module: { exports: {} },
    globalThis: {},
  }
  vm.runInNewContext(await fs.readFile(new URL('../offline-assets.js', base), 'utf8'), scope)
  assert.equal(scope.module.exports.hashes[`runtime/${audit.fileName}`], audit.sha256)
})

it('ships the standalone Shiki engine and its original license with verified offline bytes', async () => {
  const base = new URL('../dist/runtime/', import.meta.url)
  const audit = JSON.parse(await fs.readFile(new URL('highlighting/audit.json', base), 'utf8'))
  assert.equal(audit.version, '4.6.0')
  assert.equal(audit.license, 'MIT')
  const bytes = await fs.readFile(new URL(audit.fileName, base))
  assert.equal(bytes.length, audit.bytes)
  assert.equal(createHash('sha256').update(bytes).digest('hex'), audit.sha256)
  assert.deepEqual(await fs.readFile(new URL(audit.licenseFile, base)), await fs.readFile(new URL('../../node_modules/shiki/LICENSE', import.meta.url)))
})
