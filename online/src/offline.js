import { OfflineClient } from '../vendor/fragment-kit-v0.4.4/src/offline/client.js'
import { element } from '../vendor/fragment-kit-v0.4.4/src/ui/dialog.js'

export function mountOffline({ container, statusNode, onBeforeActivate = () => {} }) {
  const repairButton = element('button', 'Repair offline copy', {
    type: 'button',
    id: 'offline-repair',
  })
  const updateButton = element('button', 'Apply update', {
    type: 'button',
    id: 'offline-update',
    hidden: true,
  })
  const updateStatus = element('p', '', {
    id: 'offline-update-status',
    role: 'status',
  })
  container.append(repairButton, updateButton, updateStatus)

  let client
  let initPromise
  let repairing = false
  let activating = false

  function updateOfflineStatus(result) {
    statusNode.textContent = result.ready
      ? 'Available offline'
      : result.error ?? (result.unsupported ? 'Offline copy unavailable' : 'Preparing offline copy')
  }

  function ensureClient() {
    if (!client) {
      client = new OfflineClient({
        onStatus: updateOfflineStatus,
        onUpdate() {
          activating = false
          updateButton.hidden = false
          updateButton.disabled = false
          updateStatus.textContent = 'A new version is ready. Apply update keeps your current slides.'
        },
      })
    }
    return client
  }

  function start() {
    if (initPromise)
      return initPromise
    const instance = ensureClient()
    initPromise = instance.init().then((result) => {
      if (!result?.ready && !instance.registration?.active)
        initPromise = undefined
      return result
    }).catch((error) => {
      initPromise = undefined
      statusNode.textContent = error?.message || 'Offline copy unavailable'
      return { ready: false, error: error?.message }
    })
    return initPromise
  }

  repairButton.onclick = async () => {
    if (repairing)
      return
    repairing = true
    repairButton.disabled = true
    statusNode.textContent = 'Repairing offline copy…'
    try {
      await start()
      await ensureClient().repair()
    }
    catch (error) {
      statusNode.textContent = error?.message || 'Offline repair failed.'
    }
    finally {
      repairing = false
      repairButton.disabled = false
    }
  }

  updateButton.onclick = () => {
    if (activating)
      return
    const instance = ensureClient()
    if (!instance.registration?.waiting) {
      updateButton.hidden = true
      return
    }
    activating = true
    updateButton.disabled = true
    try {
      onBeforeActivate()
    }
    catch {}
    const sw = globalThis.navigator?.serviceWorker
    if (sw) {
      sw.addEventListener('controllerchange', () => {
        activating = false
        updateButton.hidden = true
        updateStatus.textContent = 'Update applied. Your current slides are preserved; reload when ready.'
      }, { once: true })
    }
    else {
      activating = false
      updateButton.hidden = true
    }
    instance.activateUpdate()
  }

  return {
    start,
    get client() {
      return client
    },
  }
}
