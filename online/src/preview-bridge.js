import { createSandbox } from '../vendor/fragment-kit-v0.4.4/vendor/hashbin-sdk-v0.6.0.mjs'

/** A document replacement always destroys the previous author's execution world. */
export function createPreviewBridge({ container, onStatus, onPosition = () => {}, onError = () => {} }) {
  const base = new URL('../', import.meta.url).href
  let sandbox
  let timer
  let revision = 0
  let ready = false

  function stop() {
    revision++
    clearTimeout(timer)
    ready = false
    sandbox?.terminate()
    sandbox = undefined
  }

  function render({ src, css = '', slide = 1, click = 0, dark = false }) {
    if (typeof src !== 'string' || typeof css !== 'string'
      || src.length + css.length > 5 * 1024 * 1024
      || new TextEncoder().encode(src).byteLength + new TextEncoder().encode(css).byteLength > 5 * 1024 * 1024) {
      throw new Error('The document must contain at most 5 MiB of Markdown and CSS')
    }
    stop()
    const current = revision
    onStatus('loading')
    sandbox = createSandbox({
      origin: 'opaque',
      execution: 'frame',
      container,
      base,
      proxy: [new URL('runtime/', base).href],
      source: 'hashbinSandbox.import(\'runtime/sandbox.js\').then(m => m.start()).catch(error => postMessage({protocol:1,type:\'error\',message:String(error)}))',
    })
    sandbox.frame.title = 'Slide preview'
    const fail = (message) => {
      if (current !== revision)
        return
      stop()
      onStatus('error')
      onError(String(message).slice(0, 2000))
    }
    timer = setTimeout(fail, 30000, 'The deck took too long to render. Press Render to try again.')
    sandbox.onerror = event => fail(event.message)
    sandbox.onmessage = ({ data }) => {
      if (current !== revision || !data || data.protocol !== 1)
        return
      if (data.type === 'ready' && !ready) {
        ready = true
        sandbox.postMessage({
          protocol: 1,
          type: 'render',
          src,
          css,
          slide,
          click,
          dark,
        })
      }
      else if (data.type === 'rendered' && ready && data.origin === 'null'
        && Number.isSafeInteger(data.slides) && data.slides > 0 && data.slides <= 10000
        && Array.isArray(data.errors) && data.errors.length === 0) {
        clearTimeout(timer)
        onStatus('rendered', { slides: data.slides })
      }
      else if (data.type === 'position' && ready
        && Number.isSafeInteger(data.slide) && data.slide > 0 && data.slide <= 10000
        && Number.isSafeInteger(data.click) && data.click >= 0 && data.click <= 1000000) {
        onPosition({ slide: data.slide, click: data.click })
      }
      else if (data.type === 'error' && typeof data.message === 'string') {
        fail(data.message)
      }
    }
  }

  return {
    render,
    stop,
    goto(slide, click = 0) {
      if (!Number.isSafeInteger(slide) || slide < 1 || slide > 10000
        || !Number.isSafeInteger(click) || click < 0 || click > 1000000) {
        throw new Error('Invalid preview position')
      }
      if (ready) {
        sandbox.postMessage({
          protocol: 1,
          type: 'goto',
          slide,
          click,
        })
      }
    },
  }
}
