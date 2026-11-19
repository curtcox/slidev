import type { SourceSlideInfo } from '@slidev/types'
import type MarkdownExit from 'markdown-exit'

export interface ErrorLocation {
  file: 'slides.md' | 'style.css'
  line: number
  column: number
  slide?: number
}

export function locatedError(error: unknown, location: ErrorLocation) {
  return Object.assign(new Error(error instanceof Error
    ? error.message
    : String(error)), location)
}

export function positionAt(source: string, offset: number) {
  const before = source.slice(0, Math.max(0, Math.min(source.length, offset)))
  return { line: before.split('\n').length, column: before.length - before.lastIndexOf('\n') }
}

export function offsetAt(source: string, line: number, column: number) {
  return source.split('\n').slice(0, Math.max(0, line - 1)).reduce((sum, text) => sum + text.length + 1, 0) + Math.max(0, column - 1)
}

/** The parser trims content and removes notes; contentStart alone is not its offset. */
export function contentOffset(slide: SourceSlideInfo) {
  const minimum = slide.frontmatterStyle === 'yaml'
    ? /^\s*```ya?ml[\s\S]*?```/.exec(slide.raw)?.[0].length ?? 0
    : slide.raw.split('\n').slice(0, slide.contentStart - slide.start).join('\n').length
  return Math.max(0, slide.raw.indexOf(slide.content, minimum))
}

export function slideError(error: unknown, slide: SourceSlideInfo, no: number, offset = 0) {
  const position = positionAt(slide.raw, contentOffset(slide) + offset)
  return locatedError(error, {
    file: 'slides.md',
    slide: no,
    line: slide.start + position.line,
    column: position.column,
  })
}

interface Fragment {
  rendered: string
  source: string
  offset: number
}

/** Keep source spans without changing the CLI's generated SFC or evaluating author code. */
export function createSourceLocations() {
  let fragments: Fragment[] = []
  return {
    reset() { fragments = [] },
    setup(md: MarkdownExit) {
      const ranges = new WeakMap<object, { source: string, offset: number }>()
      md.core.ruler.push('online_source_locations', (state) => {
        const offsets = [0]
        for (const line of state.src.split('\n'))
          offsets.push(offsets.at(-1)! + line.length + 1)
        for (const token of state.tokens) {
          if (!token.map)
            continue
          const offset = offsets[token.map[0]]
          const source = state.src.slice(offset, offsets[token.map[1]])
          ranges.set(token, { source, offset })
          if (token.children)
            ranges.set(token.children, { source, offset })
        }
      })
      const inline = md.renderer.renderInlineAsync.bind(md.renderer)
      md.renderer.renderInlineAsync = async (tokens, options, env) => {
        const rendered = await inline(tokens, options, env)
        const range = ranges.get(tokens)
        if (range)
          fragments.push({ rendered, ...range })
        return rendered
      }
      const html = md.renderer.rules.html_block!
      md.renderer.rules.html_block = async (...args) => {
        const rendered = await html(...args)
        const range = ranges.get(args[0][args[1]])
        if (range)
          fragments.push({ rendered, ...range })
        return rendered
      }
    },
    offset(sfc: string, generatedOffset: number): number | undefined {
      // Script and style bodies are hoisted intact, even though their tags change.
      const spans = fragments.flatMap((fragment) => {
        const blocks = [
          ...fragment.source.matchAll(/<(script|style)\b[^>]*>([\s\S]*?)<\/\1>/g),
        ]
          .filter(match => match[2].trim())
          .map(match => ({
            rendered: match[2],
            source: match[2],
            offset: fragment.offset + match.index! + match[0].indexOf('>') + 1,
          }))
        return [...blocks, fragment]
      }).sort((a, b) => a.offset - b.offset)
      const occurrences = new Map<string, number>()
      for (const span of spans) {
        if (!span.rendered)
          continue
        const start = sfc.indexOf(span.rendered, occurrences.get(span.rendered) ?? 0)
        if (start < 0)
          continue
        occurrences.set(span.rendered, start + span.rendered.length)
        const relative = generatedOffset - start
        if (relative < 0 || relative >= span.rendered.length)
          continue
        if (span.rendered === span.source)
          return span.offset + relative
        // Markdown adds tags and escapes text. Map only an unchanged, unique
        // neighbourhood; generated markup must never masquerade as source.
        for (let radius = 128; radius >= 1; radius = Math.floor(radius / 2)) {
          const left = Math.max(0, relative - radius)
          const text = span.rendered.slice(left, relative + radius)
          const original = span.source.indexOf(text)
          if (original >= 0 && !span.source.includes(text, original + 1))
            return span.offset + original + relative - left
        }
      }
    },
  }
}

/** Vue syntax errors carry offsets; macro errors carry a compiler code frame. */
export function compilerOffset(error: any, sfc: string, scriptStart = 0) {
  if (Number.isSafeInteger(error?.pos))
    return scriptStart + error.pos
  if (Number.isSafeInteger(error?.loc?.start?.offset))
    return error.loc.start.offset
  const frames = String(error?.message ?? error).matchAll(/(?:^|\n)[ \t]*(\d+)[ \t]*\| {2}([^\n]*)\n[ \t]*\| {2}( *)\^+/g)
  for (const frame of frames) {
    // Vue sometimes highlights the previous newline before the actual node.
    if (frame[3].length < frame[2].length)
      return offsetAt(sfc, Number(frame[1]), frame[3].length + 1)
  }
}
