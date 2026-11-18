let pending: Promise<void> | undefined

/** Keep the stylesheet for later slides; one request per sandbox, including offline. */
export function loadMathStyles() {
  pending ??= (async () => {
    const response = await fetch('runtime/math/katex.css', {
      signal: AbortSignal.timeout(15000),
    })
    if (!response.ok)
      throw new Error('Math styles and fonts are unavailable; equations may display incorrectly')
    const css = await response.text()
    if (css.length > 512 * 1024)
      throw new Error('Math styles exceed their size limit')
    const style = document.createElement('style')
    style.id = 'online-math-css'
    style.textContent = css
    document.head.prepend(style)
  })().catch((error) => {
    pending = undefined
    throw error
  })
  return pending
}
