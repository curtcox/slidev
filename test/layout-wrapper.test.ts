import { compileScript, compileStyle, parse } from '@vue/compiler-sfc'
import { describe, expect, it } from 'vitest'
import { wrapSlideLayout } from '../packages/slidev/node/vite/layoutWrapperCore'

describe('layout wrapping compiler seam', () => {
  it.each([0, 3])('keeps authored bindings and scoped CSS compilable on slide index %s', (index) => {
    const source = `<template><div><h1>{{ count }}</h1></div></template>
<script setup lang="ts">
import { ref } from 'vue'
const count = ref<number>(42)
</script>
<style scoped>h1 { color: red }</style>`
    const { descriptor, errors } = parse(wrapSlideLayout(source, index, '/theme/cover.vue'))
    expect(errors).toEqual([])
    const compiled = compileScript(descriptor, { id: 'slide', inlineTemplate: true })
    expect(compiled.content).toContain('ref<number>(42)')
    expect(descriptor.template?.content).toContain(`_frontmatterToProps($frontmatter,${index})`)
    expect(descriptor.styles).toHaveLength(1)
    const style = compileStyle({ source: descriptor.styles[0].content, id: 'data-v-slide', scoped: true })
    expect(style.errors).toEqual([])
    expect(style.code).toContain('[data-v-slide]')
  })

  it('reports the slide number when the Markdown transform did not create setup', () => {
    expect(() => wrapSlideLayout('<template>broken</template>', 3, '/theme/default.vue'))
      .toThrow('slide 4')
  })
})
