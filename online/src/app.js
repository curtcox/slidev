import { inspectDocument } from '../runtime/editor/document.js'
import { createConfig } from '../vendor/fragment-kit-v0.4.4/src/core/config.js'
import { createStorage } from '../vendor/fragment-kit-v0.4.4/src/core/storage.js'
import { LocalDrafts } from '../vendor/fragment-kit-v0.4.4/src/drafts/local-drafts.js'
import { HashBinPanel } from '../vendor/fragment-kit-v0.4.4/src/hashbin/panel.js'
import { HashBinStore } from '../vendor/fragment-kit-v0.4.4/src/hashbin/store.js'
import { OfflineClient } from '../vendor/fragment-kit-v0.4.4/src/offline/client.js'
import { createQrDialog } from '../vendor/fragment-kit-v0.4.4/src/qr/qr-dialog.js'
import { createShareDialog } from '../vendor/fragment-kit-v0.4.4/src/share/share-dialog.js'
import { element } from '../vendor/fragment-kit-v0.4.4/src/ui/dialog.js'
import { createShell } from '../vendor/fragment-kit-v0.4.4/src/ui/shell.js'
import { createEditors } from './editor.js'
import { createFileDialogs } from './files.js'
import { createDocumentLoader, createWorkspaceUrls } from './links.js'
import { createPreviewBridge } from './preview-bridge.js'
import { mountWorkspace } from './workspace.js'

const status = document.querySelector('#preview-status')
async function main() {
  const response = await fetch('fragment-kit.config.json')
  if (!response.ok)
    throw new Error('App configuration is unavailable')
  const input = await response.json()
  const config = createConfig({ ...input, canonicalOrigin: input.canonicalOrigin ?? input.recoveryOrigin })
  let slide = 1
  let total = 0
  let dark = false
  let run = true
  let view
  let timer
  let metadata = []
  let extensions = {}
  let saved
  let loader
  let editors
  let preview
  let share
  let qr
  let qrSave
  let hashbin
  let openDialog
  let downloads
  let renderedSource
  let cursorSlide
  let initialPosition = false
  let hasDocument = false
  const reportError = (message) => {
    status.textContent = message
  }
  const urlState = createWorkspaceUrls({
    config,
    getSlide: () => slide,
  })
  const store = new HashBinStore({ config, type: urlState.documents.adapter })
  const drafts = new LocalDrafts({
    storage: createStorage({ prefix: config.storagePrefix }),
    key: 'draft',
    serialize: value => urlState.documents.serialize(value),
    parse: value => urlState.documents.parse(value),
  })
  const getDocument = () => urlState.documents.normalize({
    src: editors.getSource(),
    slidev: {
      ...extensions,
      css: editors.getCSS(),
    },
  })
  const fingerprint = () => JSON.stringify(getDocument())
  function writeURL() {
    urlState.write(getDocument(), { run, view })
  }
  function rememberLink(href) {
    // Recovery and canonical links open in this workspace, including local QA.
    const incoming = new URL(href)
    const local = new URL(location.href)
    local.search = incoming.search
    local.hash = incoming.hash
    history.pushState(history.state, '', local.href)
  }
  function updateNavigation() {
    document.querySelector('#slide-position').textContent = total
      ? `${slide} / ${total}`
      : 'No preview'
    document.querySelector('#previous-slide').disabled = !total || slide <= 1
    document.querySelector('#next-slide').disabled = !total || slide >= total
    document.querySelector('#present').disabled = !total
    document.querySelector('#dark-mode').disabled = !total
    const note = metadata[slide - 1]?.note ?? ''
    document.querySelector('#slide-notes').textContent = note
    document.querySelector('#notes').hidden = !note
  }
  function inspect() {
    metadata = inspectDocument(editors.getSource())
    updateNavigation()
  }
  function persist() {
    const doc = getDocument()
    drafts.attempt(doc, true)
    writeURL()
  }
  function render() {
    clearTimeout(timer)
    timer = undefined
    try {
      const doc = getDocument()
      renderedSource = doc.src
      inspect()
      editors.annotate('')
      initialPosition = true
      preview.render({
        src: doc.src,
        css: doc.slidev.css,
        slide,
        dark,
      })
    }
    catch (error) {
      reportError(error.message)
      editors.annotate(error.message)
    }
  }
  function changed() {
    loader?.cancel()
    hashbin?.cancelLoad()
    clearTimeout(timer)
    saved = undefined
    qrSave = undefined
    hasDocument = true
    try {
      persist()
      inspect()
      status.textContent = run ? 'Changes saved in this browser. Updating preview…' : 'Changes saved in this browser. Press Render to preview.'
      if (run)
        timer = setTimeout(render, 500)
    }
    catch (error) { reportError(error.message) }
  }
  editors = createEditors({
    markdown: document.querySelector('#markdown-editor'),
    css: document.querySelector('#css-editor'),
    onChange: changed,
    onCursor(row) {
      if (!total || !run || editors.getSource() !== renderedSource)
        return
      const index = metadata.findLastIndex(item => row >= item.start)
      if (index >= 0 && index + 1 !== slide) {
        cursorSlide = index + 1
        preview.goto(index + 1)
      }
    },
  })
  let startOffline
  preview = createPreviewBridge({
    container: document.querySelector('#preview'),
    getSource: editors.getSource,
    onSourceChange(src) {
      editors.replaceSource(src)
      renderedSource = src
      // The sandbox has already applied the move. Do not rerun author code.
      saved = undefined
      try {
        persist()
        inspect()
      }
      catch (error) { reportError(error.message) }
    },
    onStatus(state, detail) {
      document.body.dataset.ready = String(state === 'rendered')
      if (state === 'loading') {
        total = 0
        status.textContent = 'Rendering slides…'
      }
      else if (state === 'rendered') {
        total = detail.slides
        status.textContent = 'Slides ready'
      }
      else {
        total = 0
      }
      updateNavigation()
      if (state === 'rendered' || state === 'error')
        startOffline?.()
    },
    onPosition(position) {
      const fromEditor = cursorSlide === position.slide
      const fromRender = initialPosition
      cursorSlide = undefined
      initialPosition = false
      slide = position.slide
      updateNavigation()
      if (!fromEditor && !fromRender && editors.getSource() === renderedSource)
        editors.reveal(metadata[slide - 1]?.contentStart ?? 0)
      const url = new URL(location.href)
      if (slide > 1)
        url.searchParams.set('slide', String(slide))
      else
        url.searchParams.delete('slide')
      history.replaceState(history.state, '', url)
    },
    onError(message) {
      reportError(message)
      editors.annotate(message, metadata[slide - 1]?.contentStart ?? 0)
    },
    onDragError: reportError,
  })
  function renderAction() {
    run = true
    try {
      writeURL()
    }
    catch (error) { reportError(error.message) }
    render()
  }
  async function present() {
    const frame = document.querySelector('#preview iframe')
    if (!frame || !total)
      return
    try {
      await frame.requestFullscreen()
      frame.focus()
    }
    catch { reportError('Fullscreen is unavailable. Select Slides to present in this window.') }
  }
  const shell = createShell({
    config,
    actions: [
      { label: 'Render', id: 'render', onClick: renderAction },
      { label: 'Present', id: 'present', onClick: present },
      {
        label: 'Share',
        id: 'share',
        onClick: () => safely(() => share.open()),
      },
      {
        label: 'QR',
        id: 'qr',
        extra: true,
        onClick: () => safely(() => qr.open(saved?.fingerprint === fingerprint()
          ? saved.href
          : urlState.build(getDocument(), { run, view }).qrCandidate)),
      },
      {
        label: 'Save to HashBin',
        id: 'save',
        extra: true,
        onClick: () => hashbin.openSave(),
      },
      {
        label: 'Open',
        id: 'open',
        extra: true,
        onClick: () => openDialog.open(),
      },
      {
        label: 'Download',
        id: 'download',
        extra: true,
        onClick: () => downloads.open(),
      },
    ],
  })
  for (const [label, href] of [
    ['Slidev docs', 'https://sli.dev/guide/'],
    ['Syntax', 'https://sli.dev/guide/syntax'],
  ]) {
    for (const container of [
      shell.header.querySelector('.fk-nav'),
      shell.drawer.body,
    ])
      container.append(element('a', label, { href, target: '_blank', rel: 'noopener noreferrer' }))
  }
  const tabs = mountWorkspace({
    onPrevious: () => preview.goto(Math.max(1, slide - 1)),
    onNext: () => preview.goto(Math.min(total, slide + 1)),
    onDark(value) {
      dark = value
      render()
    },
  })
  function safely(work) {
    try {
      return work()
    }
    catch (error) { reportError(error.message) }
  }
  function opened(doc, options = {}) {
    clearTimeout(timer)
    urlState.cancel()
    preview.stop()
    total = 0
    qrSave = undefined
    cursorSlide = undefined
    document.body.dataset.ready = 'false'
    drafts.opened()
    editors.setDocument(doc)
    hasDocument = true
    extensions = { ...doc.slidev }
    slide = options.slide ?? 1
    run = options.run ?? true
    view = options.view
    if (options.kind === 'example')
      writeURL()
    saved = options.savedCid
      ? {
          fingerprint: fingerprint(),
          href: urlState.link(location.href, options.savedCid),
        }
      : undefined
    if (options.savedCid)
      history.replaceState(history.state, '', saved.href)
    if (view) {
      tabs.select(view === 'edit'
        ? 1
        : 0)
    }
    try {
      inspect()
    }
    catch (error) { reportError(error.message) }
    editors.reveal(metadata[slide - 1]?.contentStart ?? 0)
    updateNavigation()
    if (run) {
      render()
    }
    else {
      status.textContent = 'Document opened. Press Render to preview.'
      startOffline?.()
    }
  }
  loader = createDocumentLoader({
    urlState,
    store,
    onOpen: opened,
    onPending() {
      clearTimeout(timer)
      urlState.cancel()
      status.textContent = 'Opening document…'
    },
    onError(message) {
      reportError(message)
      startOffline?.()
    },
  })
  drafts.mount(shell.drawer.body, (doc) => {
    loader.cancel()
    opened(doc, { run: false, view: 'edit' })
    writeURL()
  })
  hashbin = new HashBinPanel({
    store,
    urlState,
    getSnapshot: getDocument,
    onLoad(doc, cid) {
      loader.cancel()
      opened(doc, { savedCid: cid })
      if (!cid)
        writeURL()
    },
    onSaved(cid, current, href) {
      saved = { fingerprint: current, href }
      urlState.cancel()
      history.replaceState(history.state, '', href)
      if (qrSave === current && hashbin.dialog.open) {
        qrSave = undefined
        hashbin.dialog.close()
        qr.open(href)
      }
    },
    container: shell.drawer.body,
  })
  hashbin.dialog.addEventListener('close', () => {
    qrSave = undefined
  })
  share = createShareDialog({
    urlState,
    getSnapshot: getDocument,
    onSave: () => hashbin.openSave(),
  })
  qr = createQrDialog({
    config,
    urlState,
    async onLoad(outcome) {
      const href = outcome.href ?? urlState.link(location.href, outcome.cid)
      if (await loader.open(href))
        rememberLink(href)
    },
    onSave() {
      qrSave = fingerprint()
      qr.dialog.close()
      void hashbin.openSave()
    },
  })
  const files = createFileDialogs({
    config,
    urlState,
    store,
    getDocument,
    async onLink(href) {
      if (!await loader.open(href))
        return false
      rememberLink(href)
      return true
    },
    onImport(doc) {
      loader.cancel()
      opened(doc, { run: false, view: 'edit' })
      writeURL()
    },
    onError: reportError,
  })
  openDialog = files.open
  downloads = files.downloads
  startOffline = () => {
    startOffline = undefined
    const offline = new OfflineClient({
      onStatus(result) {
        shell.offlineStatus.textContent = result.ready
          ? 'Available offline'
          : result.error ?? 'Preparing offline copy'
      },
    })
    void offline.init().catch(() => {
      shell.offlineStatus.textContent = 'Offline copy unavailable'
    })
  }
  let navigatingHref
  const navigate = () => {
    const href = location.href
    // WebKit can deliver both popstate and hashchange for one navigation.
    // A Publish callback consumes its transaction, so resolve it only once.
    if (navigatingHref === href)
      return
    navigatingHref = href
    hashbin.cancelLoad()
    void loader.open(href).finally(() => {
      if (navigatingHref === href)
        navigatingHref = undefined
    })
  }
  addEventListener('hashchange', navigate)
  addEventListener('popstate', navigate)
  addEventListener('pagehide', () => {
    loader.cancel()
    urlState.cancel()
    clearTimeout(timer)
    preview.stop()
  })
  addEventListener('pageshow', (event) => {
    if (event.persisted && hasDocument && run)
      render()
  })
  updateNavigation()
  await loader.open(location.href)
  document.body.dataset.editorReady = 'true'
}
void main().catch((error) => {
  document.body.dataset.ready = 'false'
  status.textContent = String(error.message).slice(0, 2000)
})
