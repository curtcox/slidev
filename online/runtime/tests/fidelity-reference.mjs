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
  // Vite transforms slides concurrently. Shiki's shared grammar/theme registry
  // must finish one request before another request can mutate that registry.
  let highlighting = Promise.resolve()
  for (const method of [
    'codeToHtml',
    'codeToHast',
    'codeToTokens',
    'codeToTokensBase',
    'codeToTokensWithThemes',
    'getLastGrammarState',
  ]) {
    const render = options.utils.shiki[method].bind(options.utils.shiki)
    options.utils.shiki[method] = (...args) => {
      const result = highlighting.then(() => render(...args))
      highlighting = result.then(() => {}, () => {})
      return result
    }
  }
  // Markdown embeds text.html.derivative, not text.html.basic. Loading only
  // HTML leaves that optional grammar absent until another fence loads Vue.
  options.utils.shikiOptions.tokenizeTimeLimit = 0
  const markup = '<div class="probe">HTML</div>'
  await options.utils.shiki.codeToHtml(markup, { ...options.utils.shikiOptions, lang: 'html-derivative' })
  const probe = await options.utils.shiki.codeToHtml(markup, { ...options.utils.shikiOptions, lang: 'md' })
  assert.ok(new Set([
    ...probe.matchAll(/--shiki-light:(#[\da-f]+)/gi),
  ].map(match => match[1])).size > 2, 'CLI Markdown reference must highlight embedded HTML')
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
