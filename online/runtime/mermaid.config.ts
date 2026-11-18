import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { init, parse } from 'es-module-lexer'
import { defineConfig } from 'vite'

const require = createRequire(import.meta.url)

// SDK imports execute from Blob URLs: each lazy executable must be standalone.
export default defineConfig({
  plugins: [
    {
      name: 'slidev-online-mermaid-audit',
      async generateBundle(_options, bundle) {
        const root = join(dirname(require.resolve('mermaid')), '..')
        const metadata = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
        assert.equal(metadata.version, '12.3.0', 'Review diagram compatibility and size before upgrading Mermaid')
        assert.equal(metadata.license, 'MIT')
        const output = bundle['mermaid.js']
        assert.equal(output.type, 'chunk')
        assert.deepEqual(output.imports, [])
        // Rolldown can leave self-import metadata after inlining. Check actual
        // emitted syntax, since relative imports cannot resolve from a Blob URL.
        await init
        assert.deepEqual(parse(output.code)[0].filter(entry => entry.d !== -2), [])
        assert.ok(output.code.length < 16 * 1024 * 1024, 'Review the diagram bundle size')
        this.emitFile({ type: 'asset', fileName: 'LICENSE', source: await readFile(join(root, 'LICENSE')) })
        this.emitFile({
          type: 'asset',
          fileName: 'audit.json',
          source: `${JSON.stringify({
            package: metadata.name,
            version: metadata.version,
            license: metadata.license,
            licenseFile: 'diagrams/LICENSE',
            fileName: 'diagrams/mermaid.js',
            bytes: Buffer.byteLength(output.code),
            sha256: createHash('sha256').update(output.code).digest('hex'),
          }, null, 2)}\n`,
        })
      },
    },
  ],
  define: { 'process.env.NODE_ENV': '"production"' },
  build: {
    outDir: 'dist/diagrams',
    lib: {
      entry: fileURLToPath(new URL('./src/mermaid-entry.ts', import.meta.url)),
      formats: ['es'],
      fileName: () => 'mermaid.js',
    },
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
})
