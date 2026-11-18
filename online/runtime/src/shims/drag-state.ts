import type { DragElementState } from '../../../../packages/client/composables/useDragElements'
import { useMagicKeys, useWindowSize } from '@vueuse/core'
import { ref, shallowRef } from 'vue'

// The upstream controls only need this in-memory subset of the client state.
export const activeDragElement = shallowRef<DragElementState | null>(null)
export const magicKeys = useMagicKeys()
export const windowSize = useWindowSize()
export const showEditor = ref(false)
export const isEditorVertical = ref(false)
export const editorWidth = ref(0)
export const editorHeight = ref(0)
export const slideScale = ref(0)
