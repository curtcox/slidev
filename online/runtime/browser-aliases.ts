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
    transform(code, id) {
      if (!id.replaceAll('\\', '/').endsWith('/packages/client/composables/useDragElements.ts'))
        return
      const updater = 'export function useDragElementsUpdater(no: number) {'
      const position = '  let dataSource: DragElementDataSource = directive ? \'directive\' : \'prop\''
      const parsed = '  if (dataSource !== \'frontmatter\' && !markdownSource)'
      for (const seam of [updater, position, parsed]) {
        if (code.split(seam).length !== 2)
          throw new Error('Review the online drag adapter after upstream useDragElements changed')
      }
      return {
        code: `import {useOnlineDragUpdater,restoreDragPosition,restoreDragSource} from ${JSON.stringify(fileURLToPath(new URL('./src/drag.ts', import.meta.url)))};\n${code
          .replace(updater, `${updater}\n  return useOnlineDragUpdater(no)`)
          .replace(position, `  const restored = restoreDragSource(page.value, markdownSource)\n  posRaw = restoreDragPosition(page.value, posRaw, markdownSource) as typeof posRaw\n${position}`)
          .replace(parsed, `  if (restored) { dataSource = restored.source; dragId = restored.id }\n${parsed}`)}`,
        map: null,
      }
    },
    resolveId(source, importer) {
      const file = importer?.split('?')[0].replaceAll('\\', '/') ?? ''
      if (file.includes('/packages/client/')) {
        if (source === '../state' && /\/(?:useDragElements\.ts|useSlideBounds\.ts|DragControl\.vue)$/.test(file))
          return shim('drag-state')
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
