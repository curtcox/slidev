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
import { getCurrentTransition } from '../../../packages/client/logic/transition'
import { createVClickDirectives } from '../../../packages/client/modules/v-click'
import { createVDragDirective } from '../../../packages/client/modules/v-drag'
import { createVMarkDirective } from '../../../packages/client/modules/v-mark'
import { createVMotionDirectives } from '../../../packages/client/modules/v-motion'
import unoConfig from '../../../packages/client/uno.config'
import { createDeckCompiler } from './compiler'
import { locatedError, offsetAt, slideError } from './compiler/diagnostics'
import { rewriteModuleImports } from './compiler/modules'
import commonCss from './core-styles'
import { configureDragUpdates, flushDragUpdates } from './drag'
import { loadFonts } from './fonts'
import { resolveIcon } from './icons'
import { loadMathStyles } from './math'
import { createNavigation, useNav } from './navigation'
import { plantUmlPermission } from './plant-uml'
import PlantUml from './PlantUml.vue'
import RouterLink from './RouterLink.vue'
import { isDark } from './shims/dark'
import { activeDragElement } from './shims/drag-state'
import { createGenerator, mergeConfigs } from './shims/uno'
import configs from './virtual/configs'
import { slides } from './virtual/slides'
import TitleRenderer, { titleRenderer } from './virtual/title-renderer'

const layouts = import.meta.glob('../../../packages/client/layouts/*.vue', { eager: true, import: 'default' }) as Record<string, Component>
const layoutTokens = import.meta.glob<string[]>('../../../packages/client/layouts/*.vue', { eager: true, query: '?raw&online-uno-tokens', import: 'default' })
const builtinTokens = import.meta.glob<string[]>('../../../packages/client/builtin/*.vue', { eager: true, query: '?raw&online-uno-tokens', import: 'default' })
const dragControlTokens = import.meta.glob<string[]>('../../../packages/client/internals/DragControl.vue', { eager: true, query: '?raw&online-uno-tokens', import: 'default' })
const directiveTokens = import.meta.glob<string[]>('../../../packages/client/modules/v-{drag,mark,motion}.ts', { eager: true, query: '?raw&online-uno-tokens', import: 'default' })
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
const bundledTokens = new Set([
  ...Object.values(layoutTokens).flat(),
  ...Object.values(directiveTokens).flat(),
  ...Object.values(dragControlTokens).flat(),
  ...Object.entries(builtinTokens).filter(([path]) => path.split('/').at(-1)!.slice(0, -4) in components).flatMap(([, tokens]) => tokens),
])

export interface RenderInput {
  src: string
  css: string
  slide: number
  click: number
  dark: boolean
}

export interface ExportHtmlInput {
  src: string
  css: string
  dark: boolean
  notes: boolean
}

function escapeHtml(text: string) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&#39;')
}

function safeStyleText(css: string) {
  return css.replaceAll(/<\/style/gi, '<\\/style')
}

async function waitForMermaid(root: Element) {
  const containers = [
    ...root.querySelectorAll('.mermaid'),
  ]
  if (!containers.length)
    return
  const deadline = Date.now() + 10000
  while (Date.now() < deadline) {
    if (containers.every(el => el.shadowRoot?.querySelector('svg') || el.querySelector('svg') || el.textContent?.includes('unavailable')))
      return
    await new Promise(resolve => setTimeout(resolve, 50))
  }
}

export function createRenderer(report: (message: Record<string, unknown>) => void, runtimeCss = '') {
  let app: App | undefined
  let compiler: Awaited<ReturnType<typeof createDeckCompiler>> | undefined
  const clicks = Vue.shallowRef<ClicksContext>()
  const position = Vue.ref(1)
  const navigation = createNavigation(position, clicks, goto, next, prev)
  const transition = Vue.computed(() => {
    const selected = navigation.currentTransition.value
    if (selected?.name !== 'view-transition')
      return selected
    if (typeof document.startViewTransition !== 'function')
      return { ...selected, name: 'fade' }
  })
  let activeViewTransition: ViewTransition | undefined
  const scale = Vue.shallowRef(1)
  const plantUmlAllowed = Vue.ref(false)
  let generation = 0
  let container: HTMLDivElement | undefined
  const view = Vue.shallowRef<{ key: number, route: SlideRoute, clicksContext: ClicksContext }>()
  const stylesheets = new Map<number, HTMLStyleElement>()
  const leavingSlides = new Set<HTMLElement>()
  let urls: string[] = []
  const iconComponents = new Map<string, Component>()
  const iconImportWarnings = new Map<string, string>()
  let titleWarnings: string[] = []
  let currentWarnings: string[] = []
  let fonts: ReturnType<typeof loadFonts> | undefined
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

  let modules: Record<string, Record<string, unknown>> = {}
  let moduleUrls: Record<string, string> = {}
  let activeLayouts = layoutByName
  function resetModules() {
    iconImportWarnings.clear()
    for (const url of urls)
      URL.revokeObjectURL(url)
    urls = []
    moduleUrls = {}
    modules = {
      'vue': Vue,
      '@slidev/client': {
        ...context,
        ...env,
        ...layoutHelper,
        ...slideLogic,
        useNav,
        useDarkMode,
      },
      '@slidev/client/composables/useNav': { useNav },
      '@slidev/client/composables/useDarkMode': { useDarkMode },
      '@slidev/client/logic/slides': slideLogic,
      '@slidev/client/context': context,
      '@slidev/client/constants': constants,
      '#slidev/slides': { slides },
      '#slidev/title-renderer': { default: TitleRenderer },
    }
    activeLayouts = {
      ...layoutByName,
      ...compiler!.theme.layouts,
    }
    for (const [name, component] of Object.entries(activeLayouts))
      modules[`online:layout/${name}`] = { default: component }
    for (const [name, component] of Object.entries(components))
      modules[`@slidev/client/builtin/${name}.vue`] = { default: component }
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
        modules[name] = { default: icon.component }
      }
      if (iconImportWarnings.has(name))
        warnings.push(iconImportWarnings.get(name)!)
      if (!Object.hasOwn(modules, name))
        throw new Error(`Module ${specifier} is unavailable online; only bundled modules can be imported`)
      // Most registered layouts and built-ins are never imported by a deck.
      // Keep one Blob per requested module so static and dynamic imports share it.
      return moduleUrls[name] ??= moduleUrl(name, modules[name])
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
    const knownComponents = new Set([
      ...Object.keys(components),
      ...Object.keys(compiler!.theme.components),
    ].map(normalize))
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
    try {
      return await renderSlide(slide, click)
    }
    catch (error) {
      if ((error as any)?.file)
        throw error
      const index = Math.max(0, Math.min((compiler?.slides.length ?? 1) - 1, slide - 1))
      if (compiler)
        throw slideError(error, compiler.slides[index].source, index + 1)
      throw error
    }
  }

  async function renderSlide(slide: number, click = 0) {
    if (!compiler)
      return
    flushDragUpdates()
    const version = ++generation
    const index = Math.max(0, Math.min(compiler.slides.length - 1, slide - 1))
    // Updating click position must preserve author state and must not start a
    // slide transition or re-evaluate the slide's script.
    if (app && view.value?.route.no === index + 1 && clicks.value) {
      navigation.clicksDirection.value = Math.sign(click - clicks.value.current)
      clicks.value.current = click
      await Vue.nextTick()
      sendPosition()
      return
    }
    const source = compiler.slides[index]
    const warnings: string[] = [...titleWarnings]
    currentWarnings = warnings
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
    // Trusted CSS is compiled at build time with the deck's font CSS variables.
    // Author styles still compile in this opaque frame, including scoped rules.
    const styles = [commonCss, ...compiler.theme.css]
    for (const style of compiled.styles) {
      const text = new MagicString(style.content)
      try {
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
      catch (error: any) {
        const offset = 'offset' in style
          ? style.offset as number | undefined
          : undefined
        let line = error.line ?? 1
        let column = error.column ?? 1
        if (offset != null && text.hasChanged()) {
          const segments = text.generateDecodedMap({ hires: true }).mappings[line - 1] ?? []
          const segment = segments.findLast(part => part.length === 4 && part[0] <= column - 1)
          if (segment) {
            line = segment[2]! + 1
            column = segment[3]! + 1
          }
        }
        throw slideError(new Error(error.reason ?? error.message ?? String(error)), source.source, index + 1, offset == null
          ? 0
          : offset + offsetAt(style.content, line, column))
      }
    }
    const tokens = await uno.applyExtractors(`${compiled.sfc}\n${JSON.stringify(source.frontmatter)}`)
    for (const token of bundledTokens)
      tokens.add(token)
    for (const token of compiler.theme.tokens)
      tokens.add(token)
    styles.push((await uno.generate(tokens)).css)
    const preparedFonts = await fonts
    if (generation !== version)
      return
    const route = slides.value[index]
    const direction = Math.sign(route.no - position.value)
    const selected = getCurrentTransition(direction, route, view.value?.route)
    const nativeRequested = selected?.name === 'view-transition'
    const nativeSupported = typeof document.startViewTransition === 'function'
    if (nativeRequested && !nativeSupported)
      warnings.push('Native view transitions are unavailable in this browser; using fade')
    const stylesheet = document.createElement('style')
    stylesheet.dataset.onlineSlide = String(route.no)
    stylesheet.textContent = styles.join('\n')
    async function updateSlide() {
      if (generation !== version)
        return
      navigation.navDirection.value = direction
      position.value = route.no
      // Give the old slide's leave watchers a tick before unmounting it.
      await Vue.nextTick()
      if (generation !== version)
        return
      navigation.currentTransition.value = selected
      route.component = Vue.markRaw(component)
      clicks.value = createFixedClicks(route, click)
      document.head.insertBefore(stylesheet, document.querySelector('#online-document-css'))
      stylesheets.set(version, stylesheet)
      if (app) {
        for (const [name, component] of iconComponents)
          app.component(name, component)
      }
      view.value = {
        key: version,
        route,
        clicksContext: clicks.value,
      }
      if (!app)
        mount()
      await Vue.nextTick()
      // TOC titles can contain math even when this slide's SFC does not.
      if (container?.querySelector('.katex')) {
        try {
          await loadMathStyles()
        }
        catch (error) { warnings.push(String(error)) }
      }
    }
    activeViewTransition?.skipTransition()
    if (app && nativeRequested && nativeSupported) {
      // A previous CSS transition may still have a slide in the DOM. Exclude
      // it from the snapshot so shared names identify only the active slide.
      for (const element of leavingSlides)
        element.style.setProperty('display', 'none', 'important')
      // The old state is captured before updateSlide changes its DOM or CSS.
      // Capture the new state only after Vue commits the updated slide.
      const running = document.startViewTransition(updateSlide)
      activeViewTransition = running
      // A skipped animation (for example, in a hidden tab) still updates the slide.
      void running.ready.catch(() => {})
      const clear = () => {
        if (activeViewTransition === running)
          activeViewTransition = undefined
      }
      void running.finished.then(clear, clear)
      await running.updateCallbackDone
    }
    else {
      await updateSlide()
    }
    if (preparedFonts)
      warnings.push(...await preparedFonts.ready())
    if (generation !== version)
      return
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

  function mount() {
    container = document.createElement('div')
    container.id = 'app'
    container.style.width = `${configs.canvasWidth}px`
    container.style.height = `${Math.ceil(configs.canvasWidth / configs.aspectRatio)}px`
    document.body.prepend(container)
    const slideElement = Vue.shallowRef<HTMLElement | null>(null)
    app = Vue.createApp({
      render: () => Vue.h('div', {
        ref: slideElement,
        style: { width: '100%', height: '100%' },
      }, [
        Vue.h(Vue.Transition, {
          css: Boolean(transition.value && transition.value.name !== 'none'),
          ...transition.value,
          onBeforeLeave(element: Element) {
            leavingSlides.add(element as HTMLElement)
          },
          onAfterLeave(element: Element) {
            leavingSlides.delete(element as HTMLElement)
            // Vue unmounts components before their leaving DOM is removed.
            // Keep scoped styles alive until the animation actually finishes.
            const key = Number((element as HTMLElement).dataset.onlineView)
            stylesheets.get(key)?.remove()
            stylesheets.delete(key)
          },
        }, {
          default: () => view.value
            ? Vue.h(SlideWrapper, { ...view.value, 'data-online-view': view.value.key })
            : null,
        }),
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
    for (const [name, component] of Object.entries(compiler!.theme.components))
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
        currentWarnings.push(warning.split('\n')[0])
    }
    app.config.errorHandler = (error) => {
      const detail = slideError(error, compiler!.slides[position.value - 1].source, position.value)
      report({
        type: 'error',
        message: detail.message.slice(0, 2000),
        file: detail.file,
        line: detail.line,
        column: detail.column,
        slide: detail.slide,
      })
    }
    app.mount(container)
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
      activeViewTransition?.skipTransition()
      plantUmlAllowed.value = false
      configureDragUpdates(patch => report({ type: 'drag', patch }))
      app?.unmount()
      app = undefined
      container?.remove()
      view.value = undefined
      for (const stylesheet of stylesheets.values())
        stylesheet.remove()
      stylesheets.clear()
      leavingSlides.clear()
      compiler = await createDeckCompiler(input.src)
      const css = compileStyle({ source: input.css, filename: 'style.css', id: 'online-document' })
      if (css.errors.length) {
        const error = css.errors[0] as any
        throw locatedError(new Error(error.reason ?? error.message ?? String(error)), { file: 'style.css', line: error.line ?? 1, column: error.column ?? 1 })
      }
      Object.assign(configs, compiler.config)
      document.documentElement.dataset.onlineTheme = compiler.theme.name
      for (const kind of ['sans', 'serif', 'mono'] as const)
        document.documentElement.style.setProperty(`--slidevonline-font-${kind}`, configs.fonts[kind].join(','))
      // Load font data while compiling the titles and the first slide.
      fonts = loadFonts(configs.fonts)
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
    async exportHtml(input: ExportHtmlInput) {
      navigation.isPrintMode.value = true
      try {
        await this.render({
          src: input.src,
          css: input.css,
          slide: 1,
          click: 999999,
          dark: input.dark,
        })
        if (!compiler)
          throw new Error('Deck compiler is unavailable')
        const width = configs.canvasWidth
        const height = Math.ceil(configs.canvasWidth / configs.aspectRatio)
        const sharedCss = [
          runtimeCss,
          commonCss,
          ...compiler.theme.css,
        ]
        const slideStyles = new Set<string>()
        const pages: string[] = []
        const sharedPrefix = `${[commonCss, ...compiler.theme.css].join('\n')}\n`

        for (let no = 1; no <= compiler.slides.length; no++) {
          if (no > 1)
            await goto(no, 999999)
          await Vue.nextTick()
          if (container)
            await waitForMermaid(container)
          await new Promise(resolve => setTimeout(resolve, 0))
          const activeStyle = [
            ...document.head.querySelectorAll('style[data-online-slide]'),
          ].at(-1)
          if (activeStyle?.textContent) {
            const text = activeStyle.textContent.startsWith(sharedPrefix)
              ? activeStyle.textContent.slice(sharedPrefix.length)
              : activeStyle.textContent
            if (text.trim())
              slideStyles.add(text)
          }
          const clone = container?.cloneNode(true) as HTMLElement | undefined
          if (!clone)
            throw new Error(`Slide ${no} failed to render`)
          const origShadowHosts = [
            ...container!.querySelectorAll('.mermaid'),
          ]
          const cloneShadowHosts = [
            ...clone.querySelectorAll('.mermaid'),
          ]
          for (let i = 0; i < origShadowHosts.length; i++) {
            const shadow = origShadowHosts[i].shadowRoot
            if (shadow && cloneShadowHosts[i])
              cloneShadowHosts[i].innerHTML = shadow.innerHTML
          }
          clone.removeAttribute('id')
          clone.removeAttribute('style')
          clone.querySelectorAll('script').forEach(node => node.remove())
          const note = input.notes
            ? (compiler.slides[no - 1]?.note ?? '').trim()
            : ''
          const noteHtml = note
            ? `<aside class="print-notes"><h2>Slide ${no} notes</h2><pre>${escapeHtml(note)}</pre></aside>`
            : ''
          pages.push(`<section class="print-slide-sheet"><div class="print-slide-page" style="width:${width}px;height:${height}px">${clone.innerHTML}</div>${noteHtml}</section>`)
        }

        const fontLinks = [
          ...document.head.querySelectorAll('link[data-online-fonts]'),
        ]
          .map(link => `<link rel="stylesheet" referrerpolicy="no-referrer" href="${escapeHtml((link as HTMLLinkElement).href)}">`)
          .join('\n  ')
        const fontStyles = [
          ...document.head.querySelectorAll('style[data-online-fonts]'),
        ]
          .map(style => style.textContent ?? '')
        const mathStyle = document.querySelector('#online-math-css')?.textContent ?? ''
        const title = escapeHtml(String(configs.title || 'Slidev Online deck'))
        const themeName = escapeHtml(compiler.theme.name)
        const fontVars = (['sans', 'serif', 'mono'] as const)
          .map(kind => `--slidevonline-font-${kind}:${configs.fonts[kind].join(',')}`)
          .join(';')

        const printCss = `
html, body {
  margin: 0;
  padding: 0;
  width: auto !important;
  height: auto !important;
  overflow: visible !important;
  background: ${input.dark ? '#111820' : '#eef2f5'};
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.print-banner {
  max-width: ${width}px;
  margin: 16px auto;
  padding: 12px 16px;
  border-radius: 8px;
  background: ${input.dark ? '#1d303c' : '#fff'};
  color: ${input.dark ? '#e1eef5' : '#182e3b'};
  border: 1px solid ${input.dark ? '#3a5565' : '#c8d6df'};
  font: 14px/1.5 system-ui, sans-serif;
}
.print-deck {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
  padding: 0 16px 32px;
}
.print-slide-sheet {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.print-slide-page {
  position: relative;
  overflow: hidden;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.16);
  background: var(--slidev-theme-background, ${input.dark ? '#121212' : '#fff'});
}
.print-slide-page > div {
  width: 100%;
  height: 100%;
}
.print-notes {
  width: ${width}px;
  box-sizing: border-box;
  padding: 12px 16px;
  border-radius: 6px;
  background: ${input.dark ? '#1d303c' : '#fff'};
  color: ${input.dark ? '#e1eef5' : '#182e3b'};
  border: 1px solid ${input.dark ? '#3a5565' : '#c8d6df'};
  font: 14px/1.5 system-ui, sans-serif;
}
.print-notes h2 {
  margin: 0 0 6px;
  font-size: 13px;
  opacity: 0.75;
}
.print-notes pre {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font: inherit;
}
@page {
  size: ${width}px ${height}px;
  margin: 0;
}
@media print {
  html, body {
    background: transparent !important;
  }
  .print-banner {
    display: none !important;
  }
  .print-deck {
    display: block;
    padding: 0;
    gap: 0;
  }
  .print-slide-sheet {
    display: block;
    break-after: page;
    page-break-after: always;
  }
  .print-slide-sheet:last-child {
    break-after: auto;
    page-break-after: auto;
  }
  .print-slide-page {
    box-shadow: none;
  }
  .print-notes {
    margin-top: 8px;
    break-inside: avoid;
  }
}
`
        const allStyles = [
          ...fontStyles,
          ...(mathStyle
            ? [mathStyle]
            : []),
          ...sharedCss,
          ...slideStyles,
          input.css,
          printCss,
        ].filter(Boolean).join('\n')

        const html = `<!doctype html>
<html lang="en"${input.dark ? ' class="dark"' : ''} data-online-theme="${themeName}" style="${escapeHtml(fontVars)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="referrer" content="no-referrer">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; img-src data: https:; font-src data: https://fonts.gstatic.com; base-uri 'none'; form-action 'none'">
  <title>${title}</title>
  ${fontLinks}
  <style>${safeStyleText(allStyles)}</style>
</head>
<body>
  <header class="print-banner">Exported from Slidev Online (${compiler.slides.length} slide${compiler.slides.length === 1
    ? ''
    : 's'}). Use your browser's Print → Save as PDF (with Background graphics enabled) to create a PDF.</header>
  <main class="print-deck">
    ${pages.join('\n    ')}
  </main>
</body>
</html>
`
        report({
          type: 'exported-html',
          html,
          slides: compiler.slides.length,
          origin: globalThis.origin,
        })
      }
      finally {
        navigation.isPrintMode.value = false
      }
    },
  }
}
