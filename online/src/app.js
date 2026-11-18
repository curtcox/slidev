import { createConfig, createShell, OfflineClient } from '../vendor/fragment-kit-v0.4.4/src/index.js'
import { createPreviewBridge } from './preview-bridge.js'

const status = document.querySelector('#preview-status')
let preview
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
    const source = await fetch('examples/welcome.md')
    if (!source.ok)
      throw new Error('The welcome deck is unavailable')
    preview = createPreviewBridge({
      container: document.querySelector('#preview'),
      onStatus(state) {
        document.body.dataset.ready = String(state === 'rendered')
        status.textContent = state === 'rendered'
          ? 'Welcome deck ready'
          : 'Loading the welcome deck…'
      },
      onError(message) { status.textContent = message },
    })
    preview.render({ src: await source.text() })
    addEventListener('pagehide', () => preview.stop())
  }
  catch (error) {
    preview?.stop()
    status.textContent = String(error.message).slice(0, 300)
  }
}
void main()
