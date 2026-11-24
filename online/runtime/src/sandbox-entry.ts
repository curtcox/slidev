import { flushDragUpdates } from './drag'
import { parseCommand } from './protocol'
import { createRenderer } from './renderer'
import { activeDragElement } from './shims/drag-state'
import { installTouchNavigation } from './touch-navigation'

export { createDeckCompiler } from './compiler'
export { checkDeck } from './compiler/check'
export { rewriteModuleImports } from './compiler/modules'
export { parseCommand } from './protocol'

export async function start(styles: Response) {
  if (globalThis.origin !== 'null')
    throw new Error('Slidev must run in an opaque sandbox')
  // The SDK proxies the stylesheet through the parent's verified offline cache.
  if (!styles.ok)
    throw new Error('Slide styles are unavailable')
  const runtimeCss = await styles.text()
  const style = document.createElement('style')
  style.textContent = runtimeCss
  document.head.append(style)
  const report = (message: Record<string, unknown>) => postMessage({ protocol: 1, ...message })
  const renderer = createRenderer(report, runtimeCss)
  let queue = Promise.resolve()
  const fail = (error: any) => report({
    type: 'error',
    message: String(error?.message ?? error).slice(0, 2000),
    file: error?.file,
    line: error?.line,
    column: error?.column,
    slide: error?.slide,
  })
  addEventListener('message', ({ data }) => {
    // The SDK forwards its private MessagePort into synthetic frame events;
    // native window messages are blocked by the immutable SDK bootstrap.
    try {
      const command = parseCommand(data)
      queue = queue.then(async () => {
        if (command.type === 'render')
          await renderer.render(command)
        else if (command.type === 'export-html')
          await renderer.exportHtml(command)
        else if (command.type === 'goto')
          await renderer.goto(command.slide, command.click)
        else if (command.type === 'next')
          await renderer.next()
        else
          await renderer.prev()
      }).then(() => {}, fail)
    }
    catch (error) { fail(error) }
  })
  addEventListener('resize', renderer.resize)
  addEventListener('pointerup', flushDragUpdates)
  addEventListener('keyup', flushDragUpdates)
  installTouchNavigation({
    next: () => { queue = queue.then(renderer.next).then(() => {}, fail) },
    previous: () => { queue = queue.then(renderer.prev).then(() => {}, fail) },
    isDragging: () => Boolean(activeDragElement.value),
  })
  addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey
      || (event.target as HTMLElement)?.closest('button, a, input, textarea, select, [contenteditable], .monaco-editor')) {
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
