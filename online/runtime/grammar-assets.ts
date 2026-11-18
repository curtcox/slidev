import type { Plugin } from 'vite'
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import languages from './src/compiler/languages.json' with { type: 'json' }

// Resolve through our direct Shiki dependency, including in strict pnpm installs.
const require = createRequire(createRequire(import.meta.url).resolve('shiki'))

/** Serialize data, including embedded-language dependencies; never ship grammar JS. */
export function bundleGrammars(): Plugin {
  return {
    name: 'slidev-online-bundle-grammars',
    async generateBundle() {
      const packageRoot = join(dirname(require.resolve('@shikijs/langs')), '..')
      const metadata = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'))
      assert.equal(metadata.version, '4.6.0', 'Review grammar sizes and licenses before upgrading Shiki')
      const audit = []
      for (const [name, aliases] of Object.entries(languages)) {
        const { default: sourceGrammars } = await import(pathToFileURL(require.resolve(`@shikijs/langs/${name}`)).href)
        const grammars = [...sourceGrammars]
        if (name === 'markdown') {
          // Markdown references HTML without declaring it as a hard dependency.
          // Supply its ordinary embedded grammar without Vue's global injections.
          const { default: html } = await import(pathToFileURL(require.resolve('@shikijs/langs/html-derivative')).href)
          grammars.push(...html.filter((grammar: any) => !grammars.some(entry => entry.name === grammar.name)))
        }
        const grammar = grammars.find((grammar: any) => grammar.name === name)
        assert.deepEqual(grammar?.aliases ?? [], aliases, `Review aliases for ${name}`)
        const source = `${JSON.stringify(grammars)}\n`
        assert.ok(Buffer.byteLength(source) < 5 * 1024 * 1024, `${name} exceeds its reviewed size`)
        const fileName = `grammars/${name}.json`
        this.emitFile({ type: 'asset', fileName, source })
        audit.push({
          name,
          aliases,
          dependencies: grammars.map((grammar: any) => grammar.name),
          fileName,
          bytes: Buffer.byteLength(source),
          sha256: createHash('sha256').update(source).digest('hex'),
        })
      }
      const license = await readFile(join(packageRoot, 'LICENSE'))
      this.emitFile({ type: 'asset', fileName: 'grammars/LICENSE', source: license })
      this.emitFile({
        type: 'asset',
        fileName: 'grammars/audit.json',
        source: `${JSON.stringify({
          package: metadata.name,
          version: metadata.version,
          license: metadata.license,
          licenseFile: 'grammars/LICENSE',
          languages: audit,
        }, null, 2)}\n`,
      })
    },
  }
}
