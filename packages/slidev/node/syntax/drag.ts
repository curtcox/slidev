import type MagicString from 'magic-string-stack'
import type MarkdownExit from 'markdown-exit'
import { SourceMapConsumer } from 'source-map-js'

type Token = ReturnType<MarkdownExit['parseInline']>[number]

const dragComponentRegex = /<(v-?drag-?\w*)([\s>])/gi
const dragDirectiveRegex = /(?<![</\w])v-drag(?:\s*=\s*(?:"[^"]*"|'[^']*'))?(?=[\s/>]|$)/gi

export default function MarkdownItVDrag(md: MarkdownExit, markdownTransformMap: Map<string, MagicString>) {
  const visited = new WeakSet()
  const sourceMapConsumers = new WeakMap<MagicString, SourceMapConsumer>()

  function getSourceMapConsumer(id: string | undefined) {
    const s = id && markdownTransformMap.get(id)
    if (!s)
      return undefined
    let smc = sourceMapConsumers.get(s)
    if (smc)
      return smc
    const sourceMap = s.generateMap()
    smc = new SourceMapConsumer({
      ...sourceMap,
      version: sourceMap.version.toString(),
      sourcesContent: sourceMap.sourcesContent?.map(content => content ?? ''),
    })
    sourceMapConsumers.set(s, smc)
    return smc
  }

  const _parse = md.parse
  md.parse = function (src, env) {
    const smc = getSourceMapConsumer(env?.id)
    // A generated line past the file (the exclusive end of a block that ends
    // the slide) is unmapped. `null - 1` is -1, and `Math.max(start + 1, -1)`
    // then shrinks the range to a single line, so the write-back misses `v-drag`.
    const toOriginalPos = (line: number) => {
      if (!smc)
        return line
      const mapped = smc.originalPositionFor({ line: line + 1, column: 0 }).line
      return mapped == null || mapped <= 0
        ? null
        : mapped - 1
    }
    function toMarkdownSource(map: [number, number], idx: number) {
      const start = toOriginalPos(map[0]) ?? map[0]
      let end = toOriginalPos(map[1])
      if (end == null) {
        end = start + 1
        for (let line = map[1] - 1; line > map[0]; line--) {
          const mapped = toOriginalPos(line)
          if (mapped != null) {
            end = mapped + 1
            break
          }
        }
      }
      return `[${start},${Math.max(start + 1, end)},${idx}]`
    }

    function injectSources(content: string, map: [number, number], offset = 0) {
      const insertions: { index: number, value: string }[] = []
      content.replace(dragComponentRegex, (full, tag, _space, index) => {
        insertions.push({ index: index + tag.length + 1, value: ` :markdownSource="${toMarkdownSource(map, offset + index)}"` })
        return full
      })
      content.replace(dragDirectiveRegex, (full, index) => {
        insertions.push({ index: index + full.length, value: ` :markdownSource="${toMarkdownSource(map, offset + index)}"` })
        return full
      })
      // Derive every position from original text before adding any metadata.
      for (const { index, value } of insertions.sort((a, b) => b.index - a.index))
        content = content.slice(0, index) + value + content.slice(index)
      return content
    }

    function replaceChildren(token: Token, content: string, map: [number, number], offset = 0) {
      let cursor = 0
      for (const child of token.children ?? []) {
        const original = child.content
        const index = content.indexOf(original, cursor)
        if (index < 0)
          continue
        replaceChildren(child, original, map, offset + index)
        if (child.type === 'html_block' || child.type === 'html_inline')
          child.content = injectSources(original, map, offset + index)
        cursor = index + original.length
      }
    }

    return _parse.call(this, src, env)
      .map((token) => {
        if (!['html_block', 'html_inline', 'inline'].includes(token.type) || !token.content.toLowerCase().includes('drag') || visited.has(token))
          return token

        const original = token.content
        replaceChildren(token, original, token.map!)
        token.content = injectSources(original, token.map!)

        visited.add(token)
        return token
      })
  }
}
