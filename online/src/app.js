import { createConfig } from '../vendor/fragment-kit-v0.4.4/src/core/config.js'
import { OfflineClient } from '../vendor/fragment-kit-v0.4.4/src/offline/client.js'
import { createShell } from '../vendor/fragment-kit-v0.4.4/src/ui/shell.js'
import { createPreviewBridge } from './preview-bridge.js'

const status = document.querySelector('#preview-status')
let preview
async function main() {
  let startOffline
  try {
    const [response, source] = await Promise.all([
      fetch('fragment-kit.config.json'),
      fetch('examples/welcome.md'),
    ])
    if (!response.ok)
      throw new Error('App configuration is unavailable')
    const input = await response.json()
    // The recovery site is the active origin until Phase 8 adds a canonical host.
    const config = createConfig({ ...input, canonicalOrigin: input.canonicalOrigin ?? input.recoveryOrigin })
    const shell = createShell({ config })
    startOffline = () => {
      startOffline = undefined
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
    }
    if (!source.ok)
      throw new Error('The welcome deck is unavailable')
    preview = createPreviewBridge({
      container: document.querySelector('#preview'),
      onStatus(state) {
        document.body.dataset.ready = String(state === 'rendered')
        status.textContent = state === 'rendered'
          ? 'Welcome deck ready'
          : 'Loading the welcome deck…'
        // Start the offline download once it can no longer compete with the
        // welcome slide's runtime, styles and fonts.
        if (state === 'rendered' || state === 'error')
          startOffline?.()
      },
      onError(message) { status.textContent = message },
    })
    preview.render({ src: await source.text() })
    addEventListener('pagehide', () => preview.stop())
  }
  catch (error) {
    startOffline?.()
    preview?.stop()
    status.textContent = String(error.message).slice(0, 300)
  }
}
void main()
