import { computed, ref, watch } from 'vue'
import configs from '../virtual/configs'

const preference = ref(false)
export const isColorSchemaConfigured = computed(() => configs.colorSchema !== 'auto')
export const isDark = computed({
  get: () => isColorSchemaConfigured.value
    ? configs.colorSchema === 'dark'
    : preference.value,
  set: (value: boolean) => { preference.value = value },
})
export function toggleDark(value = !isDark.value) {
  isDark.value = value
  return isDark.value
}

if (typeof document !== 'undefined') {
  watch(isDark, (value) => {
    document.documentElement.classList.toggle('dark', value)
    document.documentElement.classList.toggle('light', !value)
  }, { immediate: true })
}
