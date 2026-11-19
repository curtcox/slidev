import { createSandbox } from '../vendor/fragment-kit-v0.4.4/vendor/hashbin-sdk-v0.6.0.mjs'
import { slidevDocument } from './document-type.js'
import { fetchRuntimeAsset } from './runtime-assets.js'

/** One disposable opaque frame per check; the live preview is never touched. */
export function checkSlidevProposal({ document: input, signal }) {
  const doc = slidevDocument.normalize(input)
  signal?.throwIfAborted()
  const base = new URL('../', import.meta.url).href
  return new Promise((resolve, reject) => {
    const host = document.createElement('div')
    host.hidden = true
    host.dataset.aiCheck = ''
    document.body.append(host)
    let sandbox
    let timer
    let abort
    const finish = (error, result) => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      sandbox?.terminate()
      host.remove()
      error
        ? reject(error)
        : resolve(result)
    }
    abort = () => finish(signal.reason ?? new Error('Proposal check cancelled'))
    timer = setTimeout(() => finish(new Error('The proposal check took too long. Try again.')), 30000)
    signal?.addEventListener('abort', abort, { once: true })
    try {
      sandbox = createSandbox({
        origin: 'opaque',
        execution: 'frame',
        container: host,
        base,
        proxy: [new URL('runtime/', base).href],
        fetch: fetchRuntimeAsset,
        source: `
          const runtime = await hashbinSandbox.import('runtime/sandbox.js');
          addEventListener('message', async ({data}) => {
            if (data?.protocol !== 1 || data.type !== 'check') return;
            try {
              const result = await runtime.checkDeck(data.src, data.css);
              postMessage({protocol:1,type:'checked',origin:globalThis.origin,...result});
            } catch (error) {
              postMessage({protocol:1,type:'error',message:String(error?.message ?? error)});
            }
          });
          postMessage({protocol:1,type:'ready'});
        `,
      })
      sandbox.frame.title = 'AI proposal compilation check'
      let sent = false
      sandbox.onerror = event => finish(new Error(String(event.message).slice(0, 2000)))
      sandbox.onmessage = ({ data }) => {
        if (!data || data.protocol !== 1)
          return
        if (data.type === 'ready' && !sent) {
          sent = true
          sandbox.postMessage({
            protocol: 1,
            type: 'check',
            src: doc.src,
            css: doc.slidev.css,
          })
        }
        else if (data.type === 'checked' && sent && data.origin === 'null'
          && Number.isSafeInteger(data.slides) && data.slides >= 0 && data.slides <= 10000
          && Array.isArray(data.errors) && data.errors.length <= 100
          && data.errors.every(error => error && typeof error.message === 'string' && error.message.length <= 2000)) {
          finish(null, data)
        }
        else if (data.type === 'error' && typeof data.message === 'string') {
          finish(new Error(data.message.slice(0, 2000)))
        }
      }
    }
    catch (error) { finish(error) }
  })
}
