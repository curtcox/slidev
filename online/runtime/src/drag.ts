import type { DragElementsUpdater } from '../../../packages/client/composables/useDragElements'
import type { DragPatch } from './document'
import { dragPatchKey, parseDragPatch } from './document'
import { activeDragElement } from './shims/drag-state'

let report: ((patch: DragPatch) => void) | undefined
const positions = new Map<string, DragPatch>()
let pending: DragPatch | undefined
let timer: ReturnType<typeof setTimeout> | undefined

export function flushDragUpdates() {
  clearTimeout(timer)
  if (pending) {
    report?.(pending)
    pending = undefined
  }
}

export function configureDragUpdates(send: (patch: DragPatch) => void) {
  clearTimeout(timer)
  pending = undefined
  positions.clear()
  activeDragElement.value = null
  report = send
}

function showError(error: unknown) {
  let notice = document.querySelector<HTMLElement>('#online-notices')
  if (!notice) {
    notice = document.createElement('aside')
    notice.id = 'online-notices'
    notice.setAttribute('role', 'status')
    document.body.append(notice)
  }
  notice.textContent = String(error).slice(0, 500)
}

export function useOnlineDragUpdater(slide: number): DragElementsUpdater {
  return (id, position, source, range) => {
    // Initial auto-sizing is layout work, not an author edit.
    if (activeDragElement.value?.dragId !== id)
      return
    try {
      const patch = parseDragPatch({ slide, id, position, source, range })
      const key = dragPatchKey(patch)
      if (!positions.has(key) && positions.size >= 1024)
        throw new Error('Too many drag updates; render again to continue')
      if (positions.get(key)?.position === position)
        return
      if (pending && dragPatchKey(pending) !== key)
        flushDragUpdates()
      else
        clearTimeout(timer)
      positions.set(key, patch)
      pending = patch
      timer = setTimeout(flushDragUpdates, 150)
    }
    catch (error) { showError(error) }
  }
}

export function restoreDragPosition(slide: number, original: unknown, range?: [number, number, number]) {
  if (!range)
    return original
  const patch = [
    ...positions.values(),
  ].find(patch => patch.slide === slide && patch.range.every((n, index) => n === range[index]))
  if (!patch)
    return original
  // Returning coordinates rather than the named ID retains geometry without
  // mutating shared headmatter or recompiling author modules during a drag.
  // The updater keeps the original source kind/name through restoreDragSource.
  return patch.position.replace(/^\[|\]$/g, '').split(',').map(Number)
}

export function restoreDragSource(slide: number, range?: [number, number, number]) {
  return [
    ...positions.values(),
  ].find(patch => patch.slide === slide && range && patch.range.every((n, index) => n === range[index]))
}
