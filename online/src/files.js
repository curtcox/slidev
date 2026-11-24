import { isAppURL } from '../vendor/fragment-kit-v0.4.4/src/core/config.js'
import { createDialog, download, element } from '../vendor/fragment-kit-v0.4.4/src/ui/dialog.js'
import { exportPrintableHtml } from './export-html.js'
import { deckZip } from './zip.js'

export function createFileDialogs({ config, urlState, store, getDocument, getDark = () => false, onLink, onImport, onError }) {
  const open = createDialog('Open a deck', { id: 'open-dialog' })
  const message = element('p', '', { role: 'status' })
  const fail = (error) => {
    message.textContent = error.message
    onError(error.message)
  }
  const link = element('input', null, { 'type': 'text', 'aria-label': 'Deck link', 'placeholder': 'Slidev Online link or HashBin CID' })
  const load = element('button', 'Open link', { type: 'button' })
  load.onclick = async () => {
    try {
      const cid = store.cid(link.value)
      const input = cid
        ? urlState.link(location.href, cid)
        : link.value.trim()
      const current = new URL(location.href)
      current.search = current.hash = ''
      if (!cid && !isAppURL(input, config) && !isAppURL(input, { canonicalOrigin: current.href, recoveryOrigin: current.href }))
        throw new Error('Enter a Slidev Online link or a HashBin CID.')
      message.textContent = 'Opening document…'
      if (await onLink(input))
        open.dialog.close()
      else
        message.textContent = 'The document could not be opened. Your current work was kept.'
    }
    catch (error) { fail(error) }
  }
  const file = element('input', null, { 'type': 'file', 'accept': '.md,.markdown,.css,.json,text/markdown,text/css,application/json', 'aria-label': 'Open Markdown, CSS or saved document' })
  const fileLabel = element('label', 'Open file')
  fileLabel.append(file)
  file.onchange = async () => {
    const selected = file.files[0]
    file.value = ''
    if (!selected)
      return
    try {
      if (selected.size > config.maxBytes)
        throw new Error('The file exceeds the 5 MiB limit')
      const snapshot = getDocument()
      const content = await selected.text()
      if (JSON.stringify(snapshot) !== JSON.stringify(getDocument()))
        throw new Error('The document changed while the file was opening. Open the file again.')
      const doc = selected.name.toLowerCase().endsWith('.css')
        ? urlState.documents.normalize({
            src: snapshot.src,
            slidev: { ...snapshot.slidev, css: content },
          })
        : selected.name.toLowerCase().endsWith('.json')
          ? urlState.documents.parse(content)
          : urlState.documents.normalize({ src: content })
      onImport(doc)
      open.dialog.close()
    }
    catch (error) { fail(error) }
  }
  open.body.append(link, load, fileLabel, message)
  const downloads = createDialog('Download deck', { id: 'download-dialog' })
  const zip = element('button', 'ZIP (slides.md and style.css)', { type: 'button' })
  zip.onclick = () => {
    try {
      download(deckZip(getDocument()), 'slides.zip')
    }
    catch (error) { onError(error.message) }
  }
  downloads.body.append(zip)
  for (const [label, name, type, content] of [
    [
      'Markdown',
      'slides.md',
      'text/markdown',
      () => getDocument().src,
    ],
    [
      'CSS',
      'style.css',
      'text/css',
      () => getDocument().slidev.css,
    ],
    [
      'Saved document (Markdown and CSS)',
      'slides.json',
      'application/json',
      () => urlState.documents.serialize(getDocument()),
    ],
  ]) {
    const button = element('button', label, { type: 'button' })
    button.onclick = () => {
      try {
        download(new Blob([
          content(),
        ], { type }), name)
      }
      catch (error) { onError(error.message) }
    }
    downloads.body.append(button)
  }
  const printNote = element('p', 'Browser sandbox isolation blocks direct printing from the preview. Download standalone HTML, open it in a browser tab, and choose Print → Save as PDF (with Background graphics enabled).')
  const notesCheckbox = element('input', null, { type: 'checkbox', id: 'export-notes' })
  const notesLabel = element('label', 'Include speaker notes')
  notesLabel.prepend(notesCheckbox)
  const htmlStatus = element('p', '', { id: 'export-html-status', role: 'status' })
  const htmlButton = element('button', 'Printable HTML (Print / PDF)', { type: 'button', id: 'download-html' })
  htmlButton.onclick = async () => {
    htmlButton.disabled = true
    htmlStatus.textContent = 'Building printable HTML…'
    try {
      const doc = getDocument()
      const includeNotes = notesCheckbox.checked
      const result = await exportPrintableHtml({
        src: doc.src,
        css: doc.slidev.css,
        dark: getDark(),
        notes: includeNotes,
      })
      download(
        new Blob([result.html], { type: 'text/html; charset=utf-8' }),
        includeNotes ? 'slides-with-notes.html' : 'slides.html',
      )
      htmlStatus.textContent = `Downloaded printable HTML (${result.slides} slide${result.slides === 1
        ? ''
        : 's'}). Open it and choose Print → Save as PDF.`
    }
    catch (error) {
      htmlStatus.textContent = error.message
      onError(error.message)
    }
    finally {
      htmlButton.disabled = false
    }
  }
  downloads.body.append(printNote, notesLabel, htmlButton, htmlStatus)
  return { open, downloads }
}
