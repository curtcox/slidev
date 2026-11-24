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

// Lazy standalone Monaco editor bundle loaded only when a slide uses {monaco}.
export default defineConfig({
  plugins: [
    {
      name: 'slidev-online-monaco-opaque-scheduler',
      enforce: 'pre',
      transform(code, id) {
        if (!id.replaceAll('\\', '/').endsWith('/monaco-editor/esm/vs/base/common/platform.js'))
          return
        const seam = 'const setTimeout0IsFaster = (typeof $globalThis.postMessage === \'function\' && !$globalThis.importScripts);'
        assert.equal(code.split(seam).length, 2, 'Review Monaco opaque scheduler seam after upgrading monaco-editor')
        // The SDK maps globalThis.postMessage to the parent MessagePort, so Monaco's
        // window self-postMessage scheduler must fall back to setTimeout.
        return {
          code: code.replace(seam, 'const setTimeout0IsFaster = false;'),
          map: null,
        }
      },
    },
    {
      name: 'slidev-online-monaco-audit',
      enforce: 'post',
      async generateBundle(_options, bundle) {
        const root = join(dirname(require.resolve('monaco-editor')), '../..')
        const metadata = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
        assert.equal(metadata.version, '0.57.0', 'Review Monaco compatibility and size before upgrading')
        assert.equal(metadata.license, 'MIT')
        const output = bundle['monaco.js']
        assert.equal(output?.type, 'chunk')
        assert.deepEqual(output.imports, [])
        await init
        assert.deepEqual(
          parse(output.code)[0].filter(entry => entry.d !== -2 && (entry.d === -1 || entry.n !== undefined)),
          [],
          'Monaco must load directly from a Blob URL without external imports',
        )
        assert.ok(Buffer.byteLength(output.code) < 8 * 1024 * 1024, 'Review the Monaco bundle size')
        const cssEntry = Object.entries(bundle).find(([name, item]) => name.endsWith('.css') && item.type === 'asset')
        assert.ok(cssEntry, `Expected Monaco CSS asset in bundle (${Object.keys(bundle).join(', ')})`)
        const [cssFileName, cssAsset] = cssEntry
        assert.equal(cssAsset.type, 'asset')
        const cssText = typeof cssAsset.source === 'string'
          ? cssAsset.source
          : Buffer.from(cssAsset.source).toString('utf8')
        assert.ok(!/url\((?!['"]?data:)/i.test(cssText), 'Monaco CSS must inline fonts for opaque/offline sandboxes')
        this.emitFile({ type: 'asset', fileName: 'LICENSE', source: await readFile(join(root, 'LICENSE')) })
        this.emitFile({
          type: 'asset',
          fileName: 'audit.json',
          source: `${JSON.stringify({
            package: metadata.name,
            version: metadata.version,
            license: metadata.license,
            licenseFile: 'monaco/LICENSE',
            fileName: 'monaco/monaco.js',
            cssFileName: `monaco/${cssFileName}`,
            bytes: Buffer.byteLength(output.code),
            cssBytes: Buffer.byteLength(cssText),
            sha256: createHash('sha256').update(output.code).digest('hex'),
            cssSha256: createHash('sha256').update(cssText).digest('hex'),
          }, null, 2)}\n`,
        })
      },
    },
  ],
  define: { 'process.env.NODE_ENV': '"production"' },
  build: {
    outDir: 'dist/monaco',
    assetsInlineLimit: 1024 * 1024,
    cssCodeSplit: false,
    lib: {
      entry: fileURLToPath(new URL('./src/monaco-entry.ts', import.meta.url)),
      formats: ['es'],
      fileName: () => 'monaco.js',
      cssFileName: 'monaco',
    },
    rolldownOptions: {
      output: { codeSplitting: false, minify: true },
    },
  },
})
