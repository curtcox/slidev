import type { Plugin } from 'vite'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import collections from './src/icon-collections.json' with { type: 'json' }

const require = createRequire(import.meta.url)

/** Ship the pinned collection data separately from the initial JS payload. */
export function bundleIcons(): Plugin {
  return {
    name: 'slidev-online-bundle-icons',
    async generateBundle() {
      const metadata = require('@iconify/json/package.json')
      assert.equal(metadata.version, '2.2.553', 'Review collection licenses and sizes before upgrading icons')
      const audit = []
      for (const prefix of collections) {
        const source = await readFile(require.resolve(`@iconify/json/json/${prefix}.json`))
        const data = JSON.parse(source.toString())
        assert.equal(data.prefix, prefix)
        assert.ok(source.length < 12 * 1024 * 1024, `${prefix} exceeds its reviewed size`)
        assert.ok(data.info?.author?.name && data.info?.license?.spdx)
        const fileName = `icons/${prefix}.json`
        this.emitFile({ type: 'asset', fileName, source })
        audit.push({
          prefix,
          packageVersion: metadata.version,
          info: data.info,
          bytes: source.length,
          sha256: createHash('sha256').update(source).digest('hex'),
          fileName,
        })
      }
      // Preserve upstream attribution and license links alongside the data.
      this.emitFile({ type: 'asset', fileName: 'icons/attribution.json', source: `${JSON.stringify(audit, null, 2)}\n` })
    },
  }
}
