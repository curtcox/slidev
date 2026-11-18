import type { ClicksContext, SlideRoute } from '@slidev/types'
import type { App, Component } from 'vue'
import { compileStyle } from '@vue/compiler-sfc/dist/compiler-sfc.esm-browser.js'
import MagicString from 'magic-string'
import * as Vue from 'vue'
import Arrow from '../../../packages/client/builtin/Arrow.vue'
import CodeBlockWrapper from '../../../packages/client/builtin/CodeBlockWrapper.vue'
import KaTexBlockWrapper from '../../../packages/client/builtin/KaTexBlockWrapper.vue'
import PoweredBySlidev from '../../../packages/client/builtin/PoweredBySlidev.vue'
import VAfter from '../../../packages/client/builtin/VAfter'
import VClick from '../../../packages/client/builtin/VClick'
import VClickGap from '../../../packages/client/builtin/VClickGap.vue'
import VClicks from '../../../packages/client/builtin/VClicks'
import Youtube from '../../../packages/client/builtin/Youtube.vue'
import { createFixedClicks } from '../../../packages/client/composables/useClicks'
import * as constants from '../../../packages/client/constants'
import * as context from '../../../packages/client/context'
import SlideWrapper from '../../../packages/client/internals/SlideWrapper.vue'
import { createVClickDirectives } from '../../../packages/client/modules/v-click'
import unoConfig from '../../../packages/client/uno.config'
import { createDeckCompiler } from './compiler'
import { rewriteModuleImports } from './compiler/modules'
import commonCss from './runtime.css?inline'
import { createGenerator, mergeConfigs } from './shims/uno'
import configs from './virtual/configs'

const layouts = import.meta.glob('../../../packages/client/layouts/*.vue', { eager: true, import: 'default' }) as Record<string, Component>
const layoutSources = import.meta.glob('../../../packages/client/layouts/*.vue', { eager: true, query: '?raw', import: 'default' })
const components = {
  Arrow,
  CodeBlockWrapper,
  KaTexBlockWrapper,
  PoweredBySlidev,
  VAfter,
  VClick,
  VClickGap,
  VClicks,
  Youtube,
}
const layoutByName = Object.fromEntries(Object.entries(layouts).map(([file, component]) => [
  file.split('/').at(-1)!.slice(0, -4),
  component,
]))

export interface RenderInput {
  src: string
  css: string
  slide: number
  click: number
  dark: boolean
}

export function createRenderer(report: (message: Record<string, unknown>) => void) {
  let app: App | undefined
  let compiler: Awaited<ReturnType<typeof createDeckCompiler>> | undefined
  let clicks: ClicksContext | undefined
  let position = 1
  let generation = 0
  let stylesheet: HTMLStyleElement | undefined
  let container: HTMLDivElement | undefined
  let urls: string[] = []
  const registryKey = `__slidevonline_${crypto.randomUUID().replaceAll('-', '')}`
  const registry: Record<string, Record<string, unknown>> = {}
  Object.defineProperty(globalThis, registryKey, { value: registry, configurable: true })

  function moduleUrl(name: string, exports: Record<string, unknown>) {
    registry[name] = exports
    const code = `const module = globalThis[${JSON.stringify(registryKey)}][${JSON.stringify(name)}];\n${Object.keys(exports).map(key => key === 'default'
      ? 'export default module.default;'
      : `export const ${key} = module[${JSON.stringify(key)}];`).join('\n')}`
    const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }))
    urls.push(url)
    return url
  }

  let modules: Record<string, string> = {}
  function resetModules() {
    for (const url of urls)
      URL.revokeObjectURL(url)
    urls = []
    modules = {
      'vue': moduleUrl('vue', Vue),
      '@slidev/client': moduleUrl('client', context),
      '@slidev/client/context': moduleUrl('context', context),
      '@slidev/client/constants': moduleUrl('constants', constants),
    }
    for (const [name, component] of Object.entries(layoutByName))
      modules[`online:layout/${name}`] = moduleUrl(`layout/${name}`, { default: component })
    for (const [name, component] of Object.entries(components))
      modules[`@slidev/client/builtin/${name}.vue`] = moduleUrl(`builtin/${name}`, { default: component })
  }

  function sendPosition() {
    report({ type: 'position', slide: position, click: clicks?.current ?? 0 })
  }

  async function goto(slide: number, click = 0) {
    if (!compiler)
      return
    const version = ++generation
    const index = Math.max(0, Math.min(compiler.slides.length - 1, slide - 1))
    const source = compiler.slides[index]
    const warnings: string[] = []
    const requestedLayout = source.frontmatter.layout || (index === 0
      ? 'cover'
      : 'default')
    const layout = Object.hasOwn(layoutByName, requestedLayout)
      ? requestedLayout
      : 'default'
    if (layout !== requestedLayout)
      warnings.push(`Layout ${requestedLayout} is unavailable; using default`)
    const compiled = await compiler.compile(index, `online:layout/${layout}`)
    warnings.push(...compiled.warnings)
    // Vue omits resolution warnings in production. Inspect only the compiler's
    // generated resolver calls so unsupported widgets always get a visible notice.
    const normalize = (name: string) => name.replaceAll('-', '').toLowerCase()
    const knownComponents = new Set(Object.keys(components).map(normalize))
    for (const [, name] of compiled.code.matchAll(/_resolveComponent\("([^"]+)"\)/g)) {
      if (!knownComponents.has(normalize(name)))
        warnings.push(`Component ${name} is unavailable online`)
    }
    for (const [, name] of compiled.code.matchAll(/_resolveDirective\("([^"]+)"\)/g)) {
      if (!['click', 'after'].includes(name))
        warnings.push(`Directive v-${name} is unavailable online`)
    }
    const code = await rewriteModuleImports(compiled.code, (specifier) => {
      const name = specifier.replace(/\/context\.ts$/, '/context').replace(/\/constants\.ts$/, '/constants')
      if (!Object.hasOwn(modules, name))
        throw new Error(`Module ${specifier} is unavailable online; only bundled modules can be imported`)
      return modules[name]
    })
    const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }))
    let component: any
    try {
      component = (await import(/* @vite-ignore */ url)).default
    }
    finally {
      URL.revokeObjectURL(url)
    }
    if (generation !== version)
      return
    component.__scopeId = compiled.scopeId
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
    const apply = unoConfig.transformers!.find(transformer => transformer.name.includes('directives'))!
    const styles: string[] = []
    for (const style of [
      { content: commonCss, scoped: false },
      ...compiled.styles,
    ]) {
      const text = new MagicString(style.content)
      await apply.transform(text, 'slide.css', { uno } as any)
      const result = compileStyle({
        source: text.toString(),
        id: compiled.scopeId,
        scoped: style.scoped,
        filename: `slide-${index + 1}.css`,
      })
      if (result.errors.length)
        throw result.errors[0]
      styles.push(result.code)
    }
    styles.push((await uno.generate(`${compiled.sfc}\n${JSON.stringify(source.frontmatter)}\n${Object.values(layoutSources).join('\n')}`)).css)
    if (generation !== version)
      return
    app?.unmount()
    container?.remove()
    stylesheet?.remove()
    stylesheet = document.createElement('style')
    stylesheet.textContent = styles.join('\n')
    document.head.insertBefore(stylesheet, document.querySelector('#online-document-css'))
    container = document.createElement('div')
    container.id = 'app'
    container.style.width = `${configs.canvasWidth}px`
    container.style.height = `${Math.ceil(configs.canvasWidth / configs.aspectRatio)}px`
    document.body.prepend(container)
    const route = {
      no: index + 1,
      component: Vue.markRaw(component),
      meta: {
        slide: { ...source, no: index + 1 },
      },
    } as unknown as SlideRoute
    clicks = createFixedClicks(route, click)
    position = index + 1
    app = Vue.createApp({
      render: () => Vue.h(SlideWrapper, { route, clicksContext: clicks! }),
    })
    app.use(createVClickDirectives())
    for (const [name, component] of Object.entries(components))
      app.component(name, component)
    app.provide(constants.injectionSlidevContext, Vue.reactive({
      configs,
      nav: {
        next,
        prev,
        go: goto,
        openInEditor() {},
      },
    }) as any)
    app.config.warnHandler = (warning) => {
      if (/Failed to resolve (?:component|directive)/.test(warning))
        warnings.push(warning.split('\n')[0])
    }
    app.config.errorHandler = error => report({
      type: 'error',
      slide: position,
      message: String(error).slice(0, 2000),
    })
    app.mount(container)
    await Vue.nextTick()
    document.querySelector('#online-notices')?.remove()
    if (warnings.length) {
      const notice = document.createElement('aside')
      notice.id = 'online-notices'
      notice.setAttribute('role', 'status')
      notice.textContent = [
        ...new Set(warnings),
      ].join('\n')
      document.body.append(notice)
    }
    resize()
    sendPosition()
    return warnings
  }

  async function next() {
    if (!compiler || !clicks)
      return
    if (clicks.current < clicks.total) {
      clicks.current++
      sendPosition()
    }
    else if (position < compiler.slides.length) {
      await goto(position + 1)
    }
  }

  async function prev() {
    if (!clicks)
      return
    if (clicks.current > clicks.clicksStart) {
      clicks.current--
      sendPosition()
    }
    else if (position > 1) {
      await goto(position - 1, 999999)
    }
  }

  function resize() {
    if (!container)
      return
    const height = Math.ceil(configs.canvasWidth / configs.aspectRatio)
    const scale = Math.min(innerWidth / configs.canvasWidth, innerHeight / height)
    container.style.transform = `translate(-50%, -50%) scale(${scale})`
    container.style.setProperty('--slidev-slide-container-scale', String(scale))
  }

  return {
    goto,
    next,
    prev,
    resize,
    async render(input: RenderInput) {
      generation++
      app?.unmount()
      app = undefined
      compiler = await createDeckCompiler(input.src)
      Object.assign(configs, compiler.config)
      resetModules()
      document.documentElement.classList.toggle('dark', input.dark)
      document.querySelector('#online-document-css')?.remove()
      const style = document.createElement('style')
      style.id = 'online-document-css'
      style.textContent = input.css
      document.head.append(style)
      const warnings = await goto(input.slide, input.click)
      report({
        type: 'rendered',
        slides: compiler.slides.length,
        errors: [],
        warnings,
        origin: globalThis.origin,
      })
    },
  }
}
