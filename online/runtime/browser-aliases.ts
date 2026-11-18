import type { Plugin } from 'vite'
import { fileURLToPath } from 'node:url'

const shim = (name: string) => fileURLToPath(new URL(`./src/shims/${name}.ts`, import.meta.url))

export const browserAliases = [
  {
    find: /^node:module$/,
    replacement: shim('node-module'),
  },
  {
    find: /^unplugin$/,
    replacement: shim('unplugin'),
  },
  {
    find: /^unplugin-utils$/,
    replacement: shim('unplugin-utils'),
  },
  {
    find: /^@mdit-vue\/plugin-frontmatter$/,
    replacement: shim('frontmatter'),
  },
  {
    find: /^@shikijs\/vitepress-twoslash$/,
    replacement: shim('twoslash'),
  },
  {
    find: /^unocss$/,
    replacement: shim('uno'),
  },
]

export function browserTransforms(): Plugin {
  return {
    name: 'slidev-online-browser-transform-adapters',
    enforce: 'pre',
    resolveId(source, importer) {
      const file = importer?.replaceAll('\\', '/') ?? ''
      if (file.includes('/packages/client/')) {
        if (source.endsWith('/modules/mermaid'))
          return shim('mermaid')
        if (source.endsWith('/useNav'))
          return fileURLToPath(new URL('./src/navigation.ts', import.meta.url))
        if (source.endsWith('/logic/dark'))
          return shim('dark')
      }
      if (file.endsWith('/node/vite/markdown.ts') && source === '../setups/transformers')
        return shim('transformers')
      if (file.endsWith('/node/syntax/index.ts') && source === './snippet')
        return shim('snippet')
      if (file.endsWith('/node/syntax/codeblock/magic-move.ts') && source === '../snippet')
        return shim('snippet')
      if (file.endsWith('/node/syntax/codeblock/index.ts')) {
        if (source === './monaco')
          return shim('monaco')
        if (source === './plant-uml')
          return shim('plant-uml')
      }
    },
  }
}
