import { parse } from 'es-module-lexer/js'

/** Rewrite syntax-level imports using a trusted bundled-module resolver. */
export async function rewriteModuleImports(code: string, resolveModule: (specifier: string) => string | Promise<string>) {
  const [imports] = await parse(code)
  let output = code
  for (const entry of [...imports].reverse()) {
    if (entry.d === -2)
      continue // import.meta describes this opaque module, not a dependency.
    if (entry.n == null)
      throw new Error('Dynamic module expressions are not available online; use a bundled module name')
    const url = await resolveModule(entry.n)
    const start = entry.d === -1
      ? entry.s - 1
      : entry.s
    const end = entry.d === -1
      ? entry.e + 1
      : entry.e
    output = output.slice(0, start) + JSON.stringify(url) + output.slice(end)
  }
  return output
}
