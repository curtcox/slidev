import { validateDeckSource } from '../runtime/editor/document.js'
import { slidevDocument } from './document-type.js'

export const slidevAiDocument = Object.freeze({
  ...slidevDocument,
  normalize(value) {
    const doc = slidevDocument.normalize(value)
    if (Object.keys(doc.slidev).some(key => key !== 'css'))
      throw new Error('AI can change only Markdown and CSS')
    return doc
  },
  ai: Object.freeze({
    describe: 'Slidev deck. src is Slidev Markdown: optional YAML headmatter, slides separated by --- lines, per-slide frontmatter and <!-- notes -->. slidev.css is global CSS. To fill an empty stylesheet, use settings: {slidev: {css: "the complete CSS"}}. Preserve unrelated slides, frontmatter keys and notes. Supported: five pinned themes (default, seriph, apple-basic, bricks, shibainu), layouts, slots, click reveals, motion, highlighting, lazy Monaco ({monaco}, {monaco-diff}, {monaco-run} with ATA disabled), KaTeX, Mermaid, scoped styles, per-slide script setup and built-in components. No file imports, custom component files, npm downloads or twoslash. See docs/supported.html.',
    output: 'edits',
    paths: Object.freeze(['/src', '/slidev/css']),
    settingsKeys: Object.freeze(['slidev']),
    validate: doc => validateDeckSource(doc.src),
    checks: Object.freeze({
      async compiles({ document, signal }) {
        const { checkSlidevProposal } = await import('./ai-check.js')
        return (await checkSlidevProposal({ document, signal })).errors.length === 0
      },
    }),
  }),
})
