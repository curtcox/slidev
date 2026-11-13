import { createConfig, createShell, OfflineClient } from '../vendor/fragment-kit-v0.4.4/src/index.js'
import { createSandbox } from '../vendor/fragment-kit-v0.4.4/vendor/hashbin-sdk-v0.6.0.mjs'

const status = document.querySelector('#preview-status')
let sandbox
let timeout
async function main() {
  try {
    const response = await fetch('fragment-kit.config.json')
    if (!response.ok)
      throw new Error('App configuration is unavailable')
    const input = await response.json()
    // The recovery site is the active origin until Phase 8 adds a canonical host.
    const config = createConfig({ ...input, canonicalOrigin: input.canonicalOrigin ?? input.recoveryOrigin })
    const shell = createShell({ config })
    const offline = new OfflineClient({
      onStatus: (result) => {
        shell.offlineStatus.textContent = result.ready
          ? 'Available offline'
          : result.error ?? 'Preparing offline copy'
      },
    })
    void offline.init().catch(() => {
      shell.offlineStatus.textContent = 'Offline copy unavailable'
    })
    const base = new URL('./', location.href).href
    const runtime = new URL('runtime/sandbox.js', base).href
    const cssResponse = await fetch(new URL('runtime/sandbox.css', base))
    if (!cssResponse.ok)
      throw new Error('Slide styles are unavailable')
    const css = await cssResponse.text()
    sandbox = createSandbox({
      origin: 'opaque',
      execution: 'frame',
      container: document.querySelector('#preview'),
      base,
      proxy: [runtime],
      source: 'hashbinSandbox.import(\'runtime/sandbox.js\').then(m => m.start()).catch(error => postMessage({protocol:1,type:\'error\',message:String(error)}))',
    })
    sandbox.frame.title = 'Welcome deck'
    const fail = (message) => {
      clearTimeout(timeout)
      status.textContent = message
      sandbox.terminate()
    }
    timeout = setTimeout(fail, 30_000, 'The welcome deck took too long to load. Reload to try again.')
    sandbox.onerror = event => fail(String(event.message).slice(0, 300))
    sandbox.onmessage = ({ data }) => {
      if (!data || data.protocol !== 1)
        return
      if (data.type === 'ready') {
        sandbox.postMessage({ protocol: 1, type: 'mount', css })
      }
      else if (data.type === 'rendered' && data.slides === 1 && data.origin === 'null') {
        clearTimeout(timeout)
        status.textContent = 'Welcome deck ready'
        document.body.dataset.ready = 'true'
      }
      else if (data.type === 'error' && typeof data.message === 'string') {
        fail(data.message.slice(0, 300))
      }
    }
  }
  catch (error) {
    clearTimeout(timeout)
    sandbox?.terminate()
    status.textContent = String(error.message).slice(0, 300)
  }
}
void main()
