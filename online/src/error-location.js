/** Treat sandbox diagnostics as untrusted, bounded coordinates in the render snapshot. */
export function readErrorLocation(data, src, css) {
  if (!data || !['slides.md', 'style.css'].includes(data.file)
    || !Number.isSafeInteger(data.line) || data.line < 1
    || !Number.isSafeInteger(data.column) || data.column < 1) {
    return undefined
  }
  const lines = (data.file === 'slides.md'
    ? src
    : css).split(/\r?\n/)
  if (data.line > lines.length || data.column > lines[data.line - 1].length + 1)
    return undefined
  return { file: data.file, line: data.line, column: data.column }
}
