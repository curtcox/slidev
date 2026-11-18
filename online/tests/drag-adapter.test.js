import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { it } from 'node:test'
import { browserTransforms } from '../runtime/browser-aliases.ts'

it('adapts the actual upstream drag composable and rejects changed transformation anchors', async () => {
  const path = new URL('../../packages/client/composables/useDragElements.ts', import.meta.url).pathname
  const source = await readFile(path, 'utf8')
  const plugin = browserTransforms()
  assert.ok(plugin.transform(source, path).code.includes('return useOnlineDragUpdater(no)'))
  assert.throws(() => plugin.transform(source.replace('export function useDragElementsUpdater(no: number)', 'export function updater(no: number)'), path), /Review the online drag adapter/)
  assert.equal(plugin.transform(source, '/unrelated.ts'), undefined)
})

it('routes drag state to memory for TS and Vue script importers, including query strings', () => {
  const plugin = browserTransforms()
  for (const file of ['composables/useDragElements.ts', 'composables/useSlideBounds.ts', 'internals/DragControl.vue?vue&type=script&setup=true&lang.ts']) {
    assert.match(plugin.resolveId('../state', `/repo/packages/client/${file}`), /shims\/drag-state.ts$/)
  }
  assert.equal(plugin.resolveId('../state', '/unrelated.ts'), undefined)
})
