import { compileStyle } from '@vue/compiler-sfc/dist/compiler-sfc.esm-browser.js'
import { createDeckCompiler } from './index'

/** Compile every slide without importing or mounting author modules. */
export async function checkDeck(src: string, css = '') {
  if (globalThis.origin !== 'null')
    throw new Error('Proposal compilation requires an opaque sandbox')
  if (typeof src !== 'string' || typeof css !== 'string'
    || new TextEncoder().encode(src).byteLength + new TextEncoder().encode(css).byteLength > 5 * 1024 * 1024) {
    throw new Error('The document exceeds the 5 MiB limit')
  }
  const errors: { message: string, slide?: number, file?: string, line?: number }[] = []
  const record = (error: any, slide?: number, file = 'slides.md') => {
    if (errors.length < 100) {
      errors.push({
        message: String(error?.reason ?? error?.message ?? error).slice(0, 2000),
        slide: error?.slide ?? slide,
        file,
        line: error?.line,
      })
    }
  }
  const styles = compileStyle({ source: css, filename: 'style.css', id: 'online-check' })
  styles.errors.forEach(error => record(error, undefined, 'style.css'))
  let compiler
  try {
    compiler = await createDeckCompiler(src)
  }
  catch (error) {
    record(error)
    return { slides: 0, errors }
  }
  try {
    await compiler.compileTitles()
  }
  catch (error) { record(error) }
  for (const [index, slide] of compiler.slides.entries()) {
    try {
      const layout = slide.frontmatter.layout || (index === 0
        ? 'cover'
        : 'default')
      const compiled = await compiler.compile(index, `online:layout/${layout}`)
      for (const style of compiled.styles) {
        const result = compileStyle({
          source: style.content,
          scoped: style.scoped,
          id: compiled.scopeId,
          filename: `slide-${index + 1}.css`,
        })
        result.errors.forEach(error => record(error, index + 1))
      }
    }
    catch (error) { record(error, index + 1) }
  }
  return { slides: compiler.slides.length, errors }
}
