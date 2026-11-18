import type { Plugin } from 'vite'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'

const require = createRequire(import.meta.url)
const reviewed = {
  'default': {
    version: '0.25.0',
    layouts: 6,
    components: 0,
    assets: 0,
    limit: 8 * 1024,
  },
  'seriph': {
    version: '0.25.0',
    layouts: 6,
    components: 0,
    assets: 0,
    limit: 8 * 1024,
  },
  'apple-basic': {
    version: '0.25.1',
    layouts: 10,
    components: 0,
    assets: 0,
    limit: 8 * 1024,
  },
  'bricks': {
    version: '0.25.0',
    layouts: 9,
    components: 11,
    assets: 10,
    limit: 32 * 1024,
  },
  'shibainu': {
    version: '0.25.0',
    layouts: 14,
    components: 0,
    assets: 15,
    limit: 256 * 1024,
  },
}

/** A theme upgrade needs an explicit license/compatibility/size review. */
export function auditThemes(): Plugin {
  return {
    name: 'slidev-online-audit-themes',
    async generateBundle() {
      const audit = []
      for (const [name, expected] of Object.entries(reviewed)) {
        const root = dirname(require.resolve(`@slidev/theme-${name}/package.json`))
        const metadata = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
        const license = await readFile(resolve(root, 'LICENSE'))
        assert.equal(metadata.version, expected.version, `Review ${name}'s compatibility, license and size before upgrading`)
        assert.equal(metadata.license, 'MIT')
        // New executable/theme setup files must be integrated deliberately.
        const entries = await readdir(root)
        assert.deepEqual(entries.filter(file => /^(?:setup|uno\.|unocss\.|fonts)/.test(file)), [])
        let sourceBytes = 0
        const files = []
        for (const folder of [
          'layouts',
          'components',
          'assets',
          'styles',
        ] as const) {
          const names = entries.includes(folder)
            ? (await readdir(resolve(root, folder))).filter(file => file !== '.gitkeep').sort()
            : []
          if (folder !== 'styles')
            assert.equal(names.length, expected[folder], `Review ${name}'s ${folder} changes`)
          files.push(...names.map(file => `${folder}/${file}`))
        }
        if (entries.includes('layoutHelper.ts'))
          files.push('layoutHelper.ts')
        const sources = []
        for (const file of ['package.json', ...files]) {
          const bytes = await readFile(resolve(root, file))
          if (file !== 'package.json')
            sourceBytes += bytes.length
          sources.push({
            file,
            bytes: bytes.length,
            sha256: createHash('sha256').update(bytes).digest('hex'),
          })
        }
        assert.ok(sourceBytes < expected.limit, `${name} exceeds its reviewed source size`)
        const fileName = `licenses/theme-${name}.txt`
        this.emitFile({ type: 'asset', fileName, source: license })
        audit.push({
          name,
          version: metadata.version,
          license: metadata.license,
          licenseSha256: createHash('sha256').update(license).digest('hex'),
          sourceBytes,
          layouts: expected.layouts,
          components: expected.components,
          assets: expected.assets,
          sources,
          licenseFile: fileName,
        })
      }
      this.emitFile({ type: 'asset', fileName: 'theme-audit.json', source: `${JSON.stringify(audit, null, 2)}\n` })
    },
  }
}
