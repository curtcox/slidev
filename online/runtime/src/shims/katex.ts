type Katex = typeof import('katex')['default']

let renderer: Katex
let pending: Promise<void> | undefined

export default {
  renderToString(...args: Parameters<Katex['renderToString']>) {
    return renderer.renderToString(...args)
  },
}

/** Prepare the synchronous upstream Markdown renderer before transforming math. */
export function prepareKatex() {
  pending ??= hashbinSandbox.import('runtime/math/katex.js').then((module) => {
    renderer = module.default
  }).catch(() => {
    pending = undefined
    throw new Error('The bundled KaTeX renderer is unavailable. Try rendering again.')
  })
  return pending
}
