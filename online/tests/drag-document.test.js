import assert from 'node:assert/strict'
import { it } from 'node:test'
// eslint-disable-next-line antfu/no-import-dist
import { applyDragPatches, parseDragPatch } from '../runtime/dist/editor/document.js'

function patch(range, extra = {}) {
  return {
    slide: 1,
    id: 'box',
    position: '120,140,180,80',
    source: 'prop',
    range,
    ...extra,
  }
}

it('updates only the selected drag attribute and preserves notes, scripts and CRLF/BOM', () => {
  const src = '\uFEFF# Boxes\r\n\r\n<VDrag pos="10,20,100,50">Box</VDrag>\r\n\r\n<script setup>const text = "pos"</script>\r\n\r\n<!-- notes -->\r\n'
  assert.equal(applyDragPatches(src, [
    patch([2, 3, 0]),
  ]), src.replace('10,20,100,50', '120,140,180,80'))
})

it('accumulates edits at original offsets, including repeated elements on the same line', () => {
  const tag = '<VDrag>Same</VDrag>'
  const src = `# Boxes\n\n${tag} ${tag}\n`
  assert.equal(applyDragPatches(src, [
    patch([2, 3, 0]),
    patch([2, 3, tag.length + 1], { position: '1,2,300,_' }),
  ]), '# Boxes\n\n<VDrag pos="120,140,180,80">Same</VDrag> <VDrag pos="1,2,300,_">Same</VDrag>\n')
})

it('updates multiline components, arrows and directives using their exact source positions', () => {
  const src = '# Objects\n\n<VDragArrow\n color="red>blue"\n pos=\'1,2,3,4\'\n/>\n\n<div v-drag="[1,2,3,NaN]">Text</div>\n'
  assert.equal(applyDragPatches(src, [
    patch([2, 6, 0]),
    patch([7, 8, 5], { source: 'directive', position: '[3,4,200,NaN,90]' }),
  ]), src.replace('pos=\'1,2,3,4\'', 'pos="120,140,180,80"').replace('[1,2,3,NaN]', '[3,4,200,NaN,90]'))
})

it('writes named positions to frontmatter while retaining comments and unrelated fields', () => {
  const src = '---\n# Keep this comment\ntheme: seriph\ndragPos:\n  box: 1,2,3,4\n  other: 5,6,7,8\n---\n\n# Boxes\n\n<VDrag pos="box">Box</VDrag>\n'
  const result = applyDragPatches(src, [
    patch([2, 3, 0], { source: 'frontmatter' }),
  ])
  assert.match(result, /# Keep this comment/)
  assert.match(result, /theme: seriph/)
  assert.match(result, /box: 120,140,180,80/)
  assert.match(result, /other: 5,6,7,8/)
  assert.ok(result.endsWith('# Boxes\n\n<VDrag pos="box">Box</VDrag>\n'))
})

it('adds missing named-position frontmatter without losing slide separators', () => {
  const src = '# Cover\n\n---\n\n# Boxes\n\n<VDrag pos="box">Box</VDrag>\n'
  const result = applyDragPatches(src, [
    patch([2, 3, 0], { slide: 2, source: 'frontmatter' }),
  ])
  assert.equal(result, '# Cover\n\n---\ndragPos:\n  box: 120,140,180,80\n---\n\n# Boxes\n\n<VDrag pos="box">Box</VDrag>\n')
})

it('uses visible slide numbering and supports YAML-fence frontmatter', () => {
  const src = '---\nhide: true\n---\n# Hidden\n\n---\n\n```yaml\ntheme: default\n```\n\n# Boxes\n\n<VDrag pos="1,2,3,4">Box</VDrag>\n'
  const result = applyDragPatches(src, [
    patch([2, 3, 0]),
  ])
  assert.equal(result, src.replace('1,2,3,4', '120,140,180,80'))
})

it('rejects forged, stale, overlapping and out-of-range drag updates without running text', () => {
  const src = '# Boxes\n\n<VDrag pos="1,2,3,4">Box</VDrag>'
  for (const update of [
    patch([2, 3, 0], { position: '1,2,3,alert(1)' }),
    patch([2, 3, 0], { position: '1,2,3,Infinity' }),
    patch([2, 3, 0], { position: '1,2,3,1000001' }),
    patch([2, 3, 0], { id: '__proto__' }),
    patch([2, 3, 0], { code: 'alert(1)' }),
    patch([2, 3, 0], { source: 'directive' }),
    patch([2, 3, 0], { source: 'frontmatter', id: 'other' }),
    patch([2, 3, 1]),
    patch([3, 4, 0]),
    patch([2, 2, 0]),
    patch([2, 3, -1]),
    patch([2, 3, 0], { slide: 2 }),
  ]) {
    assert.throws(() => applyDragPatches(src, [update]))
  }
  assert.throws(() => applyDragPatches(src, [
    patch([2, 3, 0]),
    patch([2, 3, 0]),
  ]), /Overlapping/)
  assert.throws(() => applyDragPatches('é'.repeat(3 * 1024 * 1024), []), /5 MiB/)
  assert.throws(() => applyDragPatches(src, Array.from({ length: 1025 }, () => patch([2, 3, 0]))), /Too many/)
  assert.deepEqual(parseDragPatch(patch([2, 3, 0])), patch([2, 3, 0]))
})

it('writes named positions into empty and fenced YAML blocks without creating slides', () => {
  const body = '# Boxes\n\n<VDrag pos="box">Box</VDrag>\n'
  const empty = applyDragPatches(`---\n---\n\n${body}`, [
    patch([2, 3, 0], { source: 'frontmatter' }),
  ])
  assert.equal(empty, `---\ndragPos:\n  box: 120,140,180,80\n---\n\n${body}`)
  const fenced = applyDragPatches(`\`\`\`yaml\ntheme: default\n\`\`\`\n\n${body}`, [
    patch([2, 3, 0], { source: 'frontmatter' }),
  ])
  assert.equal(fenced, `\`\`\`yaml\ntheme: default\ndragPos:\n  box: 120,140,180,80\n\`\`\`\n\n${body}`)
})

it('updates existing numeric YAML keys rather than adding a duplicate string key', () => {
  const src = '---\ndragPos:\n  1: 10,20,30,40 # keep this position\n---\n# Box\n\n<div v-drag="1">Box</div>\n'
  const result = applyDragPatches(src, [
    patch([2, 3, 5], { id: '1', source: 'frontmatter' }),
  ])
  assert.equal(result, src.replace('10,20,30,40', '120,140,180,80'))
})
