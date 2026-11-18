import MagicString from 'magic-string-stack'
import MarkdownExit from 'markdown-exit'
import { expect, it } from 'vitest'
import MarkdownItVDrag from './drag'

it('v-drag component', async () => {
  const md = MarkdownExit({ html: true })
  const map = new Map<string, MagicString>()
  md.use(MarkdownItVDrag, map)

  const result = await md.renderAsync('<v-drag>Content</v-drag>', { id: 'test' })

  expect(result).toMatchInlineSnapshot(`
    "<p><v-drag :markdownSource="[0,1,0]">Content</v-drag></p>
    "
  `)
})

it('v-drag directive', async () => {
  const md = MarkdownExit({ html: true })
  const map = new Map<string, MagicString>()
  md.use(MarkdownItVDrag, map)

  const result = await md.renderAsync('<div v-drag>Content</div>', { id: 'test' })

  expect(result).toMatchInlineSnapshot(`"<div v-drag :markdownSource="[0,1,5]">Content</div>"`)
})

it('keeps the v-drag source range when the block ends the slide', async () => {
  const md = MarkdownExit({ html: true })
  const map = new Map<string, MagicString>()
  md.use(MarkdownItVDrag, map)

  // No trailing newline: the exclusive end line of the last block is past the
  // last line the transform source map covers.
  const source = [
    '# Test',
    '',
    '<div',
    '  v-drag="[284, 248, 166, NaN]"',
    '>',
    '  V-drag element',
    '</div>',
  ].join('\n')
  const id = '/slides.md'
  map.set(id, new MagicString(source))

  const result = await md.renderAsync(source, { id })

  // [start, end, index]: end is exclusive and must include the closing tag,
  // not collapse to the line after `<div`.
  expect(result).toContain('v-drag="[284, 248, 166, NaN]" :markdownSource="[2,7,7]"')
})

it.each(['VDrag', 'VDragArrow'])('preserves source metadata for the PascalCase %s component', async (tag) => {
  const md = MarkdownExit({ html: true })
  md.use(MarkdownItVDrag, new Map<string, MagicString>())

  const result = await md.renderAsync(`<${tag} pos="1,2,3,4">Content</${tag}>`, { id: 'test' })

  expect(result).toContain(`<${tag} :markdownSource="[0,1,0]" pos="1,2,3,4">`)
})

it('keeps distinct offsets for repeated inline drag components and directives', async () => {
  const md = MarkdownExit({ html: true })
  md.use(MarkdownItVDrag, new Map<string, MagicString>())
  const source = '<VDrag>One</VDrag> <VDrag>Two</VDrag> <span v-drag="[1,2,3,4]">Three</span> <span v-drag>Four</span>'

  const result = await md.renderAsync(source, { id: 'test' })

  for (const [tag, index] of [
    ['<VDrag', 0],
    [
      '<VDrag',
      source.indexOf('<VDrag', 1),
    ],
    [
      'v-drag="[1,2,3,4]"',
      source.indexOf('v-drag'),
    ],
    [
      'v-drag',
      source.lastIndexOf('v-drag'),
    ],
  ] as const)
    expect(result).toContain(`${tag} :markdownSource="[0,1,${index}]"`)
})

it('keeps original offsets when a drag directive occurs inside a drag component', async () => {
  const md = MarkdownExit({ html: true })
  md.use(MarkdownItVDrag, new Map<string, MagicString>())
  const source = '<v-drag><div v-drag=\'[1,2,3,4]\'>Nested</div></v-drag>'

  const result = await md.renderAsync(source, { id: 'test' })

  expect(result).toContain('<v-drag :markdownSource="[0,1,0]">')
  expect(result).toContain(`v-drag='[1,2,3,4]' :markdownSource="[0,1,${source.indexOf('v-drag', 2)}]"`)
})
