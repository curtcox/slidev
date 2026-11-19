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

// The SDK imports a standalone Blob module into each opaque execution world.
export default defineConfig({
  plugins: [
    {
      name: 'slidev-online-highlighting-audit',
      async generateBundle(_options, bundle) {
        const root = join(dirname(require.resolve('shiki')), '..')
        const metadata = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
        assert.equal(metadata.version, '4.6.0', 'Review highlighting compatibility and size before upgrading Shiki')
        assert.equal(metadata.license, 'MIT')
        const output = bundle['shiki.js']
        assert.equal(output.type, 'chunk')
        await init
        assert.deepEqual(parse(output.code)[0].filter(entry => entry.d !== -2), [], 'The highlighter must load directly from a Blob URL')
        assert.ok(Buffer.byteLength(output.code) < 1024 * 1024, 'Review the highlighter bundle size')
        this.emitFile({ type: 'asset', fileName: 'LICENSE', source: await readFile(join(root, 'LICENSE')) })
        this.emitFile({
          type: 'asset',
          fileName: 'audit.json',
          source: `${JSON.stringify({
            package: metadata.name,
            version: metadata.version,
            license: metadata.license,
            licenseFile: 'highlighting/LICENSE',
            fileName: 'highlighting/shiki.js',
            bytes: Buffer.byteLength(output.code),
            sha256: createHash('sha256').update(output.code).digest('hex'),
          }, null, 2)}\n`,
        })
      },
    },
  ],
  define: { 'process.env.NODE_ENV': '"production"' },
  build: {
    outDir: 'dist/highlighting',
    lib: {
      entry: fileURLToPath(new URL('./src/highlighting-entry.ts', import.meta.url)),
      formats: ['es'],
      fileName: () => 'shiki.js',
    },
    rolldownOptions: {
      output: { codeSplitting: false, minify: true },
    },
  },
})
