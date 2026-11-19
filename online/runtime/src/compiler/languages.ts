let pending: Promise<typeof import('../highlighting-entry')> | undefined

/** Load executable highlighting code only inside the opaque frame, on demand. */
export async function loadLanguage(language: string) {
  pending ??= hashbinSandbox.import('runtime/highlighting/shiki.js').catch(() => {
    pending = undefined
    throw new Error('The bundled code highlighter is unavailable. Try rendering again.')
  })
  return (await pending).loadLanguage(language)
}
