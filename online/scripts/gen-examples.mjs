import fs from 'node:fs/promises'
import process from 'node:process'
import { parseSync } from '@slidev/parser/core'
import { slidevDocument } from '../src/document-type.js'

const root = new URL('../', import.meta.url)
const examples = []
for (const file of (await fs.readdir(new URL('examples/', root))).filter(name => name.endsWith('.md')).sort()) {
  const id = file.slice(0, -3)
  if (!/^[a-z0-9-]+$/.test(id))
    throw new Error(`Invalid example filename: ${file}`)
  const src = await fs.readFile(new URL(`examples/${file}`, root), 'utf8')
  const { slides } = parseSync(src, file)
  const head = slides[0]?.frontmatter
  const title = head?.title ?? src.match(/^# (.+)$/m)?.[1]
  const description = head?.info ?? 'Write, share, and present your ideas in the browser.'
  const tags = head?.onlineTags ?? ['starter']
  if (typeof title !== 'string' || typeof description !== 'string' || !Array.isArray(tags) || tags.some(tag => typeof tag !== 'string'))
    throw new Error(`Invalid catalog metadata: ${file}`)
  examples.push({
    id,
    title,
    description,
    tags,
    cover: `gallery/${id}.png`,
    document: slidevDocument.normalize({ src }),
  })
}
for (const [file, source] of [
  ['src/examples.js', `export const examples = ${JSON.stringify(examples, null, 2)}`],
  ['src/example-ids.js', `export const exampleIds = ${JSON.stringify(examples.map(example => example.id), null, 2)}`],
]) {
  const generated = `/* eslint-disable style/quotes, style/comma-dangle${file === 'src/examples.js'
    ? ', style/quote-props'
    : ''} */
// Generated from examples/*.md by npm run examples.\n${source}\n`
  const target = new URL(file, root)
  if (process.argv.includes('--check')) {
    if (await fs.readFile(target, 'utf8').catch(() => '') !== generated)
      throw new Error(`Stale ${file}. Run npm run examples.`)
  }
  else {
    await fs.writeFile(target, generated)
  }
}
console.log(`${examples.length} gallery examples are current`)
