import type MarkdownExit from 'markdown-exit'

export function resolveSnippetImport(line: string) {
  if (/^<<<[ \t]*\S/.test(line.trimStart()))
    throw new Error('File snippets (<<<) are not available online')
  return null
}

export default function snippet(md: MarkdownExit) {
  md.block.ruler.before('fence', 'online-snippet', (state, start, _end, silent) => {
    const line = state.src.slice(state.bMarks[start] + state.tShift[start], state.eMarks[start])
    if (!/^<<<[ \t]*\S/.test(line))
      return false
    if (silent)
      return true
    resolveSnippetImport(line)
    return false
  })
}
