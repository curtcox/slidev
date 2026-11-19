import assert from 'node:assert/strict'
import { it } from 'node:test'
// eslint-disable-next-line antfu/no-import-dist
import { inspectDocument } from '../runtime/dist/editor/document.js'

it('uses Slidev boundaries and extracts notes as inert text for editor navigation', () => {
  const src = '\uFEFF---\r\ntheme: default\r\n---\r\n# First\r\n```md\r\n---\r\n```\r\n<!-- <script>throw 1</script> -->\r\n---\r\nlayout: center\r\n---\r\n# Second\r\n'
  assert.deepEqual(inspectDocument(src), [
    {
      start: 0,
      end: 8,
      contentStart: 3,
      title: 'First',
      note: '<script>throw 1</script>',
    },
    {
      start: 8,
      end: 13,
      contentStart: 11,
      title: 'Second',
      note: '',
    },
  ])
})

it('bounds metadata input before parsing it', () => {
  assert.throws(() => inspectDocument('x'.repeat(5 * 1024 * 1024 + 1)), /5 MiB/)
  assert.throws(() => inspectDocument('🌍'.repeat(1400000)), /5 MiB/)
})

it('editor numbering excludes hidden and disabled slides like the runtime', () => {
  const slides = inspectDocument('# Visible\n\n---\nhide: true\n---\n# Hidden\n\n---\ndisabled: true\n---\n# Disabled\n\n---\n\n# Last\n')
  assert.deepEqual(slides.map(slide => slide.title), ['Visible', 'Last'])
  assert.equal(slides[1].start, 13)
})
