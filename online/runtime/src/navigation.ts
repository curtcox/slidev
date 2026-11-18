import type { ClicksContext } from '@slidev/types'
import type { Ref } from 'vue'
import { computed, ref } from 'vue'
import { useTocTree } from '../../../packages/client/composables/useTocTree'
import { getCurrentTransition } from '../../../packages/client/logic/transition'
import { slides } from './virtual/slides'

let activeNavigation: ReturnType<typeof createNavigation> | undefined

export function createNavigation(
  position: Ref<number>,
  clicks: Ref<ClicksContext | undefined>,
  navigate: (slide: number, click?: number) => Promise<unknown>,
  next: () => Promise<void>,
  prev: () => Promise<void>,
) {
  const currentSlideRoute = computed(() => slides.value[position.value - 1])
  const currentSlideNo = computed(() => position.value)
  const currentClicks = computed(() => clicks.value?.current ?? 0)
  const total = computed(() => slides.value.length)
  const navDirection = ref(0)
  const clicksDirection = ref(0)
  const isPrintMode = ref(false)
  const isPresenter = ref(false)
  const prevRoute = computed(() => slides.value[Math.max(0, position.value - 2)])
  const nextRoute = computed(() => slides.value[Math.min(total.value - 1, position.value)])

  async function go(no: number | string, click = 0) {
    const name = String(no).replace(/^\/?(?:presenter\/)?/, '')
    const route = slides.value.find(route => String(route.no) === name || route.meta.slide.frontmatter.routeAlias === name)
    if (!route)
      throw new Error(`Slide ${name} is unavailable`)
    navDirection.value = Math.sign(route.no - position.value)
    clicksDirection.value = Math.sign(click - currentClicks.value)
    await navigate(route.no, click)
  }

  const nav = {
    slides,
    total,
    currentPath: computed(() => `/${currentSlideRoute.value?.meta.slide.frontmatter.routeAlias ?? position.value}`),
    currentPage: currentSlideNo,
    currentSlideNo,
    currentSlideRoute,
    currentTransition: computed(() => getCurrentTransition(navDirection.value, currentSlideRoute.value, prevRoute.value)),
    currentLayout: computed(() => currentSlideRoute.value?.meta.layout || (position.value === 1
      ? 'cover'
      : 'default')),
    currentFrontmatter: computed(() => currentSlideRoute.value?.meta.slide.frontmatter ?? {}),
    prevRoute,
    nextRoute,
    hasNext: computed(() => position.value < total.value || currentClicks.value < (clicks.value?.total ?? 0)),
    hasPrev: computed(() => position.value > 1 || currentClicks.value > (clicks.value?.clicksStart ?? 0)),
    clicksContext: computed(() => clicks.value!),
    clicks: currentClicks,
    clicksStart: computed(() => clicks.value?.clicksStart ?? 0),
    clicksTotal: computed(() => clicks.value?.total ?? 0),
    tocTree: useTocTree(slides, currentSlideNo, currentSlideRoute),
    navDirection,
    clicksDirection,
    isPrintMode,
    isPresenter,
    isPlaying: computed(() => true),
    isEmbedded: computed(() => true),
    async openInEditor() { return false },
    next,
    prev,
    go,
    async nextSlide(lastClicks = false) {
      if (position.value < total.value)
        await go(position.value + 1, lastClicks ? 999999 : 0)
    },
    async prevSlide(lastClicks = false) {
      if (position.value > 1)
        await go(position.value - 1, lastClicks ? 999999 : 0)
    },
    goFirst: () => go(1),
    goLast: () => go(total.value),
  }
  activeNavigation = nav
  return nav
}

// The client also calls useNav from directive hooks, outside setup(). Each
// opaque frame owns exactly one navigation instance, with no storage or router.
export function useNav() {
  if (!activeNavigation)
    throw new Error('Slidev navigation is not initialized')
  return activeNavigation
}
