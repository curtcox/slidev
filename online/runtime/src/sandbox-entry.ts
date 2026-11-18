import { flushDragUpdates } from './drag'
import { parseCommand } from './protocol'
import { createRenderer } from './renderer'
import { activeDragElement } from './shims/drag-state'

export { createDeckCompiler } from './compiler'
export { rewriteModuleImports } from './compiler/modules'
export { parseCommand } from './protocol'

export async function start() {
  if (globalThis.origin !== 'null')
    throw new Error('Slidev must run in an opaque sandbox')
  // The SDK proxies this request through the parent's verified offline cache.
  const response = await fetch('runtime/sandbox.css')
  if (!response.ok)
    throw new Error('Slide styles are unavailable')
  const style = document.createElement('style')
  style.textContent = await response.text()
  document.head.append(style)
  const report = (message: Record<string, unknown>) => postMessage({ protocol: 1, ...message })
  const renderer = createRenderer(report)
  let queue = Promise.resolve()
  const fail = (error: unknown) => report({
    type: 'error',
    message: String(error).slice(0, 2000),
  })
  addEventListener('message', ({ data }) => {
    // The SDK forwards its private MessagePort into synthetic frame events;
    // native window messages are blocked by the immutable SDK bootstrap.
    try {
      const command = parseCommand(data)
      queue = queue.then(async () => {
        if (command.type === 'render')
          await renderer.render(command)
        else
          await renderer.goto(command.slide, command.click)
      }).then(() => {}, fail)
    }
    catch (error) { fail(error) }
  })
  addEventListener('resize', renderer.resize)
  addEventListener('pointerup', flushDragUpdates)
  addEventListener('keyup', flushDragUpdates)
  addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey
      || (event.target as HTMLElement)?.closest('button, a, input, textarea, select, [contenteditable]')) {
      return
    }
    if (activeDragElement.value) {
      if (event.key === 'Escape') {
        flushDragUpdates()
        activeDragElement.value.stopDragging()
      }
      return
    }
    if ([
      'ArrowRight',
      'ArrowDown',
      'PageDown',
      ' ',
    ].includes(event.key)) {
      event.preventDefault()
      queue = queue.then(renderer.next).then(() => {}, fail)
    }
    else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(event.key)) {
      event.preventDefault()
      queue = queue.then(renderer.prev).then(() => {}, fail)
    }
  })
  report({ type: 'ready' })
}
