import { componentPlugin } from '@mdit-vue/plugin-component'
import { fromAsyncCodeToHtml } from '@shikijs/markdown-it/async'
import DefaultCover from '@slidev/theme-default/layouts/cover.vue'
import defaultCss from '@slidev/theme-default/styles/layouts.css?inline'
import SeriphCover from '@slidev/theme-seriph/layouts/cover.vue'
import seriphCss from '@slidev/theme-seriph/styles/layouts.css?inline'
import { compileScript, compileStyle, parse as parseSfc } from '@vue/compiler-sfc/dist/compiler-sfc.esm-browser.js'
import MagicString from 'magic-string'
import MarkdownExit from 'markdown-exit'
import { createHighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import { createGenerator, mergeConfigs } from 'unocss'
import * as Vue from 'vue'
import ArrowRight from '~icons/carbon/arrow-right'
import Edit from '~icons/carbon/edit'
import Github from '~icons/carbon/logo-github'
import CodeBlockWrapper from '../../../packages/client/builtin/CodeBlockWrapper.vue'
import PoweredBySlidev from '../../../packages/client/builtin/PoweredBySlidev.vue'
import { createFixedClicks } from '../../../packages/client/composables/useClicks'
import { injectionSlidevContext } from '../../../packages/client/constants'
import { frontmatterToProps, useSlideContext } from '../../../packages/client/context'
import SlideWrapper from '../../../packages/client/internals/SlideWrapper.vue'
import Center from '../../../packages/client/layouts/center.vue'
import Default from '../../../packages/client/layouts/default.vue'
import { createVClickDirectives } from '../../../packages/client/modules/v-click'
import unoConfig from '../../../packages/client/uno.config'
import { resolveConfig } from '../../../packages/parser/src/config'
import { parseSync } from '../../../packages/parser/src/core'
import wrapCode from '../../../packages/slidev/node/syntax/codeblock/wrapper'
import escapeCode from '../../../packages/slidev/node/syntax/escape-code'
import link from '../../../packages/slidev/node/syntax/link'
import configs from './configs'
import commonCss from './fidelity.css?inline'
import 'uno.css'

const registry = {
  ...Vue,
  DefaultCover,
  SeriphCover,
  Default,
  Center,
  useSlideContext,
  frontmatterToProps,
}
Object.defineProperty(globalThis, '__slidevOnlineFidelity', { value: registry })
const registryUrl = URL.createObjectURL(new Blob([
  `const registry = globalThis.__slidevOnlineFidelity;
  ${Object.keys(registry).map(key => `export const ${key} = registry[${JSON.stringify(key)}];`).join('\n')}`,
], { type: 'text/javascript' }))

const shiki = createHighlighterCore({
  engine: createJavaScriptRegexEngine(),
  themes: [import('@shikijs/themes/vitesse-light'), import('@shikijs/themes/vitesse-dark')],
  langs: [import('@shikijs/langs/yaml')],
})
let activeApp: Vue.App | undefined
let activeModule: string | undefined

export async function render(src: string, index = 0, utilities = '') {
  const started = performance.now()
  activeApp?.unmount()
  if (activeModule)
    URL.revokeObjectURL(activeModule)
  const deck = parseSync(src, 'slides.md')
  const slide = deck.slides[index]
  if (!slide)
    throw new Error(`Missing slide ${index + 1}`)
  Object.assign(configs, resolveConfig(deck.slides[0].frontmatter))
  const uno = await createGenerator(mergeConfigs([
    unoConfig,
    {
      theme: {
        fontFamily: {
          sans: configs.fonts.sans.join(','),
          serif: configs.fonts.serif.join(','),
          mono: configs.fonts.mono.join(','),
        },
      },
    },
  ]))
  const md = new MarkdownExit({
    html: true,
    linkify: true,
    xhtmlOut: true,
    typographer: true,
    quotes: '\"\"\'\'',
  })
    .use(componentPlugin)
    .use(escapeCode)
    .use(link)
  md.use(await fromAsyncCodeToHtml((await shiki).codeToHtml, {
    themes: { light: 'vitesse-light', dark: 'vitesse-dark' },
    defaultColor: false,
    transformers: [
      {
        pre(node) {
          this.addClassToHast(node, 'slidev-code')
          delete node.properties.tabindex
        },
      },
    ],
  }))
  const oldFence = md.renderer.rules.fence!
  md.renderer.rules.fence = async (tokens, idx, options, env, self) => wrapCode({
    info: tokens[idx].info.trim(),
    code: tokens[idx].content,
    renderHighlighted(override: any) {
      tokens[idx].info = override.info
      return oldFence(tokens, idx, options, env, self)
    },
  } as any)
  const styles: string[] = []
  let setup = ''
  const source = slide.content
    .replace(/<script setup[^>]*>([\s\S]*?)<\/script>/g, (_, body) => {
      setup += body
      return ''
    })
    .replace(/<style[^>]*>([\s\S]*?)<\/style>/g, (_, body) => {
      styles.push(body)
      return ''
    })
  const html = await md.renderAsync(source)
  const layout = slide.frontmatter.layout || (index === 0
    ? 'cover'
    : 'default')
  const selected = layout === 'cover'
    ? configs.theme === 'seriph'
      ? 'SeriphCover'
      : 'DefaultCover'
    : layout === 'center'
      ? 'Center'
      : 'Default'
  const sfc = `<template><InjectedLayout v-bind="frontmatterToProps($frontmatter, ${index})">${html}</InjectedLayout></template>
  <script setup>
  import { ${selected} as InjectedLayout, useSlideContext, frontmatterToProps } from '${registryUrl}'
  const { $slidev, $frontmatter, $clicksContext } = useSlideContext()
  $clicksContext.setup()
  ${setup}
  </script>`
  const { descriptor, errors } = parseSfc(sfc, { filename: `slide-${index}.vue` })
  if (errors.length)
    throw errors[0]
  const id = `fidelity-${index}`
  const compiled = compileScript(descriptor, { id, inlineTemplate: true })
  const module = compiled.content.replace(/from (["'])vue\1/g, `from '${registryUrl}'`)
  activeModule = URL.createObjectURL(new Blob([module], { type: 'text/javascript' }))
  const { default: component } = await import(/* @vite-ignore */ activeModule)
  component.__scopeId = `data-v-${id}`
  const scoped: string[] = []
  for (const style of styles) {
    const code = new MagicString(style)
    const transformer = unoConfig.transformers!.find(transform => transform.name.includes('directives'))!
    await transformer.transform(code, 'slide.css', { uno } as any)
    const compiledStyle = compileStyle({
      source: code.toString(),
      filename: 'slide.css',
      id: `data-v-${id}`,
      scoped: true,
    })
    if (compiledStyle.errors.length)
      throw compiledStyle.errors[0]
    scoped.push(compiledStyle.code)
  }
  document.head.querySelector('#deck-style')?.remove()
  const style = document.createElement('style')
  style.id = 'deck-style'
  const themeStyle = new MagicString([
    commonCss,
    configs.theme === 'seriph'
      ? seriphCss
      : defaultCss,
  ].join('\n'))
  await unoConfig.transformers!.find(transform => transform.name.includes('directives'))!.transform(themeStyle, 'theme.css', { uno } as any)
  if (themeStyle.toString().includes('@apply'))
    throw new Error('Uncompiled theme CSS directives')
  style.textContent = [
    themeStyle.toString(),
    utilities,
    (await uno.generate(`${sfc}\n${JSON.stringify(slide.frontmatter)}`)).css,
    ...scoped,
    'html, body, #app { width: 980px; height: 552px; } .slidev-page { height: 552px; --slidev-slide-scale: 1; }',
  ].join('\n')
  document.head.append(style)
  document.body.replaceChildren()
  const container = document.createElement('div')
  container.id = 'app'
  document.body.append(container)
  const route = {
    no: index + 1,
    component: Vue.markRaw(component),
    meta: {
      slide: { ...slide, no: index + 1 },
    },
  }
  const app = Vue.createApp({
    render: () => Vue.h(SlideWrapper, {
      route: route as any,
      clicksContext: createFixedClicks(route as any),
      renderContext: 'export',
    }),
  })
  app.use(createVClickDirectives())
  for (const [name, component] of Object.entries({
    'CodeBlockWrapper': CodeBlockWrapper,
    'PoweredBySlidev': PoweredBySlidev,
    'carbon:arrow-right': ArrowRight,
    'carbon:edit': Edit,
    'carbon:logo-github': Github,
  })) app.component(name, component)
  app.provide(injectionSlidevContext, Vue.reactive({
    nav: {
      next() {},
      openInEditor() {},
    },
  }) as any)
  app.config.errorHandler = (error) => {
    throw error
  }
  app.mount(container)
  activeApp = app
  await Vue.nextTick()
  await document.fonts.ready
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  let serviceWorkerControlled = false
  try {
    serviceWorkerControlled = Boolean(navigator.serviceWorker?.controller)
  }
  catch { /* Opaque frames cannot access a service worker. */ }
  return {
    index,
    origin: globalThis.origin,
    text: container.textContent,
    elapsedMs: performance.now() - started,
    serviceWorkerControlled,
  }
}

export function run() {
  addEventListener('message', async (event) => {
    if (event.data?.type !== 'fidelity:render')
      return
    try {
      const result = await render(event.data.src, event.data.index, event.data.css)
      postMessage({ type: 'fidelity:rendered', ...result })
    }
    catch (error) {
      postMessage({
        type: 'fidelity:error',
        error: String(error),
      })
    }
  })
  postMessage({ type: 'fidelity:ready' })
}
