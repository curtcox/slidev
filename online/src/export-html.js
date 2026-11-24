import { createSandbox } from '../vendor/fragment-kit-v0.4.4/vendor/hashbin-sdk-v0.6.0.mjs'
import { slidevDocument } from './document-type.js'
import { fetchRuntimeAsset } from './runtime-assets.js'

const MAX_EXPORT_BYTES = 32 * 1024 * 1024

/**
 * Renders every visible slide inside a disposable opaque sandbox and returns
 * a self-contained, script-free printable HTML document.
 */
export function exportPrintableHtml({ src, css = '', dark = false, notes = false, timeout = 60000 }) {
  slidevDocument.normalize({
    src,
    slidev: { css },
  })
  const base = new URL('../', import.meta.url).href
  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:980px;height:552px;opacity:0;pointer-events:none;overflow:hidden'
  document.body.append(host)

  return new Promise((resolve, reject) => {
    let settled = false
    let sandbox
    let timer
    const finish = (fn, value) => {
      if (settled)
        return
      settled = true
      clearTimeout(timer)
      sandbox?.terminate()
      host.remove()
      fn(value)
    }
    timer = setTimeout(
      () => finish(reject, new Error('Exporting printable HTML timed out. Try again.')),
      timeout,
    )
    sandbox = createSandbox({
      origin: 'opaque',
      execution: 'frame',
      container: host,
      base,
      proxy: [new URL('runtime/', base).href],
      fetch: fetchRuntimeAsset,
      source: `
        Promise.all([hashbinSandbox.import('runtime/sandbox.js'), fetch('runtime/sandbox.css')])
          .then(([runtime, styles]) => runtime.start(styles))
          .catch(error => postMessage({protocol:1,type:'error',message:String(error)}))
      `,
    })
    sandbox.onerror = event => finish(reject, new Error(String(event.message || 'HTML export failed').slice(0, 2000)))
    sandbox.onmessage = ({ data }) => {
      if (!data || data.protocol !== 1)
        return
      if (data.type === 'ready') {
        sandbox.postMessage({
          protocol: 1,
          type: 'export-html',
          src,
          css,
          dark: Boolean(dark),
          notes: Boolean(notes),
        })
      }
      else if (data.type === 'exported-html' && data.origin === 'null' && typeof data.html === 'string') {
        if (new TextEncoder().encode(data.html).byteLength > MAX_EXPORT_BYTES) {
          finish(reject, new Error('Exported HTML exceeds the 32 MiB limit'))
          return
        }
        finish(resolve, { html: data.html, slides: data.slides })
      }
      else if (data.type === 'error' && typeof data.message === 'string') {
        finish(reject, new Error(data.message.slice(0, 2000)))
      }
    }
  })
}
