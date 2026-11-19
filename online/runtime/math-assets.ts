import type { Plugin } from 'vite'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { init, parse } from 'es-module-lexer'

const require = createRequire(import.meta.url)

/** Self-contained font URLs work in opaque frames without cross-origin requests. */
export function bundleMathStyles(): Plugin {
  return {
    name: 'slidev-online-math-styles',
    async generateBundle() {
      const root = join(dirname(require.resolve('katex')), '..')
      const metadata = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
      assert.equal(metadata.version, '0.19.1', 'Review the math runtime, fonts and styles before upgrading KaTeX')
      assert.equal(metadata.license, 'MIT')
      const rendererFile = 'math/katex.js'
      const renderer = await readFile(join(root, 'dist/katex.mjs'))
      await init
      assert.deepEqual(parse(renderer.toString())[0], [], 'The KaTeX ESM release must load directly from a Blob URL')
      assert.ok(renderer.length < 1024 * 1024, 'Review the math renderer size')
      const source = await readFile(join(root, 'dist/katex.min.css'), 'utf8')
      const fonts = []
      let css = source
      const declarations = [
        ...source.matchAll(/src:url\(fonts\/(KaTeX_[\w-]+\.woff2)\) format\("woff2"\),url\([^)]+\) format\("woff"\),url\([^)]+\) format\("truetype"\)/g),
      ]
      assert.equal(declarations.length, 20, 'Review the font list when KaTeX changes')
      for (const [declaration, name] of declarations) {
        const bytes = await readFile(join(root, 'dist/fonts', name))
        css = css.replace(declaration, `src:url(data:font/woff2;base64,${bytes.toString('base64')}) format("woff2")`)
        fonts.push({
          name,
          bytes: bytes.length,
          sha256: createHash('sha256').update(bytes).digest('hex'),
        })
      }
      assert.ok(!css.includes('url(fonts/'), 'All math fonts must be self-contained')
      assert.ok(css.length < 512 * 1024, 'Review the math stylesheet size')
      this.emitFile({ type: 'asset', fileName: 'math/katex.css', source: css })
      this.emitFile({ type: 'asset', fileName: rendererFile, source: renderer })
      this.emitFile({ type: 'asset', fileName: 'math/LICENSE', source: await readFile(join(root, 'LICENSE')) })
      this.emitFile({
        type: 'asset',
        fileName: 'math/audit.json',
        source: `${JSON.stringify({
          package: metadata.name,
          version: metadata.version,
          license: metadata.license,
          licenseFile: 'math/LICENSE',
          fileName: 'math/katex.css',
          bytes: css.length,
          sha256: createHash('sha256').update(css).digest('hex'),
          renderer: {
            fileName: rendererFile,
            bytes: renderer.length,
            sha256: createHash('sha256').update(renderer).digest('hex'),
          },
          fonts,
        }, null, 2)}\n`,
      })
    },
  }
}
