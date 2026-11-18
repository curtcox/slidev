export function frontmatterPlugin() {
  throw new Error('Online parses frontmatter with @slidev/parser before Markdown compilation')
}
