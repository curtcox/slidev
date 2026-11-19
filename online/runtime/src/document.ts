import { Document, isMap, isScalar } from 'yaml'
import { parseSync } from '../../../packages/parser/src/core'

const MAX_BYTES = 5 * 1024 * 1024

/** AI validation is parse-only, including YAML on hidden slides. */
export function validateDeckSource(src: string) {
  if (typeof src !== 'string' || src.length > MAX_BYTES || new TextEncoder().encode(src).byteLength > MAX_BYTES)
    throw new Error('The Markdown exceeds the 5 MiB limit')
  const { slides } = parseSync(src, 'slides.md')
  for (const slide of slides) {
    if (slide.frontmatterDoc?.errors.length)
      throw new Error(`Slide ${slide.index + 1}: ${slide.frontmatterDoc.errors[0].message}`)
  }
  if (!slides.some(slide => !slide.frontmatter.disabled && !slide.frontmatter.hide && slide.content.trim()))
    throw new Error('The deck must contain at least one visible slide')
  if (slides.length > 10000)
    throw new Error('The deck exceeds the 10,000 slide limit')
  return true
}

/** Parse-only metadata for editor navigation. Author code is never evaluated. */
export function inspectDocument(src: string) {
  if (typeof src !== 'string' || src.length > MAX_BYTES || new TextEncoder().encode(src).byteLength > MAX_BYTES)
    throw new Error('The Markdown exceeds the 5 MiB limit')
  return parseSync(src, 'slides.md').slides.filter(slide => !slide.frontmatter.disabled && !slide.frontmatter.hide).map(slide => ({
    start: slide.start,
    end: slide.end,
    contentStart: slide.contentStart,
    title: String(slide.title ?? ''),
    note: slide.note ?? '',
  }))
}

export interface DragPatch {
  slide: number
  id: string
  position: string
  source: 'prop' | 'directive' | 'frontmatter'
  range: [number, number, number]
}

export function parseDragPatch(value: unknown): DragPatch {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid drag update')
  const data = value as DragPatch
  if (Object.keys(data).some(key => ![
    'slide',
    'id',
    'position',
    'source',
    'range',
  ].includes(key))
  || !Number.isSafeInteger(data.slide) || data.slide < 1 || data.slide > 10000
  || typeof data.id !== 'string' || !/^[\w-]{1,128}$/.test(data.id)
  || ['__proto__', 'constructor', 'prototype'].includes(data.id)
  || !['prop', 'directive', 'frontmatter'].includes(data.source)
  || typeof data.position !== 'string' || data.position.length > 128
  || !Array.isArray(data.range) || data.range.length !== 3
  || data.range.some(n => !Number.isSafeInteger(n) || n < 0 || n > MAX_BYTES)
  || data.range[0] >= data.range[1]) {
    throw new Error('Invalid drag update fields')
  }
  const bracketed = data.position.startsWith('[') && data.position.endsWith(']')
  if ((data.source === 'directive') !== bracketed)
    throw new Error('Invalid drag position syntax')
  const numbers = (bracketed
    ? data.position.slice(1, -1)
    : data.position).split(',')
  if (numbers.length < 4 || numbers.length > 5 || numbers.some((part, index) => {
    if (index === 3 && part === (bracketed ? 'NaN' : '_'))
      return false
    return !/^-?\d+$/.test(part) || Math.abs(Number(part)) > 1000000
  })) {
    throw new Error('Invalid drag position coordinates')
  }
  return {
    slide: data.slide,
    id: data.id,
    position: data.position,
    source: data.source,
    range: [...data.range],
  }
}

export function dragPatchKey(patch: DragPatch) {
  return `${patch.slide}:${patch.source}:${patch.range.join(',')}`
}

/** Rebuild from the render snapshot so changing one attribute cannot shift another. */
export function applyDragPatches(src: string, updates: unknown[]) {
  if (typeof src !== 'string' || src.length > MAX_BYTES || new TextEncoder().encode(src).byteLength > MAX_BYTES)
    throw new Error('The document exceeds the 5 MiB limit')
  if (!Array.isArray(updates) || updates.length > 1024)
    throw new Error('Too many drag updates; render again to continue')
  const crlf = src.includes('\r\n')
  const bom = src.startsWith('\uFEFF')
    ? '\uFEFF'
    : ''
  const text = src.slice(bom.length).replaceAll('\r\n', '\n')
  const lines = text.split('\n')
  const offsets = [0]
  for (const line of lines)
    offsets.push(offsets.at(-1)! + line.length + 1)
  const slides = parseSync(text, 'slides.md').slides.filter(slide => !slide.frontmatter.disabled && !slide.frontmatter.hide)
  const edits: { start: number, end: number, value: string }[] = []
  const frontmatter = new Map<number, Map<string, string>>()
  for (const update of updates) {
    const patch = parseDragPatch(update)
    const slide = slides[patch.slide - 1]
    if (!slide || slide.frontmatterDoc?.errors.length)
      throw new Error('The drag source slide is unavailable')
    const [start, end, index] = patch.range
    const contentLines = slide.content.split('\n')
    if (end > contentLines.length)
      throw new Error('The drag source range is unavailable')
    const section = contentLines.slice(start, end).join('\n')
    if (index >= section.length)
      throw new Error('The drag source element is unavailable')
    const tail = section.slice(index)
    let startOffset = contentLines.slice(0, start).reduce((sum, line) => sum + line.length + 1, 0) + index
    let endOffset = startOffset
    let value = patch.position
    let named: string | undefined
    if (patch.source === 'directive' || (patch.source === 'frontmatter' && tail.startsWith('v-drag'))) {
      const match = tail.match(/^v-drag(?:\s*=\s*("[^"]*"|'[^']*'))?(?=[\s/>])|^v-drag$/)
      if (!match)
        throw new Error('The drag directive is unavailable at its source position')
      endOffset += match[0].length
      if (patch.source === 'frontmatter')
        named = match[1]?.slice(1, -1).replace(/^(['"])(.*)\1$/, '$2')
      value = `v-drag="${patch.position}"`
    }
    else {
      const tag = tail.match(/^<v-?drag(?:-?arrow)?(?=[\s/>])/i)
      if (!tag)
        throw new Error('The drag component is unavailable at its source position')
      // Scan quoted attributes, including '>' inside an attribute value.
      let quote = ''
      let close = tag[0].length
      for (; close < tail.length; close++) {
        const c = tail[close]
        if (quote) {
          if (c === quote)
            quote = ''
        }
        else if (c === '"' || c === '\'') {
          quote = c
        }
        else if (c === '>') {
          break
        }
      }
      if (close === tail.length)
        throw new Error('The drag component has no closing bracket')
      const attrs = tail.slice(tag[0].length, close)
      const pos = /\s(?:pos|:pos|v-bind:pos)\s*=\s*("[^"]*"|'[^']*')/.exec(attrs)
      if (pos) {
        startOffset += tag[0].length + pos.index
        endOffset = startOffset + pos[0].length
        named = pos[1].slice(1, -1)
        value = ` pos="${patch.position}"`
      }
      else {
        startOffset += close - (tail[close - 1] === '/'
          ? 1
          : 0)
        endOffset = startOffset
        value = ` pos="${patch.position}"`
      }
    }
    if (patch.source === 'frontmatter') {
      if (named !== patch.id)
        throw new Error('The named drag position does not match its source')
      const positions = frontmatter.get(patch.slide) ?? new Map<string, string>()
      positions.set(patch.id, patch.position)
      frontmatter.set(patch.slide, positions)
      continue
    }
    let min = offsets[slide.contentStart] - offsets[slide.start]
    if (slide.frontmatterStyle === 'yaml') {
      const fence = /^\s*```ya?ml[\s\S]*?```/.exec(slide.raw)
      min = fence?.[0].length ?? min
    }
    const contentStart = slide.raw.indexOf(slide.content, min)
    if (contentStart < 0)
      throw new Error('The drag source content is unavailable')
    const base = offsets[slide.start] + contentStart
    edits.push({ start: base + startOffset, end: base + endOffset, value })
  }
  for (const [no, positions] of frontmatter) {
    const slide = slides[no - 1]
    const doc = slide.frontmatterDoc ?? new Document()
    const stored = doc.get('dragPos', true)
    for (const [id, position] of positions) {
      // YAML scalar keys may be numeric even though JavaScript object keys
      // (and the runtime's drag IDs) are strings. Preserve the existing key.
      const existing = isMap(stored) && stored.items.find(pair => isScalar(pair.key) && String(pair.key.value) === id)
      if (existing && isMap(stored))
        stored.set(existing.key, position)
      else
        doc.setIn(['dragPos', id], position)
    }
    const yaml = doc.toString().trimEnd()
    const rawStart = offsets[slide.start]
    if (!slide.frontmatterStyle) {
      const prefix = slide.start === 0
        ? '---\n'
        : ''
      edits.push({ start: rawStart, end: rawStart, value: `${prefix}${yaml}\n---\n` })
      continue
    }
    const prefix = slide.frontmatterStyle === 'yaml'
      ? /^\s*```ya?ml/.exec(slide.raw)?.[0]
      : slide.raw.slice(0, slide.raw.indexOf('\n') + 1)
    if (!prefix)
      throw new Error('The drag frontmatter source is unavailable')
    const frontmatterStart = rawStart + prefix.length
    edits.push({
      start: frontmatterStart,
      end: frontmatterStart + (slide.frontmatterRaw?.length ?? 0),
      value: `${slide.frontmatterStyle === 'yaml'
        ? '\n'
        : ''}${yaml}\n`,
    })
  }
  edits.sort((a, b) => b.start - a.start)
  let result = text
  let boundary = text.length + 1
  for (const edit of edits) {
    if (edit.end > boundary)
      throw new Error('Overlapping drag updates are not allowed')
    result = result.slice(0, edit.start) + edit.value + result.slice(edit.end)
    boundary = edit.start
  }
  result = bom + (crlf
    ? result.replaceAll('\n', '\r\n')
    : result)
  if (new TextEncoder().encode(result).byteLength > MAX_BYTES)
    throw new Error('The updated document exceeds the 5 MiB limit')
  return result
}
