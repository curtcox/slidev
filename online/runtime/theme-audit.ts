import type { Plugin } from 'vite'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readdir, readFile, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'

const require = createRequire(import.meta.url)

/** A theme upgrade needs an explicit license/compatibility/size review. */
export function auditThemes(): Plugin {
  return {
    name: 'slidev-online-audit-themes',
    async generateBundle() {
      const audit = []
      for (const name of ['default', 'seriph']) {
        const root = dirname(require.resolve(`@slidev/theme-${name}/package.json`))
        const metadata = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
        const license = await readFile(resolve(root, 'LICENSE'))
        assert.equal(metadata.version, '0.25.0', `Review ${name}'s compatibility, license and size before upgrading`)
        assert.equal(metadata.license, 'MIT')
        // New executable/theme setup files must be integrated deliberately.
        assert.deepEqual((await readdir(root)).filter(file => /^(?:setup|uno\.|unocss\.|fonts)/.test(file)), [])
        if ((await readdir(root)).includes('components'))
          assert.deepEqual((await readdir(resolve(root, 'components'))).filter(file => file !== '.gitkeep'), [])
        let sourceBytes = 0
        for (const folder of ['layouts', 'styles']) {
          for (const file of await readdir(resolve(root, folder)))
            sourceBytes += (await stat(resolve(root, folder, file))).size
        }
        assert.ok(sourceBytes < 32 * 1024, `${name} exceeds its reviewed source size`)
        const fileName = `licenses/theme-${name}.txt`
        this.emitFile({ type: 'asset', fileName, source: license })
        audit.push({
          name,
          version: metadata.version,
          license: metadata.license,
          licenseSha256: createHash('sha256').update(license).digest('hex'),
          sourceBytes,
          licenseFile: fileName,
        })
      }
      this.emitFile({ type: 'asset', fileName: 'theme-audit.json', source: `${JSON.stringify(audit, null, 2)}\n` })
    },
  }
}
