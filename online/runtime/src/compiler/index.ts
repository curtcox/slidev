import type { ResolvedSlidevOptions } from '@slidev/types'
import { compileScript, parse as parseSfc } from '@vue/compiler-sfc/dist/compiler-sfc.esm-browser.js'
import { createHighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import { transform } from 'sucrase'
import { version as vueVersion } from 'vue'
import { resolveConfig } from '../../../../packages/parser/src/config'
import { parseSync } from '../../../../packages/parser/src/core'
import { wrapSlideLayout } from '../../../../packages/slidev/node/vite/layoutWrapperCore'
import { createMarkdownPlugin } from '../../../../packages/slidev/node/vite/markdown'

const MAX_BYTES = 5 * 1024 * 1024
const compiledCache = new Map<string, { value: CompiledSlide, bytes: number }>()
let compiledCacheBytes = 0
const highlighter = createHighlighterCore({
  engine: createJavaScriptRegexEngine({ target: 'ES2018' }),
  themes: [import('@shikijs/themes/vitesse-light'), import('@shikijs/themes/vitesse-dark')],
  langs: [import('@shikijs/langs/javascript'), import('@shikijs/langs/typescript'), import('@shikijs/langs/yaml')],
})

export interface CompiledSlide {
  sfc: string
  code: string
  scopeId: string
  styles: { content: string, scoped: boolean }[]
  warnings: string[]
}

async function digest(text: string) {
  const bytes = new TextEncoder().encode(text)
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('')
}

export async function createDeckCompiler(src: string, { plantUmlAllowed = false } = {}) {
  if (typeof src !== 'string' || new TextEncoder().encode(src).byteLength > MAX_BYTES)
    throw new Error('The deck exceeds the 5 MiB limit')
  const parsed = parseSync(src, 'slides.md')
  if (!parsed.slides.length || parsed.slides.every(slide => !slide.content.trim()))
    throw new Error('The deck must contain at least one slide')
  if (parsed.slides.length > 10000)
    throw new Error('The deck exceeds the 10,000 slide limit')
  for (const slide of parsed.slides) {
    if (slide.frontmatterDoc?.errors.length)
      throw new Error(`Slide ${slide.index + 1}: ${slide.frontmatterDoc.errors[0].message}`)
  }
  const slides = parsed.slides.map(source => ({ ...source, no: source.index + 1, source }))
  const config = resolveConfig(slides[0].frontmatter)
  const requestedTwoslash = slides[0].frontmatter.twoslash != null && slides[0].frontmatter.twoslash !== false
  config.twoslash = false
  const shiki = await highlighter
  let currentWarnings: string[] = []
  const safeShiki = { ...shiki }
  for (const method of ['codeToHtml', 'codeToTokens'] as const) {
    safeShiki[method] = (code: string, options: any) => {
      let lang = options.lang || 'text'
      lang = ({ js: 'javascript', ts: 'typescript', yml: 'yaml' } as Record<string, string>)[lang] ?? lang
      if (!['text', 'txt', 'plaintext'].includes(lang) && !shiki.getLoadedLanguages().includes(lang)) {
        currentWarnings.push(`Language ${lang} is unavailable; showing plain text`)
        lang = 'text'
      }
      return (shiki[method] as any)(code, { ...options, lang })
    }
  }
  const options = {
    userRoot: '/',
    roots: [],
    mode: 'build',
    onlinePlantUmlAllowed: plantUmlAllowed,
    data: {
      config,
      slides,
      features: {
        katex: src.includes('$'),
      },
      watchFiles: {},
      markdownFiles: {},
    },
    utils: {
      shiki: safeShiki,
      shikiOptions: {
        themes: { dark: 'vitesse-dark', light: 'vitesse-light' },
        defaultColor: false,
      },
      katexOptions: { throwOnError: false, strict: false },
    },
  } as unknown as ResolvedSlidevOptions
  const markdown = await createMarkdownPlugin(options, {
    markdown: { vueVersion },
  } as any)
  const hook = typeof markdown.transform === 'function'
    ? markdown.transform
    : markdown.transform!.handler
  const configKey = await digest(JSON.stringify([slides[0].frontmatter, config, plantUmlAllowed]))
  let queue = Promise.resolve()

  return {
    slides,
    config,
    compile(index: number, layoutImport: string): Promise<CompiledSlide> {
      const pending = queue.then(async () => {
        const slide = slides[index]
        if (!slide)
          throw new Error(`Missing slide ${index + 1}`)
        if (slide.frontmatter.src)
          throw new Error('Slide imports (src:) are not available online')
        const key = await digest(JSON.stringify([
          configKey,
          index,
          slide.frontmatter,
          slide.content,
          layoutImport,
        ]))
        const cached = compiledCache.get(key)
        if (cached) {
          compiledCache.delete(key)
          compiledCache.set(key, cached)
          return cached.value
        }
        currentWarnings = requestedTwoslash || /^```[^\n]*\btwoslash\b|^\s*\/\/\s*\^[?!]/m.test(slide.content)
          ? ['Twoslash is unavailable; code blocks use static highlighting']
          : []
        const id = `online-${key.slice(0, 16)}`
        const result = await (hook as any).call({
          error(error: unknown) { throw error },
        }, slide.content, `slides.md__slidev_${index + 1}.md`)
        const sfc = wrapSlideLayout(result.code, index, layoutImport)
        const { descriptor, errors } = parseSfc(sfc, { filename: `slide-${index + 1}.vue` })
        if (errors.length)
          throw errors[0]
        const compiled = compileScript(descriptor, { id, inlineTemplate: true })
        const code = transform(compiled.content, {
          transforms: ['typescript'],
          disableESTransforms: true,
          production: true,
          filePath: `${id}.ts`,
        }).code
        const output = {
          sfc,
          code,
          scopeId: `data-v-${id}`,
          styles: descriptor.styles.map(style => ({ content: style.content, scoped: style.scoped ?? false })),
          warnings: [
            ...new Set(currentWarnings),
          ],
        }
        // A newer render may have compiled the same key while this one awaited
        // Markdown/Shiki. Reuse its entry without counting the bytes twice.
        const completed = compiledCache.get(key)
        if (completed)
          return completed.value
        const bytes = 2 * (output.code.length + output.sfc.length + output.styles.reduce((total, style) => total + style.content.length, 0))
        if (bytes <= 16 * 1024 * 1024) {
          compiledCache.set(key, { value: output, bytes })
          compiledCacheBytes += bytes
          while (compiledCache.size > 128 || compiledCacheBytes > 16 * 1024 * 1024) {
            const oldest = compiledCache.keys().next().value!
            compiledCacheBytes -= compiledCache.get(oldest)!.bytes
            compiledCache.delete(oldest)
          }
        }
        return output
      })
      queue = pending.then(() => {}, () => {})
      return pending
    },
  }
}
