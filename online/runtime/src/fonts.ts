import type { ResolvedFontOptions } from '@slidev/types'
import catalog from './font-catalog.json'

const normalize = (name: string) => name.replace(/^(['"])(.*)\1$/, '$2').trim()
const bundled = new Map(Object.entries(catalog).map(([family, entry]) => [
  family.toLowerCase(),
  entry,
]))
const fallback = 'Fonts are unavailable; using local/system fallbacks'

async function withDeadline<T>(operation: Promise<T>) {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(fallback)), 5000) }),
    ])
  }
  finally { clearTimeout(timer) }
}

/** One font set per render. Navigation keeps it; replacing a deck discards it. */
export async function loadFonts(options: ResolvedFontOptions) {
  document.querySelectorAll('[data-online-fonts]').forEach(element => element.remove())
  const warnings: string[] = []
  const names = [
    ...new Set(options.webfonts.map(normalize)),
  ]
  const ready = async () => {
    try {
      // Trigger style/layout first so used faces, including code/italics, load.
      document.body.getBoundingClientRect()
      await withDeadline(document.fonts.ready)
      if ([...document.fonts].some(face => names.includes(normalize(face.family)) && face.status === 'error'))
        throw new Error(fallback)
    }
    catch { return [...warnings, fallback] }
    return warnings
  }
  if (options.provider === 'none' || !names.length) {
    return {
      warnings,
      ready: async () => warnings,
    }
  }
  if (options.provider !== 'google') {
    warnings.push('Only Google and bundled fonts are available online; using local/system fallbacks')
    return {
      warnings,
      ready: async () => warnings,
    }
  }
  if (names.length > 32 || names.some(name => !name || name.length > 128)
    || !options.weights.length || options.weights.length > 20
    || options.weights.some(weight => !/^\d{1,4}(?:\.\.\d{1,4})?$/.test(weight))) {
    warnings.push('Font settings exceed online limits; using local/system fallbacks')
    return {
      warnings,
      ready: async () => warnings,
    }
  }
  const remote = names.filter(name => !bundled.has(name.toLowerCase()))
  await Promise.all(names.map(async (name) => {
    const entry = bundled.get(name.toLowerCase())
    if (!entry)
      return
    try {
      const css = await withDeadline((async () => {
        const response = await fetch(`runtime/fonts/${entry.id}.css`)
        if (!response.ok)
          throw new Error(fallback)
        const text = await response.text()
        if (text.length > 2 * 1024 * 1024)
          throw new Error(fallback)
        return text
      })())
      const style = document.createElement('style')
      style.dataset.onlineFonts = entry.id
      style.textContent = css
      document.head.prepend(style)
    }
    catch { warnings.push(`Bundled font ${name} is unavailable; using local/system fallbacks`) }
  }))
  if (remote.length) {
    const weights = options.weights.flatMap(weight => options.italic
      ? [`0,${weight}`, `1,${weight}`]
      : [weight]).sort().join(';')
    const url = new URL('https://fonts.googleapis.com/css2')
    for (const name of remote)
      url.searchParams.append('family', `${name}:${options.italic ? 'ital,' : ''}wght@${weights}`)
    url.searchParams.set('display', 'swap')
    const link = document.createElement('link')
    link.dataset.onlineFonts = 'google'
    link.rel = 'stylesheet'
    link.referrerPolicy = 'no-referrer'
    try {
      await withDeadline(new Promise<void>((resolve, reject) => {
        link.onload = () => resolve()
        link.onerror = () => reject(new Error(fallback))
        link.href = url.href
        document.head.append(link)
      }))
    }
    catch {
      link.remove()
      warnings.push('Google fonts are unavailable; using local/system fallbacks')
    }
    finally { link.onload = link.onerror = null }
  }
  return { warnings, ready }
}
