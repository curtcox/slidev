import type { SlideRoute } from '@slidev/types'
import { createApp, h, nextTick, reactive } from 'vue'
import { createFixedClicks } from '../../../packages/client/composables/useClicks'
import { injectionSlidevContext } from '../../../packages/client/constants'
import SlideWrapper from '../../../packages/client/internals/SlideWrapper.vue'
import Welcome from './Welcome.vue'
import './style.css'

// Phase 1 mounts a trusted welcome deck. Author compilation belongs to Phase 2.
export function start() {
  if (globalThis.origin !== 'null')
    throw new Error('Slidev must run in an opaque sandbox')
  const route = {
    no: 1,
    component: Welcome,
    meta: {
      slide: { no: 1, frontmatter: {} },
    },
  } as SlideRoute
  const app = createApp({
    render: () => h(SlideWrapper, {
      route,
      clicksContext: createFixedClicks(route),
    }),
  })
  app.provide(injectionSlidevContext, reactive({
    nav: {
      next() {},
      openInEditor() {},
    },
  }) as any)
  let mounted = false
  addEventListener('message', async ({ data }) => {
    if (mounted || data?.protocol !== 1 || data.type !== 'mount' || typeof data.css !== 'string' || data.css.length > 1_000_000)
      return
    mounted = true
    const style = document.createElement('style')
    style.textContent = data.css
    const container = document.createElement('div')
    container.id = 'app'
    document.head.append(style)
    document.body.append(container)
    app.mount(container)
    await nextTick()
    postMessage({
      protocol: 1,
      type: 'rendered',
      slides: 1,
      origin: globalThis.origin,
    })
  })
  postMessage({ protocol: 1, type: 'ready' })
}
