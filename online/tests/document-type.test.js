import assert from 'node:assert/strict'
import { it } from 'node:test'
import { slidevDocument } from '../src/document-type.js'
import { MAX_BYTES } from '../vendor/fragment-kit-v0.4.4/src/core/bytes.js'
import { compress, decompress } from '../vendor/fragment-kit-v0.4.4/src/core/compression.js'
import { createUrlState } from '../vendor/fragment-kit-v0.4.4/src/core/url-state.js'

const url = 'https://curtcox.github.io/slidev/'
const state = createUrlState({
  config: { canonicalOrigin: url, maxBytes: MAX_BYTES },
  type: slidevDocument,
})

it('writes a compact v1 fragment for source-only documents', () => {
  const src = '{"format":"hashbin-diagram","version":1,"type":"other","src":"This is Markdown"}'
  const { href } = state.build({ src }, { run: false, view: 'preview' })
  assert.equal(new URL(href).hash.slice(0, 4), '#v1.')
  assert.equal(decompress(new URL(href).hash.slice(4)), JSON.stringify(src))
  assert.deepEqual(state.parse(href), {
    kind: 'source',
    doc: {
      src,
      slidev: { css: '' },
    },
    run: false,
    view: 'preview',
    settings: {},
  })
})

it('preserves CSS and extensions in shared and saved Slidev envelopes', () => {
  for (const css of ['', '.slidev-layout { color: rebeccapurple; }']) {
    const doc = {
      src: '# Deck',
      slidev: {
        css,
        future: {
          notes: ['Keep me'],
        },
      },
    }
    const payload = state.documents.serialize(doc)
    assert.deepEqual(JSON.parse(payload), {
      ...doc,
      format: 'hashbin-diagram',
      version: 1,
      type: 'slidev',
    })
    assert.deepEqual(state.documents.parse(payload), doc)
    const link = new URL(state.build(doc).href)
    link.searchParams.set('slide', '3')
    assert.deepEqual(state.parse(link).doc, doc)
    assert.deepEqual(state.parse(link).settings, { slide: '3' })
  }
  const styled = {
    src: '# CSS',
    slidev: { css: 'p { color: red }' },
  }
  assert.deepEqual(state.parse(state.build(styled).href).doc, styled)
})

it('rejects malformed fields, unrelated envelope types and oversized UTF-8', () => {
  for (const document of [
    null,
    ['', ''],
    { src: 0 },
    { src: '# Deck', extra: 0 },
    { src: '# Deck', slidev: null },
    { src: '# Deck', slidev: [] },
    {
      src: '# Deck',
      slidev: { css: 0 },
    },
  ]) {
    assert.throws(() => slidevDocument.normalize(document))
  }
  assert.throws(() => slidevDocument.normalize({
    src: 'é'.repeat(MAX_BYTES / 2),
    slidev: { css: 'x' },
  }), /5 MiB/)
  const foreign = JSON.stringify({
    format: 'hashbin-diagram',
    version: 1,
    type: 'other',
    src: '# Deck',
  })
  assert.throws(() => state.parse(`${url}#v1.${compress(foreign)}`), /Saved document is for other/)
  assert.throws(() => state.parse(`${url}#v1.invalid!`), /could not be decompressed/)
})
