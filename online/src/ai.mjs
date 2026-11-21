import { createAi, createAiSettings, createAskPanel, createCompareModels } from '../vendor/fragment-kit-v0.4.4/src/ai/index.js'
import { createStorage } from '../vendor/fragment-kit-v0.4.4/src/core/storage.js'
import { createDialog, element } from '../vendor/fragment-kit-v0.4.4/src/ui/dialog.js'
import { checkSlidevProposal } from './ai-check.js'
import { slidevAiDocument } from './ai-type.js'

/** Loaded only by an AI action. The kit owns provider keys and proposal history. */
export async function mountAi({ config, getSnapshot, getFingerprint, onApply, urlState }) {
  const stylesheet = element('link', null, {
    rel: 'stylesheet',
    href: new URL('../vendor/fragment-kit-v0.4.4/src/ai/ui/ai.css', import.meta.url).href,
  })
  document.head.append(stylesheet)
  const storage = createStorage({ prefix: config.storagePrefix })
  const ai = await createAi({ config, type: slidevAiDocument, storage })
  let check
  function cancelCheck() {
    check?.abort()
    check = undefined
  }
  const type = {
    ...slidevAiDocument,
    ai: {
      ...slidevAiDocument.ai,
      renderProposal({ document: proposal, container }) {
        cancelCheck()
        const button = element('button', 'Check proposal', { type: 'button' })
        const status = element('p', 'Check compiles every slide without running its code. It does not test runtime behavior.', { role: 'status', id: 'ai-check-status' })
        button.onclick = async () => {
          cancelCheck()
          const controller = new AbortController()
          check = controller
          button.disabled = true
          status.textContent = 'Checking the proposal in a separate sandbox…'
          try {
            const result = await checkSlidevProposal({ document: proposal, signal: controller.signal })
            if (controller.signal.aborted)
              return
            status.textContent = result.errors.length
              ? result.errors.map(error => `${error.slide
                  ? `Slide ${error.slide}, `
                  : ''}${error.file ?? 'slides.md'}${error.line
                  ? `:${error.line}`
                  : ''}: ${error.message}`).join('\n')
              : `All ${result.slides} slides compile. The editor and live preview have not changed.`
          }
          catch (error) {
            if (!controller.signal.aborted)
              status.textContent = error.message
          }
          finally { button.disabled = false }
        }
        container.append(button, status)
      },
    },
  }
  const askDialog = createDialog('Ask AI', { id: 'ai-ask-dialog' })
  const options = {
    ai,
    type,
    // Forward-compatible extension data stays outside model prompts and edits.
    getSnapshot() {
      const doc = getSnapshot()
      return {
        src: doc.src,
        slidev: { css: doc.slidev.css },
      }
    },
    getFingerprint,
    onApply,
    urlState,
  }
  const ask = createAskPanel({ ...options, container: askDialog.body })
  askDialog.dialog.addEventListener('close', () => {
    ask.cancel()
    cancelCheck()
  })
  const settings = createAiSettings({
    ai,
    onChange: () => ask.refreshModels(),
  })
  let comparison
  function cancel() {
    ask.cancel()
    cancelCheck()
    // Closing a comparison aborts its requests and invalidates its UI.
    comparison?.destroy()
    comparison = undefined
  }
  return {
    ask() {
      askDialog.open()
      ask.open()
    },
    settings() { settings.button.click() },
    async compare() {
      if (!comparison) {
        const response = await fetch(new URL('../ai-suite.json', import.meta.url))
        if (!response.ok)
          throw new Error('The comparison tasks are unavailable. Try again.')
        comparison = createCompareModels({ ...options, suite: await response.json(), storage })
      }
      comparison.button.click()
    },
    refresh: () => ask.refreshSnapshot(),
    cancel,
    destroy() {
      cancel()
      askDialog.destroy()
      settings.destroy()
      ai.destroy()
      stylesheet.remove()
    },
  }
}
