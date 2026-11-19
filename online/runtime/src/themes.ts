import type { SlidevThemeMeta } from '@slidev/types'
import type { Component } from 'vue'
import appleMeta from '@slidev/theme-apple-basic/package.json'
import appleCss from '@slidev/theme-apple-basic/styles/layout.css?raw'
import applePrism from '@slidev/theme-apple-basic/styles/prism.css?inline'
import bricksMeta from '@slidev/theme-bricks/package.json'
import bricksCss from '@slidev/theme-bricks/styles/layouts.css?raw'
import bricksPrism from '@slidev/theme-bricks/styles/prism.css?inline'
import defaultMeta from '@slidev/theme-default/package.json'
import defaultCss from '@slidev/theme-default/styles/layouts.css?raw'
import defaultPrism from '@slidev/theme-default/styles/prism.css?inline'
import seriphMeta from '@slidev/theme-seriph/package.json'
import seriphCss from '@slidev/theme-seriph/styles/layouts.css?raw'
import seriphPrism from '@slidev/theme-seriph/styles/prism.css?inline'
import shibainuMeta from '@slidev/theme-shibainu/package.json'
import shibainuCss from '@slidev/theme-shibainu/styles/layouts.css?raw'
import shibainuPrism from '@slidev/theme-shibainu/styles/prism.css?inline'
import baseCss from '../../../packages/client/styles/layouts-base.css?raw'

// These packages are pinned and audited at build time. No deck can request an
// npm download or add a new import to the trusted runtime graph.
const layouts = import.meta.glob('../../../node_modules/@slidev/theme-{default,seriph,apple-basic,bricks,shibainu}/layouts/*.vue', { eager: true, import: 'default' }) as Record<string, Component>
const tokens = import.meta.glob<string[]>('../../../node_modules/@slidev/theme-{default,seriph,apple-basic,bricks,shibainu}/{layouts,components,assets}/*.vue', { eager: true, query: '?raw&online-uno-tokens', import: 'default' })
const components = import.meta.glob('../../../node_modules/@slidev/theme-bricks/components/*.vue', { eager: true, import: 'default' }) as Record<string, Component>

function themeLayouts(name: string) {
  return Object.fromEntries(Object.entries(layouts)
    .filter(([file]) => file.includes(`/theme-${name}/`))
    .map(([file, component]) => [
      file.split('/').at(-1)!.slice(0, -4),
      component,
    ]))
}

const themes = {
  'default': {
    meta: defaultMeta.slidev,
    layouts: themeLayouts('default'),
    css: [baseCss, defaultCss, defaultPrism],
  },
  'seriph': {
    meta: seriphMeta.slidev,
    layouts: themeLayouts('seriph'),
    css: [baseCss, seriphCss, seriphPrism],
  },
  'apple-basic': {
    meta: appleMeta.slidev,
    layouts: themeLayouts('apple-basic'),
    css: [appleCss, applePrism],
  },
  'bricks': {
    meta: bricksMeta.slidev,
    layouts: themeLayouts('bricks'),
    css: [baseCss, bricksCss, bricksPrism],
  },
  'shibainu': {
    meta: shibainuMeta.slidev,
    layouts: themeLayouts('shibainu'),
    css: [baseCss, shibainuCss, shibainuPrism],
  },
}

export function resolveTheme(requested: unknown) {
  const candidate = String(requested ?? 'default').replace(/^@slidev\/theme-/, '')
  const name = Object.hasOwn(themes, candidate)
    ? candidate as keyof typeof themes
    : 'default'
  const warnings = Object.hasOwn(themes, candidate)
    ? []
    : [`Theme ${String(requested).slice(0, 100)} is unavailable online; using default`]
  return {
    name,
    ...themes[name],
    // Published defaults contain FontOptions; resolveConfig supplies the
    // remaining ResolvedFontOptions fields required by the upstream type.
    meta: themes[name].meta as unknown as SlidevThemeMeta,
    components: name === 'bricks'
      ? Object.fromEntries(Object.entries(components).map(([file, component]) => [
          file.split('/').at(-1)!.slice(0, -4),
          component,
        ]))
      : {},
    tokens: Object.entries(tokens).filter(([file]) => file.includes(`/theme-${name}/`)).flatMap(([, tokens]) => tokens),
    warnings,
  }
}
