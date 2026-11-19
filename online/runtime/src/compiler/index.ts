import type { ResolvedSlidevOptions } from '@slidev/types'
import { compileScript, parse as parseSfc } from '@vue/compiler-sfc/dist/compiler-sfc.esm-browser.js'
import { transform } from 'sucrase'
import { version as vueVersion } from 'vue'
import { resolveConfig } from '../../../../packages/parser/src/config'
import { parseSync } from '../../../../packages/parser/src/core'
import { templateTitleRendererMd } from '../../../../packages/slidev/node/virtual/titles'
import { wrapSlideLayout } from '../../../../packages/slidev/node/vite/layoutWrapperCore'
import { createMarkdownPlugin } from '../../../../packages/slidev/node/vite/markdown'
import { prepareKatex } from '../shims/katex'
import { resolveTheme } from '../themes'
import { compilerOffset, createSourceLocations, locatedError, positionAt, slideError } from './diagnostics'
import { loadLanguage } from './languages'

const MAX_BYTES = 5 * 1024 * 1024
const compiledCache = new Map<string, { value: CompiledSlide, bytes: number }>()
let compiledCacheBytes = 0

export interface CompiledSlide {
  sfc: string
  code: string
  scopeId: string
  styles: { content: string, scoped: boolean, offset?: number }[]
  warnings: string[]
}

async function digest(text: string) {
  const bytes = new TextEncoder().encode(text)
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('')
}

function compileSfc(sfc: string, id: string, warnings: string[], locations?: ReturnType<typeof createSourceLocations>): CompiledSlide {
  const { descriptor, errors } = parseSfc(sfc, { filename: `${id}.vue` })
  let compiled
  try {
    if (errors.length)
      throw errors[0]
    compiled = compileScript(descriptor, {
      id,
      inlineTemplate: true,
      // Vue's large-static-tree stringifier evaluates constant expressions with
      // Function(). Keep template generation compatible with the SDK frame CSP.
      templateOptions: {
        compilerOptions: { hoistStatic: false },
      },
    })
  }
  catch (error) {
    const generated = compilerOffset(error, sfc, descriptor.scriptSetup?.loc.start.offset)
    const offset = generated == null
      ? undefined
      : locations?.offset(sfc, generated)
    throw Object.assign(error instanceof Error
      ? error
      : new Error(String(error)), { sourceOffset: offset })
  }
  const code = transform(compiled.content, {
    transforms: ['typescript'],
    disableESTransforms: true,
    production: true,
    filePath: `${id}.ts`,
  }).code
  return {
    sfc,
    code,
    scopeId: `data-v-${id}`,
    styles: descriptor.styles.map(style => ({
      content: style.content,
      scoped: style.scoped ?? false,
      offset: locations?.offset(sfc, style.loc.start.offset),
    })),
    warnings: [
      ...new Set(warnings),
    ],
  }
}

export async function createDeckCompiler(src: string, { plantUmlAllowed = false, tokenizeTimeLimit = 500 } = {}) {
  if (typeof src !== 'string' || new TextEncoder().encode(src).byteLength > MAX_BYTES)
    throw new Error('The deck exceeds the 5 MiB limit')
  const parsed = parseSync(src, 'slides.md')
  // Parsing ignores a leading BOM; diagnostics still address the editor's bytes.
  if (src.startsWith('\uFEFF') && parsed.slides[0])
    parsed.slides[0].raw = `\uFEFF${parsed.slides[0].raw}`
  if (!parsed.slides.length || parsed.slides.every(slide => !slide.content.trim()))
    throw new Error('The deck must contain at least one slide')
  if (parsed.slides.length > 10000)
    throw new Error('The deck exceeds the 10,000 slide limit')
  for (const slide of parsed.slides) {
    if (slide.frontmatterDoc?.errors.length) {
      const error = slide.frontmatterDoc.errors[0]
      const start = slide.raw.indexOf(slide.frontmatterRaw!, slide.frontmatterStyle === 'yaml'
        ? slide.raw.indexOf('```') + 3
        : 3)
      const position = positionAt(slide.raw, Math.max(0, start) + error.pos[0])
      throw locatedError(new Error(`Slide ${slide.index + 1}: ${error.message}`), { file: 'slides.md', line: slide.start + position.line, column: position.column })
    }
  }
  const slides = parsed.slides.filter(source => !source.frontmatter.disabled && !source.frontmatter.hide)
    .map((source, index) => ({
      ...source,
      index,
      no: index + 1,
      source,
    }))
  if (!slides.length)
    throw new Error('The deck must contain at least one visible slide')
  // Headmatter belongs to the source document, even when its first slide is
  // hidden. The CLI infers the presentation title from the first visible slide.
  const headmatter = { ...parsed.slides[0].frontmatter }
  headmatter.title ??= slides[0].title
  const theme = resolveTheme(headmatter.theme ?? headmatter.config?.theme)
  const config = resolveConfig(headmatter, theme.meta)
  config.theme = theme.name
  const requestedTwoslash = headmatter.twoslash != null && headmatter.twoslash !== false
  config.twoslash = false
  let currentWarnings: string[] = []
  const hasMath = src.includes('$')
  const safeShiki: Record<string, unknown> = {}
  for (const method of ['codeToHtml', 'codeToTokens'] as const) {
    safeShiki[method] = (async (code: string, options: any) => {
      const lang = options.lang || 'text'
      let language: Awaited<ReturnType<typeof loadLanguage>>
      try {
        language = await loadLanguage(lang)
      }
      catch {
        currentWarnings.push(`Language ${lang} is unavailable; showing plain text`)
        language = await loadLanguage('text')
      }
      return (language.shiki[method] as any)(code, { ...options, lang: language.lang })
    }) as any
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
        katex: hasMath,
      },
      watchFiles: {},
      markdownFiles: {},
    },
    utils: {
      shiki: safeShiki,
      shikiOptions: {
        themes: { dark: 'vitesse-dark', light: 'vitesse-light' },
        defaultColor: false,
        tokenizeTimeLimit,
      },
      katexOptions: { throwOnError: false, strict: false },
    },
  } as unknown as ResolvedSlidevOptions
  const locations = createSourceLocations()
  const markdown = await createMarkdownPlugin(options, {
    markdown: { vueVersion, markdownSetup: locations.setup },
  } as any)
  const hook = typeof markdown.transform === 'function'
    ? markdown.transform
    : markdown.transform!.handler
  const configKey = await digest(JSON.stringify([
    headmatter,
    config,
    plantUmlAllowed,
    tokenizeTimeLimit,
  ]))
  let queue = Promise.resolve()

  return {
    slides,
    config,
    theme,
    compileTitles(): Promise<CompiledSlide> {
      const pending = queue.then(async () => {
        currentWarnings = []
        const source = await templateTitleRendererMd.getContent.call({} as any, options)
        if (hasMath && slides.some(slide => slide.title?.includes('$')))
          await prepareKatex()
        locations.reset()
        try {
          const result = await (hook as any).call({
            error(error: unknown) { throw error },
          }, source, '/@slidev/title-renderer.md')
          return compileSfc(result.code, `online-titles-${(await digest(source)).slice(0, 16)}`, currentWarnings, locations)
        }
        catch (error) {
          const offset = (error as any)?.sourceOffset
          if (offset != null) {
            const before = source.slice(0, offset)
            const no = Number([
              ...before.matchAll(/<template v-(?:else-)?if="no === (\d+)">/g),
            ].at(-1)?.[1])
            const slide = slides[no - 1]
            if (slide && slide.title) {
              const titleStart = source.indexOf('\n\n', before.lastIndexOf('<template')) + 2
              const original = slide.source.raw.indexOf(String(slide.title))
              if (original >= 0) {
                const position = positionAt(slide.source.raw, original + offset - titleStart)
                throw locatedError(error, {
                  file: 'slides.md',
                  slide: no,
                  line: slide.source.start + position.line,
                  column: position.column,
                })
              }
            }
          }
          throw error
        }
      })
      queue = pending.then(() => {}, () => {})
      return pending
    },
    compile(index: number, layoutImport: string): Promise<CompiledSlide> {
      const pending = queue.then(async () => {
        const slide = slides[index]
        if (!slide)
          throw new Error(`Missing slide ${index + 1}`)
        if (slide.frontmatter.src)
          throw slideError(new Error('Slide imports (src:) are not available online'), slide.source, index + 1)
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
        currentWarnings = [...theme.warnings]
        if (requestedTwoslash || /^```[^\n]*\btwoslash\b|^\s*\/\/\s*\^[?!]/m.test(slide.content))
          currentWarnings.push('Twoslash is unavailable; code blocks use static highlighting')
        if (hasMath && slide.content.includes('$'))
          await prepareKatex()
        const id = `online-${key.slice(0, 16)}`
        locations.reset()
        let output: CompiledSlide
        try {
          const result = await (hook as any).call({
            error(error: unknown) { throw error },
          }, slide.content, `slides.md__slidev_${index + 1}.md`)
          const sfc = wrapSlideLayout(result.code, index, layoutImport)
          output = compileSfc(sfc, id, currentWarnings, locations)
        }
        catch (error) {
          throw slideError(error, slide.source, index + 1, (error as any)?.sourceOffset ?? 0)
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
