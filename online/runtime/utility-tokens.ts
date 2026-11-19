import type { Plugin } from 'vite'
import { readFile } from 'node:fs/promises'
import { createGenerator } from 'unocss'
import unoConfig from '../../packages/client/uno.config.ts'

/** Keep only matched utilities from trusted components; never compile a deck here. */
export async function extractUtilityTokens(source: string) {
  const uno = await createGenerator(unoConfig)
  return [
    ...(await uno.generate(source)).matched,
  ]
}

export function bundleUtilityTokens(): Plugin {
  return {
    name: 'slidev-online-utility-tokens',
    enforce: 'pre',
    async load(id) {
      const [file, query] = id.split('?')
      if (!new URLSearchParams(query).has('online-uno-tokens'))
        return
      const tokens = await extractUtilityTokens(await readFile(file, 'utf8'))
      return `export default ${JSON.stringify(tokens)}`
    },
  }
}
