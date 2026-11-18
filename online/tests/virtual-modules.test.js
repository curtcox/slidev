import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { it } from 'node:test'
import { checkVirtualModules, virtualModules } from '../runtime/check-virtual-modules.ts'

it('covers every current client virtual import with an existing runtime implementation', async () => {
  const names = await checkVirtualModules()
  assert.equal(names.length, 18)
  assert.ok(names.includes('#slidev/title-renderer'))
  assert.ok(names.includes('#slidev/setups/mermaid-renderer'))
})

it('rejects new virtual imports in TS and Vue before an upstream merge can silently break online', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'slidevonline-virtual-'))
  try {
    await writeFile(join(directory, 'fixture.ts'), `// import '#slidev/comment-only'
      const example = "import '#slidev/string-only'";
      export { default } from '#slidev/configs';
      const lazy = () => import('#slidev/slides');`)
    assert.deepEqual(await checkVirtualModules(directory), ['#slidev/configs', '#slidev/slides'])
    await writeFile(join(directory, 'fixture.vue'), `<script setup lang="ts">import x from '#slidev/future-feature'</script><template>{{ x }}</template>`)
    await assert.rejects(checkVirtualModules(directory), /no online implementation for #slidev\/future-feature/)
    await rm(join(directory, 'fixture.vue'))
    await assert.rejects(checkVirtualModules(directory, { ...virtualModules, '#slidev/configs': 'missing.ts' }), /ENOENT/)
  }
  finally { await rm(directory, { recursive: true, force: true }) }
})
