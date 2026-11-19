import assert from 'node:assert/strict'
import { it } from 'node:test'
import { createRuntimeAssets } from '../src/runtime-assets.js'

it('reuses only trusted runtime downloads and returns separately readable SDK responses', async () => {
  const calls = []
  const assets = createRuntimeAssets({
    base: 'https://example.test/slidev/',
    async fetchSource(url, options) {
      calls.push({ url, options })
      return new Response('throw new Error("Never execute downloaded bytes on the editor origin")')
    },
  })
  assets.preload()
  const url = 'https://example.test/slidev/runtime/sandbox.js'
  const responses = await Promise.all([
    assets.fetch(url, { credentials: 'omit' }),
    assets.fetch(url, { credentials: 'omit' }),
  ])
  assert.equal(await responses[0].text(), await responses[1].text())
  assert.equal(calls.length, 2, 'Only JavaScript and CSS preload once')
  assert.ok(calls.every(call => call.options.credentials === 'omit'))
  await assets.fetch('https://example.test/slidev/runtime/grammars/js.json', { credentials: 'omit' })
  await assets.fetch(url, { credentials: 'include' })
  await assets.fetch(url, { credentials: 'omit', method: 'POST' })
  assert.equal(calls.length, 5, 'Other requests retain the normal fetch path')
})

it('failed speculative downloads can retry on Render', async () => {
  for (const failure of [
    new Error('Disconnected'),
    new Response('', { status: 503 }),
  ]) {
    let calls = 0
    const assets = createRuntimeAssets({
      base: 'https://example.test/',
      async fetchSource() {
        calls++
        if (calls <= 2) {
          if (failure instanceof Error)
            throw failure
          return failure
        }
        return new Response('Recovered')
      },
    })
    assets.preload()
    await new Promise(resolve => setTimeout(resolve, 0))
    assert.equal(await (await assets.fetch('https://example.test/runtime/sandbox.js', { credentials: 'omit' })).text(), 'Recovered')
    assert.equal(calls, 3)
  }
})
