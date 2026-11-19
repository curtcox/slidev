import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import { it } from 'node:test'

it('ships the pinned Ace modules and license with their audited bytes', async () => {
  const root = new URL('../dist/vendor/ace-1.43.3/', import.meta.url)
  const manifest = JSON.parse(await fs.readFile(new URL('manifest.json', root), 'utf8'))
  assert.equal(manifest.version, '1.43.3')
  assert.equal(manifest.license, 'BSD-3-Clause')
  for (const entry of manifest.files) {
    const data = await fs.readFile(new URL(entry.file, root))
    assert.equal(data.length, entry.bytes)
    assert.equal(createHash('sha256').update(data).digest('hex'), entry.sha256)
  }
  assert.match(await fs.readFile(new URL('LICENSE', root), 'utf8'), /Redistribution and use/)
})
