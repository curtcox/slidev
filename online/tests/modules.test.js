import assert from 'node:assert/strict'
import { it } from 'node:test'
// This packaging test exercises the shipped browser bundle.
// eslint-disable-next-line antfu/no-import-dist
import { rewriteModuleImports } from '../runtime/dist/sandbox.js'

it('rewrites real static and literal dynamic imports while preserving strings and import.meta', async () => {
  const source = `const label = "import('vue')"; import { ref } from 'vue'; await import('vue'); const own = import.meta.url`
  const requested = []
  const result = await rewriteModuleImports(source, (name) => {
    requested.push(name)
    return 'blob:null/bundled-vue'
  })
  assert.deepEqual(requested, ['vue', 'vue'])
  assert.ok(result.includes(`const label = "import('vue')"`))
  assert.ok(result.includes('from "blob:null/bundled-vue"'))
  assert.ok(result.includes('import("blob:null/bundled-vue")'))
  assert.ok(result.includes('import.meta.url'))
})

it('rejects expression imports and surfaces missing bundled-module errors without evaluation', async () => {
  await assert.rejects(rewriteModuleImports('const loaded = import(userInput)', () => {
    throw new Error('The resolver must not run for an expression')
  }), /Dynamic module expressions/)
  await assert.rejects(rewriteModuleImports('import "node:fs"', () => {
    throw new Error('Only bundled modules are available online')
  }), /Only bundled modules/)
})
