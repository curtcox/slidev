import type { ResolvedSlidevOptions } from '@slidev/types'
import type { Plugin } from 'vite'
import { bold, gray, red, yellow } from 'ansis'
import { toAtFS } from '../resolver'
import { regexSlideSourceId } from './common'
import { wrapSlideLayout } from './layoutWrapperCore'

export function createLayoutWrapperPlugin(
  { data, utils }: ResolvedSlidevOptions,
): Plugin {
  return {
    name: 'slidev:layout-wrapper',
    transform: {
      filter: {
        id: {
          include: regexSlideSourceId,
        },
      },
      async handler(code, id) {
        const match = id.match(regexSlideSourceId)
        if (!match)
          return
        const [, no, type] = match
        if (type !== 'md')
          return
        const index = +no - 1
        const layouts = await utils.getLayouts()
        const rawLayoutName = data.slides[index]?.frontmatter?.layout ?? data.slides[0]?.frontmatter?.defaults?.layout
        let layoutName = rawLayoutName || (index === 0
          ? 'cover'
          : 'default')
        if (!layouts[layoutName]) {
          console.error(red(`\nUnknown layout "${bold(layoutName)}".${yellow(' Available layouts are:')}`)
            + Object.keys(layouts).map((i, idx) => (idx % 3 === 0
              ? '\n    '
              : '') + gray(i.padEnd(15, ' '))).join('  '))
          console.error()
          layoutName = 'default'
        }

        return wrapSlideLayout(code, index, toAtFS(layouts[layoutName]))
      },
    },
  }
}
