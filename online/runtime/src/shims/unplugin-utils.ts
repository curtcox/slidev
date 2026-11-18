export function createFilter(include: RegExp | RegExp[], exclude: RegExp | RegExp[]) {
  const matches = (patterns: RegExp | RegExp[], id: string) => [patterns].flat().some(pattern => pattern.test(id))
  return (id: string) => matches(include, id) && !matches(exclude, id)
}
