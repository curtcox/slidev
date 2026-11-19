import assert from 'node:assert/strict'
import process from 'node:process'
import { register } from 'tsx/esm/api'

register({ tsconfig: false })
async function main() {
  const { build } = await import('../../../packages/slidev/node/commands/build.ts')
  const { resolveOptions } = await import('../../../packages/slidev/node/options.ts')
  const [entry, outDir] = process.argv.slice(2)
  assert.ok(entry && outDir, 'A CLI reference needs an entry and output directory')
  const options = await resolveOptions({ entry, routerMode: 'hash' }, 'build')
  // Match Online's deterministic optional HTML embedding in Markdown fences.
  options.utils.shikiOptions.tokenizeTimeLimit = 0
  await options.utils.shiki.codeToHtml('', { ...options.utils.shikiOptions, lang: 'html' })
  if (process.argv.includes('--demo')) {
    Object.assign(options.data.config, {
      drawings: { enabled: false },
      record: false,
      presenter: false,
      browserExporter: false,
      wakeLock: false,
      preloadImages: false,
      codeCopy: false,
      transition: 'none',
      colorSchema: 'light',
    })
  }
  await build(options, {
    base: './',
    logLevel: 'warn',
    build: { outDir, emptyOutDir: true },
  }, {})
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
