import type { ClicksContext, SlideRoute } from '@slidev/types'
import type { App, Component } from 'vue'
import { compileStyle } from '@vue/compiler-sfc/dist/compiler-sfc.esm-browser.js'
import MagicString from 'magic-string'
import * as Vue from 'vue'
import Arrow from '../../../packages/client/builtin/Arrow.vue'
import AutoFitText from '../../../packages/client/builtin/AutoFitText.vue'
import CodeBlockWrapper from '../../../packages/client/builtin/CodeBlockWrapper.vue'
import CodeGroup from '../../../packages/client/builtin/CodeGroup.vue'
import KaTexBlockWrapper from '../../../packages/client/builtin/KaTexBlockWrapper.vue'
import LightOrDark from '../../../packages/client/builtin/LightOrDark.vue'
import Link from '../../../packages/client/builtin/Link.vue'
import Mermaid from '../../../packages/client/builtin/Mermaid.vue'
import PoweredBySlidev from '../../../packages/client/builtin/PoweredBySlidev.vue'
import RenderWhen from '../../../packages/client/builtin/RenderWhen.vue'
import ShikiMagicMove from '../../../packages/client/builtin/ShikiMagicMove.vue'
import SlideCurrentNo from '../../../packages/client/builtin/SlideCurrentNo.vue'
import SlidesTotal from '../../../packages/client/builtin/SlidesTotal.vue'
import Toc from '../../../packages/client/builtin/Toc.vue'
import TocList from '../../../packages/client/builtin/TocList.vue'
import Transform from '../../../packages/client/builtin/Transform.vue'
import VAfter from '../../../packages/client/builtin/VAfter'
import VClick from '../../../packages/client/builtin/VClick'
import VClickGap from '../../../packages/client/builtin/VClickGap.vue'
import VClicks from '../../../packages/client/builtin/VClicks'
import VDrag from '../../../packages/client/builtin/VDrag.vue'
import VDragArrow from '../../../packages/client/builtin/VDragArrow.vue'
import Youtube from '../../../packages/client/builtin/Youtube.vue'
import { createFixedClicks } from '../../../packages/client/composables/useClicks'
import { useDarkMode } from '../../../packages/client/composables/useDarkMode'
import * as constants from '../../../packages/client/constants'
import * as context from '../../../packages/client/context'
import * as env from '../../../packages/client/env'
import DragControl from '../../../packages/client/internals/DragControl.vue'
import SlideWrapper from '../../../packages/client/internals/SlideWrapper.vue'
import * as layoutHelper from '../../../packages/client/layoutHelper'
import * as slideLogic from '../../../packages/client/logic/slides'
import { createVClickDirectives } from '../../../packages/client/modules/v-click'
import { createVDragDirective } from '../../../packages/client/modules/v-drag'
import { createVMarkDirective } from '../../../packages/client/modules/v-mark'
import { createVMotionDirectives } from '../../../packages/client/modules/v-motion'
import unoConfig from '../../../packages/client/uno.config'
import { createDeckCompiler } from './compiler'
import { rewriteModuleImports } from './compiler/modules'
import { configureDragUpdates, flushDragUpdates } from './drag'
import { resolveIcon } from './icons'
import { loadMathStyles } from './math'
import { createNavigation, useNav } from './navigation'
import { plantUmlPermission } from './plant-uml'
import PlantUml from './PlantUml.vue'
import RouterLink from './RouterLink.vue'
import commonCss from './runtime.css?inline'
import { isDark } from './shims/dark'
import { activeDragElement } from './shims/drag-state'
import { createGenerator, mergeConfigs } from './shims/uno'
import configs from './virtual/configs'
import { slides } from './virtual/slides'
import TitleRenderer, { titleRenderer } from './virtual/title-renderer'

const layouts = import.meta.glob('../../../packages/client/layouts/*.vue', { eager: true, import: 'default' }) as Record<string, Component>
const layoutSources = import.meta.glob('../../../packages/client/layouts/*.vue', { eager: true, query: '?raw', import: 'default' })
const dragComponentSources = import.meta.glob('../../../packages/client/builtin/{Arrow,VDrag,VDragArrow}.vue', { eager: true, query: '?raw', import: 'default' })
const dragControlSource = import.meta.glob('../../../packages/client/internals/DragControl.vue', { eager: true, query: '?raw', import: 'default' })
const directiveSources = import.meta.glob('../../../packages/client/modules/v-{drag,mark,motion}.ts', { eager: true, query: '?raw', import: 'default' })
const components = {
  Arrow,
  AutoFitText,
  CodeGroup,
  LightOrDark,
  Link,
  Mermaid,
  PlantUml,
  OnlinePlantUml: PlantUml,
  RenderWhen,
  RouterLink,
  ShikiMagicMove,
  SlideCurrentNo,
  SlidesTotal,
  Toc,
  TocList,
  Transform,
  CodeBlockWrapper,
  KaTexBlockWrapper,
  PoweredBySlidev,
  VAfter,
  VClick,
  VClickGap,
  VClicks,
  VDrag,
  VDragArrow,
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
  const clicks = Vue.shallowRef<ClicksContext>()
  const position = Vue.ref(1)
  const navigation = createNavigation(position, clicks, goto, next, prev)
  const scale = Vue.shallowRef(1)
  const plantUmlAllowed = Vue.ref(false)
  let generation = 0
  let stylesheet: HTMLStyleElement | undefined
  let container: HTMLDivElement | undefined
  let urls: string[] = []
  const iconComponents = new Map<string, Component>()
  const iconImportWarnings = new Map<string, string>()
  let titleWarnings: string[] = []
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
  let activeLayouts = layoutByName
  function resetModules() {
    iconImportWarnings.clear()
    for (const url of urls)
      URL.revokeObjectURL(url)
    urls = []
    modules = {
      'vue': moduleUrl('vue', Vue),
      '@slidev/client': moduleUrl('client', {
        ...context,
        ...env,
        ...layoutHelper,
        ...slideLogic,
        useNav,
        useDarkMode,
      }),
      '@slidev/client/composables/useNav': moduleUrl('useNav', { useNav }),
      '@slidev/client/composables/useDarkMode': moduleUrl('useDarkMode', { useDarkMode }),
      '@slidev/client/logic/slides': moduleUrl('slides', slideLogic),
      '@slidev/client/context': moduleUrl('context', context),
      '@slidev/client/constants': moduleUrl('constants', constants),
      '#slidev/slides': moduleUrl('virtual-slides', { slides }),
      '#slidev/title-renderer': moduleUrl('titles', { default: TitleRenderer }),
    }
    activeLayouts = {
      ...layoutByName,
      ...compiler!.theme.layouts,
    }
    for (const [name, component] of Object.entries(activeLayouts))
      modules[`online:layout/${name}`] = moduleUrl(`layout/${name}`, { default: component })
    for (const [name, component] of Object.entries(components))
      modules[`@slidev/client/builtin/${name}.vue`] = moduleUrl(`builtin/${name}`, { default: component })
  }

  function sendPosition() {
    report({ type: 'position', slide: position.value, click: clicks.value?.current ?? 0 })
  }

  async function loadComponent(code: string, warnings: string[] = []) {
    code = await rewriteModuleImports(code, async (specifier) => {
      const name = specifier.replace(/\.ts$/, '')
      const iconImport = name.match(/^~icons\/([a-z0-9-]+)\/([a-z0-9-]+)$/)
      if (!Object.hasOwn(modules, name) && iconImport) {
        const icon = await resolveIcon(`${iconImport[1]}:${iconImport[2]}`)
        if (!icon)
          throw new Error(`Icon ${specifier} is unavailable online`)
        if (icon.warning)
          iconImportWarnings.set(name, icon.warning)
        modules[name] = moduleUrl(name, { default: icon.component })
      }
      if (iconImportWarnings.has(name))
        warnings.push(iconImportWarnings.get(name)!)
      if (!Object.hasOwn(modules, name))
        throw new Error(`Module ${specifier} is unavailable online; only bundled modules can be imported`)
      return modules[name]
    })
    const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }))
    try {
      return (await import(/* @vite-ignore */ url)).default
    }
    finally {
      URL.revokeObjectURL(url)
    }
  }

  async function resolveComponents(code: string) {
    const warnings: string[] = []
    const normalize = (name: string) => name.replaceAll('-', '').toLowerCase()
    const knownComponents = new Set(Object.keys(components).map(normalize))
    const names = new Set([
      ...code.matchAll(/_resolveComponent\("([^"]+)"\)/g),
    ].map(match => match[1]))
    // Independent collection requests may run together; each collection is
    // cached and requested at most once per frame, including TOC titles.
    await Promise.all([...names].map(async (name) => {
      if (knownComponents.has(normalize(name)))
        return
      const icon = await resolveIcon(name)
      if (icon) {
        iconComponents.set(name, icon.component)
        if (icon.warning)
          warnings.push(icon.warning)
      }
      else {
        warnings.push(`Component ${name} is unavailable online`)
      }
    }))
    return warnings
  }

  async function goto(slide: number, click = 0) {
    if (!compiler)
      return
    flushDragUpdates()
    const version = ++generation
    const index = Math.max(0, Math.min(compiler.slides.length - 1, slide - 1))
    const source = compiler.slides[index]
    const warnings: string[] = [...titleWarnings]
    const requestedLayout = source.frontmatter.layout || (index === 0
      ? 'cover'
      : 'default')
    const layout = Object.hasOwn(activeLayouts, requestedLayout)
      ? requestedLayout
      : 'default'
    if (layout !== requestedLayout)
      warnings.push(`Layout ${requestedLayout} is unavailable; using default`)
    const compiled = await compiler.compile(index, `online:layout/${layout}`)
    warnings.push(...compiled.warnings)
    if (/class="katex(?: |")/.test(compiled.sfc)) {
      try {
        await loadMathStyles()
      }
      catch (error) { warnings.push(String(error)) }
    }
    // Vue omits resolution warnings in production. Inspect only the compiler's
    // generated resolver calls so unsupported widgets always get a visible notice.
    warnings.push(...await resolveComponents(compiled.code))
    for (const [, name] of compiled.code.matchAll(/_resolveDirective\("([^"]+)"\)/g)) {
      if (![
        'click',
        'after',
        'drag',
        'mark',
        'motion',
      ].includes(name)) {
        warnings.push(`Directive v-${name} is unavailable online`)
      }
    }
    const component = await loadComponent(compiled.code, warnings)
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
      ...compiler.theme.css.map(content => ({ content, scoped: false })),
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
    styles.push((await uno.generate(`${compiled.sfc}\n${JSON.stringify(source.frontmatter)}\n${Object.values(layoutSources).join('\n')}\n${Object.values(directiveSources).join('\n')}\n${Object.values(dragControlSource).join('\n')}\n${Object.values(dragComponentSources).join('\n')}\n${compiler.theme.sources.join('\n')}`)).css)
    if (generation !== version)
      return
    navigation.navDirection.value = Math.sign(index + 1 - position.value)
    position.value = index + 1
    // Let slide-leave watchers observe the new position before their owning
    // component is unmounted and its effect scope is disposed.
    await Vue.nextTick()
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
    const route = slides.value[index]
    route.component = Vue.markRaw(component)
    clicks.value = createFixedClicks(route, click)
    const slideElement = Vue.shallowRef<HTMLElement | null>(null)
    app = Vue.createApp({
      render: () => Vue.h('div', {
        ref: slideElement,
        style: { width: '100%', height: '100%' },
      }, [
        Vue.h(SlideWrapper, { route, clicksContext: clicks.value! }),
        activeDragElement.value
          ? Vue.h(DragControl, { data: activeDragElement.value })
          : null,
      ]),
    })
    app.provide(constants.injectionSlideElement, slideElement)
    app.provide(plantUmlPermission, plantUmlAllowed)
    app.provide(constants.injectionSlideScale, Vue.computed(() => scale.value))
    app.use(createVDragDirective())
    app.use(createVClickDirectives())
    app.use(createVMarkDirective())
    app.use(createVMotionDirectives())
    for (const [name, component] of Object.entries(components))
      app.component(name, component)
    for (const [name, component] of iconComponents)
      app.component(name, component)
    app.provide(constants.injectionSlidevContext, Vue.reactive({
      configs,
      nav: navigation,
      themeConfigs: Vue.computed(() => configs.themeConfig),
    }) as any)
    app.config.warnHandler = (warning) => {
      if (/Failed to resolve (?:component|directive)/.test(warning))
        warnings.push(warning.split('\n')[0])
    }
    app.config.errorHandler = error => report({
      type: 'error',
      slide: position.value,
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
    if (!compiler || !clicks.value)
      return
    navigation.clicksDirection.value = 1
    if (clicks.value.current < clicks.value.total) {
      clicks.value.current++
      sendPosition()
    }
    else if (position.value < compiler.slides.length) {
      await goto(position.value + 1)
    }
  }

  async function prev() {
    if (!clicks.value)
      return
    navigation.clicksDirection.value = -1
    if (clicks.value.current > clicks.value.clicksStart) {
      clicks.value.current--
      sendPosition()
    }
    else if (position.value > 1) {
      await goto(position.value - 1, 999999)
    }
  }

  function resize() {
    if (!container)
      return
    const height = Math.ceil(configs.canvasWidth / configs.aspectRatio)
    scale.value = Math.min(innerWidth / configs.canvasWidth, innerHeight / height)
    container.style.transform = `translate(-50%, -50%) scale(${scale.value})`
    container.style.setProperty('--slidev-slide-container-scale', String(scale.value))
  }

  return {
    goto,
    next,
    prev,
    resize,
    async render(input: RenderInput) {
      generation++
      plantUmlAllowed.value = false
      configureDragUpdates(patch => report({ type: 'drag', patch }))
      app?.unmount()
      app = undefined
      compiler = await createDeckCompiler(input.src)
      Object.assign(configs, compiler.config)
      slides.value = compiler.slides.map(source => ({
        no: source.index + 1,
        meta: { ...source.frontmatter, slide: source },
      } as unknown as SlideRoute))
      resetModules()
      const titles = await compiler.compileTitles()
      iconComponents.clear()
      titleWarnings = await resolveComponents(titles.code)
      titleRenderer.value = Vue.markRaw(await loadComponent(titles.code, titleWarnings))
      isDark.value = input.dark
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
