import { componentPlugin } from '@mdit-vue/plugin-component'
import { compileScript, parse as parseSfc } from '@vue/compiler-sfc/dist/compiler-sfc.esm-browser.js'
import MarkdownExit from 'markdown-exit'
import * as Vue from 'vue'
import { createFixedClicks } from '../../../packages/client/composables/useClicks'
import { frontmatterToProps, useSlideContext } from '../../../packages/client/context'
import SlideWrapper from '../../../packages/client/internals/SlideWrapper.vue'
import Cover from '../../../packages/client/layouts/cover.vue'
import { parseSync } from '../../../packages/parser/src/core'

// All compilation and module evaluation below happens in the SDK's execution
// world. The parent only fetches bytes and posts Markdown as data.
const registry = {
  ...Vue,
  useSlideContext,
  frontmatterToProps,
  Cover,
}
const registryUrl = URL.createObjectURL(new Blob([
  `const registry = globalThis.__slidevOnlineSpike;
   ${Object.keys(registry).map(name => `export const ${name} = registry[${JSON.stringify(name)}];`).join('\n')}`,
], { type: 'text/javascript' }))
Object.defineProperty(globalThis, '__slidevOnlineSpike', { value: registry })

function compile(src: string, name: string) {
  const slide = parseSync(src, `${name}.md`).slides[0]
  if (!slide)
    throw new Error('No slides')
  let setup = ''
  const markdown = slide.content.replace(/<script setup[^>]*>([\s\S]*?)<\/script>/g, (_, body) => {
    setup += `\n${body}`
    return ''
  })
  const html = new MarkdownExit({ html: true }).use(componentPlugin).render(markdown)
  const sfc = `<template><Cover>${html}</Cover></template>
    <script setup>
    import { Cover, useSlideContext, frontmatterToProps } from '${registryUrl}'
    const { $slidev, $frontmatter, $clicksContext } = useSlideContext()
    $clicksContext.setup()
    ${setup}
    </script>`
  const { descriptor, errors } = parseSfc(sfc, { filename: `${name}.vue` })
  if (errors.length)
    throw errors[0]
  const compiled = compileScript(descriptor, { id: name, inlineTemplate: true })
  const code = compiled.content.replace(/from (["'])vue\1/g, `from '${registryUrl}'`)
  return { slide, code }
}

export function run() {
  addEventListener('message', async (event) => {
    if (event.data?.type !== 'spike:render')
      return
    const results = []
    for (const { name, src } of event.data.fixtures) {
      let stage = 'compile'
      let url: string | undefined
      try {
        const { slide, code } = compile(src, name)
        url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }))
        stage = 'import'
        const { default: component } = await import(/* @vite-ignore */ url)
        const route = {
          no: 1,
          component,
          meta: {
            slide: { ...slide, no: 1 },
          },
        }
        const clicksContext = createFixedClicks(route as any)
        const app = Vue.createApp({
          render: () => Vue.h(SlideWrapper, { route: route as any, clicksContext }),
        })
        stage = 'mount'
        app.mount('#app')
        results.push({ name, stage: 'mounted' })
        app.unmount()
      }
      catch (error) {
        results.push({
          name,
          stage,
          error: String(error),
        })
      }
      finally {
        if (url)
          URL.revokeObjectURL(url)
      }
    }
    postMessage({
      type: 'spike:result',
      report: {
        environment: {
          origin: globalThis.origin,
          document: typeof document,
          window: typeof window,
          worker: typeof WorkerGlobalScope !== 'undefined' && globalThis instanceof WorkerGlobalScope,
        },
        results,
      },
    })
  })
  postMessage({ type: 'spike:ready' })
}
