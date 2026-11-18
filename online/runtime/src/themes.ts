import type { SlidevThemeMeta } from '@slidev/types'
import type { Component } from 'vue'
import defaultMeta from '@slidev/theme-default/package.json'
import defaultCss from '@slidev/theme-default/styles/layouts.css?raw'
import defaultPrism from '@slidev/theme-default/styles/prism.css?inline'
import seriphMeta from '@slidev/theme-seriph/package.json'
import seriphCss from '@slidev/theme-seriph/styles/layouts.css?raw'
import seriphPrism from '@slidev/theme-seriph/styles/prism.css?inline'

// These packages are pinned and audited at build time. No deck can request an
// npm download or add a new import to the trusted runtime graph.
const layouts = import.meta.glob('../../../node_modules/@slidev/theme-{default,seriph}/layouts/*.vue', { eager: true, import: 'default' }) as Record<string, Component>
const sources = import.meta.glob('../../../node_modules/@slidev/theme-{default,seriph}/layouts/*.vue', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>

function themeLayouts(name: string) {
  return Object.fromEntries(Object.entries(layouts)
    .filter(([file]) => file.includes(`/theme-${name}/`))
    .map(([file, component]) => [
      file.split('/').at(-1)!.slice(0, -4),
      component,
    ]))
}

const themes = {
  default: {
    meta: defaultMeta.slidev,
    layouts: themeLayouts('default'),
    css: [defaultCss, defaultPrism],
  },
  seriph: {
    meta: seriphMeta.slidev,
    layouts: themeLayouts('seriph'),
    css: [seriphCss, seriphPrism],
  },
}

export function resolveTheme(requested: unknown) {
  const name = requested === 'seriph' || requested === '@slidev/theme-seriph'
    ? 'seriph'
    : 'default'
  const warnings = requested == null || [
    'default',
    'seriph',
    '@slidev/theme-default',
    '@slidev/theme-seriph',
  ].includes(String(requested))
    ? []
    : [`Theme ${String(requested).slice(0, 100)} is unavailable online; using default`]
  return {
    name,
    ...themes[name],
    // Published defaults contain FontOptions; resolveConfig supplies the
    // remaining ResolvedFontOptions fields required by the upstream type.
    meta: themes[name].meta as unknown as SlidevThemeMeta,
    sources: Object.entries(sources).filter(([file]) => file.includes(`/theme-${name}/`)).map(([, source]) => source),
    warnings,
  }
}
