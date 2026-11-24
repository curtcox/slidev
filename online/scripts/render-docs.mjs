import fs from 'node:fs/promises'
import process from 'node:process'
import MarkdownIt from 'markdown-exit'

const root = new URL('../docs/', import.meta.url)
const markdown = new MarkdownIt({ html: false })
const escape = value => markdown.utils.escapeHtml(value)
const defaultLink = markdown.renderer.rules.link_open
markdown.renderer.rules.link_open = (tokens, index, ...args) => {
  const token = tokens[index]
  const href = token.attrGet('href')
  if (href && !/^(?:[a-z]+:|\/\/)/i.test(href))
    token.attrSet('href', href.replace(/\.md(?=$|[?#])/, '.html'))
  return defaultLink
    ? defaultLink(tokens, index, ...args)
    : markdown.renderer.renderToken(tokens, index, args[0])
}
for (const name of (await fs.readdir(root)).filter(name => name.endsWith('.md')).sort()) {
  const source = await fs.readFile(new URL(name, root), 'utf8')
  const title = source.match(/^# (.+)$/m)?.[1]
  if (!title)
    throw new Error(`Missing title: ${name}`)
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="referrer" content="no-referrer">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'">
  <title>${escape(title)} · Slidev Online</title>
  <link rel="icon" href="../icons/icon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="../style.css">
  <link rel="stylesheet" href="../docs.css">
</head>
<body>
  <nav aria-label="Site"><a href="../">Editor</a><a href="../gallery.html">Gallery</a><a href="index.html">Online docs</a></nav>
  <main class="online-docs">
<!-- Generated from ${name} by npm run docs. -->
${markdown.render(source)}  </main>
</body>
</html>
`
  const target = new URL(name.replace(/\.md$/, '.html'), root)
  if (process.argv.includes('--check')) {
    if (await fs.readFile(target, 'utf8').catch(() => '') !== html)
      throw new Error(`Stale docs: ${name}. Run npm run docs.`)
  }
  else {
    await fs.writeFile(target, html)
  }
}
console.log('Online documentation is current')
