import type { Plugin } from 'vite'
import { compileStyle, parse } from '@vue/compiler-sfc'
import MagicString from 'magic-string'

/** Bundled layouts share a stylesheet; activate their global rules per theme. */
export function isolateThemeStyles(): Plugin {
  return {
    name: 'slidev-online-isolate-theme-styles',
    enforce: 'pre',
    transform(code, id) {
      const theme = id.replaceAll('\\', '/').match(/\/@slidev\/theme-(bricks|shibainu)\/layouts\/[^/?]+\.vue$/)?.[1]
      if (!theme)
        return
      const { descriptor, errors } = parse(code, { filename: id })
      if (errors.length)
        throw errors[0]
      const result = new MagicString(code)
      for (const style of descriptor.styles) {
        if (style.scoped)
          continue
        const compiled = compileStyle({
          source: style.content,
          filename: id,
          id: '',
          postcssPlugins: [
            {
              postcssPlugin: 'slidev-online-theme-selector',
              Rule(rule: { parent?: { type: string }, selectors: string[] }) {
                if (rule.parent?.type === 'root')
                  rule.selectors = rule.selectors.map(selector => `:where(html[data-online-theme="${theme}"]) ${selector}`)
              },
            },
          ],
        })
        if (compiled.errors.length)
          throw compiled.errors[0]
        result.overwrite(style.loc.start.offset, style.loc.end.offset, compiled.code)
      }
      return {
        code: result.toString(),
        map: result.generateMap({ hires: true }),
      }
    },
  }
}
