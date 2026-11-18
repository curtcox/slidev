import type { HighlighterCore, LanguageRegistration } from 'shiki/core'
import { createHighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import languages from './languages.json'

const aliases = new Map(Object.entries(languages).flatMap(([name, aliases]) => [name, ...aliases].map(alias => [alias, name])))
const pending = new Map<string, Promise<HighlighterCore>>()
const engine = createJavaScriptRegexEngine({ target: 'ES2018' })
const themes = [import('@shikijs/themes/vitesse-light'), import('@shikijs/themes/vitesse-dark')]

export async function loadLanguage(language: string) {
  const name = ['text', 'txt', 'plaintext'].includes(language)
    ? 'text'
    : aliases.get(language)
  if (!name)
    throw new Error('Language is not bundled')
  if (!pending.has(name)) {
    const request = (async () => {
      if (name === 'text')
        return createHighlighterCore({ engine, themes, langs: [] })
      // Only curated canonical names can form URLs. The SDK proxies these
      // data-only assets through the parent's verified offline cache.
      const response = await fetch(`runtime/grammars/${name}.json`, {
        signal: AbortSignal.timeout(15000),
      })
      if (!response.ok)
        throw new Error('Bundled grammar is unavailable')
      const bytes = await response.arrayBuffer()
      if (bytes.byteLength > 5 * 1024 * 1024)
        throw new Error('Grammar exceeds its size limit')
      const grammars: LanguageRegistration[] = JSON.parse(new TextDecoder().decode(bytes))
      if (!Array.isArray(grammars) || !grammars.some(grammar => grammar.name === name))
        throw new Error('Invalid bundled grammar')
      // TextMate injections (notably Vue's HTML/Markdown extensions) mutate
      // the registry. Isolate each curated root language so visiting another
      // slide cannot change its highlighting or invalidate compiled caches.
      return createHighlighterCore({ engine, themes, langs: grammars })
    })()
    pending.set(name, request)
    request.catch(() => pending.delete(name))
  }
  return { shiki: await pending.get(name)!, lang: name }
}
