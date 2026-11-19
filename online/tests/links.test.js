import assert from 'node:assert/strict'
import { it } from 'node:test'
import { createDocumentLoader, createWorkspaceUrls, readLinkOptions } from '../src/links.js'
import { createConfig } from '../vendor/fragment-kit-v0.4.4/src/core/config.js'

const config = createConfig({
  slug: 'slidev',
  name: 'Slidev Online',
  storagePrefix: 'slidevonline',
  canonicalOrigin: 'https://example.com/',
  recoveryOrigin: 'https://example.com/',
  repo: 'curtcox/slidev',
  docs: 'docs/',
  gallery: 'gallery.html',
  documentType: 'slidev',
})
const urlState = createWorkspaceUrls({
  config,
  getSlide: () => 3,
  location: { href: config.canonicalOrigin },
})

it('keeps start position in shared links and delayed writes', () => {
  let written
  let slide = 2
  let flush
  const state = createWorkspaceUrls({
    config,
    getSlide: () => slide,
    location: { href: config.canonicalOrigin },
    history: {
      replaceState: (data, unused, href) => written = href,
    },
    timers: {
      setTimeout: fn => flush = fn,
      clearTimeout() {},
    },
  })
  const doc = { src: '# Slide' }
  for (const href of Object.values(state.build(doc)))
    assert.equal(new URL(href).searchParams.get('slide'), '2')
  state.write(doc)
  slide = 4
  flush()
  assert.equal(new URL(written).searchParams.get('slide'), '4')
  assert.equal(state.parse(written).doc.src, doc.src)
})

it('validates navigation options before opening a document', () => {
  for (const query of [
    'slide=0',
    'slide=-2',
    'slide=10001',
    'slide=2.5',
    'view=bogus',
  ])
    assert.throws(() => readLinkOptions(urlState.parse(`https://example.com/?${query}`)))
  assert.deepEqual(readLinkOptions(urlState.parse('https://example.com/?run=0&slide=5&view=edit')), { run: false, view: 'edit', slide: 5 })
})

it('failed explicit links and unknown examples leave the existing document intact', async () => {
  const errors = []
  let opened = 0
  let fetched = 0
  const loader = createDocumentLoader({
    urlState,
    onOpen: () => opened++,
    onError: error => errors.push(error),
    fetchSource: () => fetched++,
    store: {
      load: async () => { throw new Error('CID verification failed') },
    },
  })
  assert.equal(await loader.open('https://example.com/#v9.invalid'), false)
  assert.equal(await loader.open('https://example.com/?example=../../private'), false)
  assert.equal(opened, 0)
  assert.equal(fetched, 0)
  assert.equal(errors.length, 2)
})

it('a late load cannot replace a newer document or manual edits', async () => {
  let resolve
  const opened = []
  const loader = createDocumentLoader({
    urlState,
    onOpen: doc => opened.push(doc.src),
    onError: error => assert.fail(error),
    fetchSource: () => new Promise(done => resolve = done),
  })
  const pending = loader.open('https://example.com/')
  await loader.open(urlState.build({ src: '# New link' }).href)
  resolve(new Response('# Old welcome'))
  await pending
  assert.deepEqual(opened, ['# New link'])
  const edited = loader.open('https://example.com/')
  loader.cancel()
  resolve(new Response('# Stale fetch'))
  await edited
  assert.deepEqual(opened, ['# New link'])
})

it('loading bounds streamed example bytes and times out stalled delivery', async () => {
  const errors = []
  const loader = createDocumentLoader({
    urlState,
    onOpen: () => assert.fail('must not replace the document'),
    onError: error => errors.push(error),
    timeout: 10,
    fetchSource: async () => new Response('large', {
      headers: { 'content-length': '6000000' },
    }),
  })
  await loader.open('https://example.com/')
  assert.match(errors[0], /byte limit/)
  const stalled = createDocumentLoader({
    urlState,
    timeout: 5,
    fetchSource: () => new Promise(() => {}),
    onOpen() {},
    onError: error => errors.push(error),
  })
  await stalled.open('https://example.com/')
  assert.match(errors[1], /too long/)
})
