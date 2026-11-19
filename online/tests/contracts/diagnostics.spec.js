import { expect, test } from '@playwright/test'
import { adapter, ready } from '../../vendor/fragment-kit-v0.4.4/testing/contract/adapter.js'

const prefix = `---
hide: true
---
# Hidden cover

---

# First visible

---
disabled: true
---
# Disabled

---
layout: default
---


`

const cases = [
  {
    name: 'fenced YAML script',
    yaml: true,
    content: '# Script\n\n<script setup>\nconst broken = ;\n</script>',
    marker: ';',
    line: 'const broken = ;',
  },
  {
    name: 'script syntax',
    content: '# Script\n\n<script setup lang="ts">\nconst good: number = 1\nconst broken = ;\n</script>',
    marker: ';',
    line: 'const broken = ;',
  },
  {
    name: 'script macro',
    content: '# Macro\n\n<script setup>\ndefineProps({ first: String })\ndefineProps({ second: String })\n</script>',
    marker: 'defineProps',
    line: 'defineProps({ second: String })',
  },
  {
    name: 'template expression',
    content: '# Template\n\nSome text before the error.\n\n<p>{{ broken + }}</p>',
    marker: 'broken',
    line: '<p>{{ broken + }}</p>',
  },
  {
    name: 'inline expression',
    content: '# Inline\n\nSome text before the error.\n\nHello {{ broken + }}',
    marker: 'broken',
    line: 'Hello {{ broken + }}',
  },
  {
    name: 'title expression',
    content: '# Title {{ broken + }}\n\nBody',
    marker: 'broken',
    line: '# Title {{ broken + }}',
  },
  {
    name: 'HTML syntax',
    content: '# HTML\n\n<div><span>Missing close</div>',
    marker: '<span>',
    line: '<div><span>Missing close</div>',
  },
  {
    name: 'scoped style',
    content: '# Styles\n\n<style>\nh1 { color: red; }\np {\n</style>',
    marker: 'p {',
    line: 'p {',
  },
  {
    name: 'style with UnoCSS directives',
    content: '# Styles\n\n<style>\nh1 { @apply text-red; }\np {\n</style>',
    marker: 'p {',
    line: 'p {',
  },
]

const annotations = (page, file = 'markdown-editor') => page.evaluate(id => globalThis.ace.edit(id).session.getAnnotations(), file)

for (const fixture of cases) {
  test(`${fixture.name} diagnostics point into the original Markdown`, async ({ page }) => {
    await ready(page)
    const start = fixture.yaml
      ? prefix.replace('---\nlayout: default\n---', '---\n\n```yaml\nlayout: default\n```')
      : prefix
    const src = `\uFEFF${start}${fixture.content}\n<!-- speaker notes -->\n`.replaceAll('\n', '\r\n')
    const href = new URL(await adapter.build(page, { src }))
    href.searchParams.set('slide', '2')
    await ready(page, href.href)
    const lines = src.split('\r\n')
    const row = lines.indexOf(fixture.line)
    const column = fixture.line.indexOf(fixture.marker)
    await expect.poll(async () => (await annotations(page)).map(({ row, column }) => ({ row, column }))).toEqual([
      { row, column },
    ])
    await expect(page.locator('#preview-status')).toContainText(`slides.md:${row + 1}:${column + 1}:`)
    await expect(page.locator('#preview iframe')).toHaveCount(0)
    await expect.poll(() => annotations(page, 'css-editor')).toEqual([])
    // Correcting the source clears the stale diagnostic and creates a fresh frame.
    await adapter.edit(page, '# Corrected')
    await expect(page.frameLocator('#preview iframe').locator('h1')).toHaveText('Corrected')
    await expect.poll(() => annotations(page)).toEqual([])
  })
}

test('frontmatter diagnostics identify the YAML line, including fenced YAML', async ({ page }) => {
  await ready(page)
  for (const src of [
    '# First\n\n---\nlayout: default\nlayout: center\n---\n# Second',
    '# First\n\n---\n\n```yaml\nlayout: default\nlayout: center\n```\n# Second',
  ]) {
    await ready(page, await adapter.build(page, { src }))
    const row = src.split('\n').indexOf('layout: center')
    await expect.poll(async () => (await annotations(page)).map(({ row, column }) => ({ row, column }))).toEqual([
      { row, column: 0 },
    ])
    await expect(page.locator('#preview-status')).toContainText(`slides.md:${row + 1}:1:`)
  }
})

test('first-line diagnostics include a leading BOM column', async ({ page }) => {
  await ready(page)
  await ready(page, await adapter.build(page, { src: '\uFEFF# {{ broken + }}' }))
  await expect.poll(async () => (await annotations(page)).map(({ row, column }) => ({ row, column }))).toEqual([
    { row: 0, column: 6 },
  ])
})

test('a failed navigation annotates the destination slide rather than the last rendered slide', async ({ page }) => {
  await ready(page)
  await ready(page, await adapter.build(page, { src: '# First\n\n---\n\n# Second\n\n<script setup>\nconst broken = ;\n</script>' }))
  await expect(page.frameLocator('#preview iframe').locator('h1')).toHaveText('First')
  await page.locator('#next-slide').click()
  await expect.poll(async () => (await annotations(page)).map(({ row, column }) => ({ row, column }))).toEqual([
    { row: 7, column: 15 },
  ])
  await expect(page.locator('#preview-status')).toContainText('slides.md:8:16:')
})

test('global CSS diagnostics use the CSS session and clear on correction', async ({ page }) => {
  await ready(page)
  await ready(page, await adapter.build(page, {
    src: '# CSS',
    slidev: { css: 'h1 { color: red; }\n\np {' },
  }))
  await expect.poll(async () => (await annotations(page, 'css-editor')).map(({ row, column }) => ({ row, column }))).toEqual([
    { row: 2, column: 0 },
  ])
  await expect(page.locator('#preview-status')).toContainText('style.css:3:1:')
  expect(await annotations(page)).toEqual([])
  await page.evaluate(() => globalThis.ace.edit('css-editor').setValue('h1 { color: red; }', -1))
  await expect(page.frameLocator('#preview iframe').locator('h1')).toHaveText('CSS')
  await expect.poll(() => annotations(page, 'css-editor')).toEqual([])
})
