const interactive = 'button, a, input, textarea, select, [contenteditable], [role="button"], [role="link"], video, audio, iframe, canvas, pre, [data-drag-id], .monaco-editor'

/** Touch gestures belong to the frame and use the same click steps as keys. */
export function installTouchNavigation({ next, previous, isDragging }: {
  next: () => void
  previous: () => void
  isDragging: () => boolean
}) {
  let start: { id: number, x: number, y: number, time: number } | undefined
  const controller = new AbortController()
  const eligible = (event: PointerEvent) => !event.defaultPrevented && !isDragging()
    && event.target instanceof Element && Boolean(event.target.closest('#app'))
    && !event.target.closest(interactive)
  addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'touch')
      return
    // A second finger cancels this gesture; pinch and long presses stay native.
    if (!event.isPrimary || !eligible(event)) {
      start = undefined
      return
    }
    start = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      time: event.timeStamp,
    }
  }, { signal: controller.signal })
  addEventListener('pointercancel', () => {
    start = undefined
  }, { signal: controller.signal })
  addEventListener('pointerup', (event) => {
    const initial = start
    start = undefined
    if (!initial || event.pointerId !== initial.id || !eligible(event)
      || event.timeStamp - initial.time > 700 || getSelection()?.isCollapsed === false) {
      return
    }
    const dx = event.clientX - initial.x
    const dy = event.clientY - initial.y
    if (Math.abs(dx) >= 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0)
        next()
      else
        previous()
    }
    else if (Math.hypot(dx, dy) < 12) {
      if (event.clientX < innerWidth / 3)
        previous()
      else
        next()
    }
  }, { signal: controller.signal })
  return () => controller.abort()
}
