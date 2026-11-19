import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { it } from 'node:test'
import { pathToFileURL } from 'node:url'
import unoConfig from '../../packages/client/uno.config.ts'
import { extractUtilityTokens } from '../runtime/utility-tokens.ts'

const require = createRequire(new URL('../runtime/package.json', import.meta.url))
const { createGenerator, mergeConfigs } = await import(pathToFileURL(require.resolve('unocss')).href)

it('precomputed component tokens preserve CSS with attributify, variants, shortcuts and custom fonts', async () => {
  const source = `
    <template>
      <div flex="~ col" text="red-500 center" class="font-sans dark:text-white forward:opacity-50 abs-tr">
        <span class="font-serif font-mono">Ordinary words do not become runtime tokens.</span>
      </div>
    </template>
    <script setup>throw new Error('Never execute component source')</script>
  `
  const dynamic = '<p class="text-blue-500 hover:font-bold">User slide</p>'
  const tokens = await extractUtilityTokens(source)
  assert.ok(tokens.includes('font-serif'))
  assert.ok(!tokens.includes('Ordinary'))
  for (const fontFamily of [
    undefined,
    { sans: 'Custom Sans', serif: 'Custom Serif', mono: 'Custom Mono' },
  ]) {
    const config = mergeConfigs([
      unoConfig,
      {
        theme: { fontFamily },
      },
    ])
    const expected = await (await createGenerator(config)).generate(`${dynamic}\n${source}`)
    const uno = await createGenerator(config)
    const combined = await uno.applyExtractors(dynamic)
    tokens.forEach(token => combined.add(token))
    assert.equal((await uno.generate(combined)).css, expected.css)
  }
})

it('precomputed upstream layout and drag tokens retain their complete CSS', async () => {
  const sources = await Promise.all([
    '../../packages/client/layouts/two-cols.vue',
    '../../packages/client/internals/DragControl.vue',
    '../../packages/client/modules/v-mark.ts',
    '../../packages/client/builtin/PoweredBySlidev.vue',
  ].map(file => readFile(new URL(file, import.meta.url), 'utf8')))
  const tokens = new Set((await Promise.all(sources.map(extractUtilityTokens))).flat())
  const expected = await (await createGenerator(unoConfig)).generate(sources.join('\n'))
  const actual = await (await createGenerator(unoConfig)).generate(tokens)
  assert.equal(actual.css, expected.css)
})
