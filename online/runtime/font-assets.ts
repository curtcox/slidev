import type { Plugin } from 'vite'
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import catalog from './src/font-catalog.json' with { type: 'json' }

const require = createRequire(import.meta.url)
const hash = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex')

/** Embed unchanged WOFF2 bytes: opaque frames cannot use app-origin font URLs. */
export function bundleThemeFonts(): Plugin {
  return {
    name: 'slidev-online-theme-fonts',
    async generateBundle() {
      const audit = []
      for (const [family, entry] of Object.entries(catalog)) {
        const root = dirname(require.resolve(`${entry.package}/package.json`))
        const metadata = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
        const fontMetadata = JSON.parse(await readFile(join(root, 'metadata.json'), 'utf8'))
        assert.equal(metadata.version, '5.3.0', 'Review theme font bytes and licenses before upgrading')
        assert.equal(metadata.license, 'OFL-1.1')
        assert.equal(fontMetadata.family, family)
        let css = (await Promise.all(entry.styles.map(file => readFile(join(root, file), 'utf8')))).join('\n')
        // The alias matches the theme's family name; font bytes are unmodified.
        css = css.replaceAll(`font-family: '${family} Variable'`, `font-family: '${family}'`)
        const declarations = [
          ...css.matchAll(/src: url\(\.\/files\/([\w-]+\.woff2)\)[^;]+;/g),
        ]
        assert.equal(declarations.length, entry.faces, 'Review font subset/style changes')
        const fonts = []
        for (const [declaration, name] of declarations) {
          const bytes = await readFile(join(root, 'files', name))
          assert.equal(bytes.subarray(0, 4).toString(), 'wOF2')
          css = css.replace(declaration, `src: url(data:font/woff2;base64,${bytes.toString('base64')}) format('woff2');`)
          fonts.push({
            name,
            bytes: bytes.length,
            sha256: hash(bytes),
          })
        }
        assert.ok(!css.includes('url(./'), 'All theme font bytes must be embedded')
        assert.ok(Buffer.byteLength(css) < 2 * 1024 * 1024, 'Review theme font payload growth')
        const fileName = `fonts/${entry.id}.css`
        const licenseFile = `fonts/${entry.id}-LICENSE`
        const license = await readFile(join(root, 'LICENSE'))
        this.emitFile({ type: 'asset', fileName, source: css })
        this.emitFile({ type: 'asset', fileName: licenseFile, source: license })
        audit.push({
          family,
          package: entry.package,
          version: metadata.version,
          license: metadata.license,
          attribution: fontMetadata.license.attribution,
          licenseFile,
          licenseSha256: hash(license),
          fileName,
          bytes: Buffer.byteLength(css),
          sha256: hash(css),
          fonts,
        })
      }
      this.emitFile({ type: 'asset', fileName: 'fonts/audit.json', source: `${JSON.stringify(audit, null, 2)}\n` })
    },
  }
}
