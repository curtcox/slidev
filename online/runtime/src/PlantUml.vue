<script setup lang="ts">
import { computed, inject, onScopeDispose, ref, watch } from 'vue'
import { plantUmlPermission, plantUmlServer } from './plant-uml'

defineOptions({ inheritAttrs: false })
const props = withDefaults(defineProps<{
  code: string
  server?: string
  scale?: number
  alt?: string
}>(), {
  server: plantUmlServer,
  alt: 'PlantUML diagram',
})
const allowed = inject(plantUmlPermission, ref(false))
const invalid = computed(() => props.server !== plantUmlServer
  ? 'Custom PlantUML servers are unavailable online. Use https://www.plantuml.com/plantuml.'
  : !/^[\w-]{1,1000000}$/.test(props.code)
      ? 'The PlantUML diagram source is invalid or too large.'
      : '')
const status = ref('loading')
const attempt = ref(0)
const uri = computed(() => `${plantUmlServer}/svg/${props.code}`)
let timer: ReturnType<typeof setTimeout> | undefined

function load() {
  clearTimeout(timer)
  status.value = 'loading'
  if (allowed.value && !invalid.value)
    timer = setTimeout(() => { status.value = 'error' }, 15000)
}
watch([
  allowed,
  () => props.code,
  () => props.server,
], load, { immediate: true })
onScopeDispose(() => clearTimeout(timer))

function enable(event: MouseEvent) {
  if (event.isTrusted)
    allowed.value = true
}
function retry(event: MouseEvent) {
  if (!event.isTrusted)
    return
  attempt.value++
  load()
}
function loaded(event: Event) {
  if (!(event.target as HTMLImageElement).isConnected)
    return
  clearTimeout(timer)
  status.value = 'loaded'
}
function failed(event: Event) {
  if (!(event.target as HTMLImageElement).isConnected)
    return
  clearTimeout(timer)
  status.value = 'error'
}
</script>

<template>
  <div class="online-plantuml">
    <p v-if="invalid" role="status">
      {{ invalid }}
    </p>
    <template v-else-if="allowed">
      <!-- Set the policy before src: WebKit starts fetching when src is assigned. -->
      <img
        :key="attempt" referrerpolicy="no-referrer" :src="uri" :style="{ scale }" :alt="alt"
        @load="loaded" @error="failed"
      >
      <p v-if="status === 'loading'" role="status">
        Loading PlantUML from plantuml.com…
      </p>
      <p v-if="status === 'error'" role="status">
        PlantUML is unavailable. It needs an internet connection to plantuml.com.
        <button type="button" @click="retry">
          Retry diagram
        </button>
      </p>
    </template>
    <template v-else>
      <p role="status">
        PlantUML is off. Enabling it sends this deck’s diagram text to plantuml.com.
      </p>
      <button type="button" @click="enable">
        Enable PlantUML for this deck
      </button>
    </template>
    <slot v-if="!allowed || invalid || status === 'error'" />
  </div>
</template>

<style scoped>
button {
  min-height: 40px;
  padding: 8px 12px;
  font: 16px/1.4 system-ui;
  border: 1px solid currentColor;
  border-radius: 4px;
}
</style>
