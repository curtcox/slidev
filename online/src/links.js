import { readResponse, text } from '../vendor/fragment-kit-v0.4.4/src/core/bytes.js'
import { createUrlState } from '../vendor/fragment-kit-v0.4.4/src/core/url-state.js'
import { slidevDocument } from './document-type.js'

// Kit removes adapter settings when rebuilding a document URL. Position belongs
// to this workspace, so apply it to both shared links and delayed history writes.
export function createWorkspaceUrls({ config, getSlide, history = globalThis.history, location = globalThis.location, ...options }) {
  function position(href, slide = getSlide()) {
    const url = new URL(href)
    if (slide > 1)
      url.searchParams.set('slide', String(slide))
    else
      url.searchParams.delete('slide')
    return url.href
  }
  const state = createUrlState({
    config,
    type: slidevDocument,
    ...options,
    location,
    history: {
      replaceState: (data, unused, href) => history.replaceState(data, unused, position(href)),
      pushState: (data, unused, href) => history.pushState(data, unused, position(href)),
      get state() { return history.state },
    },
  })
  return {
    ...state,
    build(doc, opts = {}) {
      return Object.fromEntries(Object.entries(state.build(doc, opts)).map(([key, href]) => [
        key,
        position(href, opts.slide),
      ]))
    },
    link: (input, cid) => position(state.link(input, cid)),
  }
}

export function readLinkOptions(state) {
  const raw = state.settings.slide
  if (raw !== undefined && (!/^[1-9]\d{0,4}$/.test(raw) || Number(raw) > 10000))
    throw new Error('The starting slide must be between 1 and 10000')
  if (state.view !== undefined && !['edit', 'preview', 'present'].includes(state.view))
    throw new Error('The requested view must be edit, preview or present')
  return {
    run: state.run,
    view: state.view,
    slide: Number(raw ?? 1),
  }
}

/** Resolve first, then replace: a failed or stale load cannot touch the editor. */
export function createDocumentLoader({ urlState, store, onOpen, onError, onPending = () => {}, fetchSource = globalThis.fetch, timeout = 20000 }) {
  let revision = 0
  let controller
  function cancel() {
    revision++
    controller?.abort()
  }
  async function open(input) {
    cancel()
    const current = revision
    const active = new AbortController()
    controller = active
    const signal = active.signal
    let timer
    onPending()
    try {
      const state = urlState.parse(input)
      const options = readLinkOptions(state)
      let savedCid
      const work = async () => {
        if (state.kind === 'source')
          return state.doc
        if (state.kind === 'cid') {
          savedCid = state.cid
          return store.load(state.cid)
        }
        if (state.kind === 'publish') {
          const result = await store.published(state.hash)
          if (result.error)
            throw new Error(result.error)
          savedCid = result.cid
          return result.snapshot ?? store.load(result.cid)
        }
        // Only catalog IDs are allowed; never turn a query into an arbitrary fetch.
        if (state.kind === 'example' && state.id !== 'welcome')
          throw new Error('That example is unavailable. Open the gallery to choose a deck.')
        const response = await fetchSource('examples/welcome.md', { signal })
        if (!response.ok)
          throw new Error('The welcome deck is unavailable')
        return {
          src: text(await readResponse(response)),
        }
      }
      const doc = await Promise.race([
        work(),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            active.abort()
            reject(new Error('The document took too long to load. Try opening the link again.'))
          }, timeout)
        }),
      ])
      if (current !== revision)
        return false
      onOpen(urlState.documents.normalize(doc), { ...options, savedCid, kind: state.kind })
      return true
    }
    catch (error) {
      if (current === revision)
        onError(String(error.message).slice(0, 2000))
      return false
    }
    finally {
      clearTimeout(timer)
    }
  }
  return { open, cancel }
}
