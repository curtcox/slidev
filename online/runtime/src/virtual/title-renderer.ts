import type { Component } from 'vue'
import { defineComponent, h, shallowRef } from 'vue'

export const titleRenderer = shallowRef<Component>()

export default defineComponent({
  props: {
    no: [Number, String],
  },
  setup: props => () => titleRenderer.value
    ? h(titleRenderer.value, { no: props.no })
    : null,
})
