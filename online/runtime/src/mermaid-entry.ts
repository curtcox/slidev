import type { MermaidConfig } from 'mermaid'
import lz from 'lz-string'
import mermaid from 'mermaid/dist/mermaid.esm.mjs'

/** Loaded only in the opaque frame, with all diagram implementations bundled. */
export async function render(codeLz: string, options: MermaidConfig) {
  const defined = Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined))
  mermaid.initialize({ startOnLoad: false, theme: 'default', ...defined })
  const container = document.createElement('div')
  container.style.cssText = 'position:absolute;left:-10000px;top:0;visibility:hidden'
  document.body.append(container)
  try {
    const code = lz.decompressFromBase64(codeLz)
    if (!code)
      throw new Error('The diagram source is empty or invalid')
    const { svg } = await mermaid.render(`diagram-${crypto.randomUUID()}`, code, container)
    return svg
  }
  finally { container.remove() }
}
