import type { MermaidConfig } from 'mermaid'

let pending: Promise<typeof import('../mermaid-entry')> | undefined
let queue = Promise.resolve()
const cache = new Map<string, string>()
let cacheBytes = 0

export function renderMermaid(codeLz: string, options: MermaidConfig) {
  // Mermaid's configuration is global, so initialization/rendering must be serial.
  const job = queue.then(async () => {
    const key = JSON.stringify([codeLz, options])
    if (cache.has(key))
      return cache.get(key)!
    pending ??= hashbinSandbox.import('runtime/diagrams/mermaid.js').catch(() => {
      pending = undefined
      throw new Error('The bundled Mermaid renderer is unavailable. Try rendering again.')
    })
    const { render } = await pending
    const svg = await render(codeLz, options)
    const bytes = 2 * (key.length + svg.length)
    if (bytes < 2 * 1024 * 1024) {
      cache.set(key, svg)
      cacheBytes += bytes
      while (cache.size > 32 || cacheBytes > 2 * 1024 * 1024) {
        const oldest = cache.keys().next().value!
        cacheBytes -= 2 * (oldest.length + cache.get(oldest)!.length)
        cache.delete(oldest)
      }
    }
    return svg
  })
  queue = job.then(() => {}, () => {})
  return job
}
