import { createPresenterChannel, formatElapsed, isValidSession } from './presenter-sync.js'
import { createPreviewBridge } from './preview-bridge.js'

const status = document.querySelector('#presenter-status')
const positionNode = document.querySelector('#presenter-position')
const titleNode = document.querySelector('#presenter-slide-title')
const prevButton = document.querySelector('#presenter-prev')
const nextButton = document.querySelector('#presenter-next')
const darkButton = document.querySelector('#presenter-dark')
const clockNode = document.querySelector('#presenter-clock')
const timerToggle = document.querySelector('#presenter-timer-toggle')
const timerReset = document.querySelector('#presenter-timer-reset')
const notesNode = document.querySelector('#presenter-notes')
const nextFrameContainer = document.querySelector('#presenter-next-frame')
const nextEmpty = document.querySelector('#presenter-next-empty')

function main() {
  const session = new URLSearchParams(location.search).get('session') ?? ''
  if (!isValidSession(session)) {
    status.textContent = 'Open Presenter view from the Slidev Online editor to sync with your deck.'
    document.body.dataset.presenterReady = 'true'
    return
  }

  // Presentation timer (runs immediately when Presenter opens).
  let elapsedMs = 0
  let running = true
  let startedAt = Date.now()
  const readElapsed = () => running
    ? elapsedMs + (Date.now() - startedAt)
    : elapsedMs
  function renderClock() {
    clockNode.textContent = formatElapsed(readElapsed())
  }
  const clockInterval = setInterval(renderClock, 250)
  renderClock()
  timerToggle.onclick = () => {
    if (running) {
      elapsedMs = readElapsed()
      running = false
      timerToggle.textContent = 'Resume'
    }
    else {
      startedAt = Date.now()
      running = true
      timerToggle.textContent = 'Pause'
    }
    renderClock()
  }
  timerReset.onclick = () => {
    elapsedMs = 0
    startedAt = Date.now()
    renderClock()
  }

  let docState
  let currentRenderedVersion
  let currentRenderedDark
  let currentRenderedSlide
  let currentRenderedClick
  let nextRenderedVersion
  let nextRenderedDark
  let nextRenderedSlide
  let currentReady = false
  let nextReady = false

  const currentBridge = createPreviewBridge({
    container: document.querySelector('#presenter-current'),
    onStatus(state) {
      currentReady = state === 'rendered'
      document.body.dataset.ready = String(currentReady)
      if (state === 'rendered') {
        status.textContent = 'Synced with editor'
        if (docState && docState.run && (docState.slide !== currentRenderedSlide || docState.click !== currentRenderedClick)) {
          currentRenderedSlide = docState.slide
          currentRenderedClick = docState.click
          currentBridge.goto(docState.slide, docState.click)
        }
      }
    },
    onError(message) {
      status.textContent = message
    },
  })

  const nextBridge = createPreviewBridge({
    container: nextFrameContainer,
    onStatus(state) {
      nextReady = state === 'rendered'
      if (state === 'rendered' && docState && docState.run && docState.slide < docState.total) {
        const target = docState.slide + 1
        if (target !== nextRenderedSlide) {
          nextRenderedSlide = target
          nextBridge.goto(target, 0)
        }
      }
    },
    onError() {},
  })

  function stopPreviews(message) {
    currentBridge.stop()
    nextBridge.stop()
    currentReady = false
    nextReady = false
    currentRenderedVersion = undefined
    currentRenderedSlide = undefined
    currentRenderedClick = undefined
    nextRenderedVersion = undefined
    nextRenderedSlide = undefined
    document.body.dataset.ready = 'false'
    nextEmpty.hidden = true
    nextFrameContainer.hidden = false
    if (message)
      status.textContent = message
  }

  function updateChrome() {
    if (!docState || !docState.total) {
      positionNode.textContent = 'No deck'
      titleNode.textContent = 'Current slide'
      prevButton.disabled = true
      nextButton.disabled = true
      darkButton.disabled = true
      notesNode.textContent = 'No speaker notes for this slide.'
      return
    }
    const { slide, click, total, dark, notes, titles, run } = docState
    positionNode.textContent = click > 0
      ? `${slide} / ${total} · click ${click}`
      : `${slide} / ${total}`
    const title = titles[slide - 1]
    titleNode.textContent = title
      ? `${slide}. ${title}`
      : `Slide ${slide}`
    prevButton.disabled = !run || (slide <= 1 && click <= 0)
    nextButton.disabled = !run
    darkButton.disabled = !run
    darkButton.setAttribute('aria-pressed', String(dark))
    darkButton.textContent = dark ? 'Light slides' : 'Dark slides'
    const note = notes[slide - 1] ?? ''
    notesNode.textContent = note || 'No speaker notes for this slide.'
  }

  function syncPreviews() {
    if (!docState)
      return
    updateChrome()
    if (!docState.run || !docState.total) {
      stopPreviews('Preview paused in editor — press Render in the editor to resume.')
      return
    }
    const { src, css, slide, click, total, dark, docVersion } = docState
    if (currentRenderedVersion === docVersion && currentRenderedDark === dark) {
      if (currentReady && (slide !== currentRenderedSlide || click !== currentRenderedClick)) {
        currentRenderedSlide = slide
        currentRenderedClick = click
        currentBridge.goto(slide, click)
      }
    }
    else {
      currentRenderedVersion = docVersion
      currentRenderedDark = dark
      currentRenderedSlide = slide
      currentRenderedClick = click
      currentReady = false
      currentBridge.render({ src, css, slide, click, dark })
    }

    if (slide < total) {
      const nextSlide = slide + 1
      nextEmpty.hidden = true
      nextFrameContainer.hidden = false
      if (nextRenderedVersion === docVersion && nextRenderedDark === dark) {
        if (nextReady && nextSlide !== nextRenderedSlide) {
          nextRenderedSlide = nextSlide
          nextBridge.goto(nextSlide, 0)
        }
      }
      else {
        nextRenderedVersion = docVersion
        nextRenderedDark = dark
        nextRenderedSlide = nextSlide
        nextReady = false
        nextBridge.render({
          src,
          css,
          slide: nextSlide,
          click: 0,
          dark,
        })
      }
    }
    else {
      nextBridge.stop()
      nextReady = false
      nextRenderedVersion = undefined
      nextRenderedSlide = undefined
      nextFrameContainer.hidden = true
      nextEmpty.hidden = false
    }
  }

  const channel = createPresenterChannel(session, (message) => {
    if (message.type === 'document') {
      docState = message
      syncPreviews()
    }
    else if (message.type === 'position') {
      if (!docState || docState.docVersion !== message.docVersion) {
        channel.post({ type: 'hello' })
        return
      }
      docState = {
        ...docState,
        slide: message.slide,
        click: message.click,
        total: message.total,
        dark: message.dark,
        run: message.run,
      }
      syncPreviews()
    }
  })

  prevButton.onclick = () => channel.post({ type: 'prev' })
  nextButton.onclick = () => channel.post({ type: 'next' })
  darkButton.onclick = () => {
    if (!docState)
      return
    channel.post({ type: 'dark', dark: !docState.dark })
  }

  addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey)
      return
    if (event.target?.closest?.('button, a, input, textarea, select'))
      return
    if ([
      'ArrowRight',
      'ArrowDown',
      'PageDown',
      ' ',
    ].includes(event.key)) {
      event.preventDefault()
      channel.post({ type: 'next' })
    }
    else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(event.key)) {
      event.preventDefault()
      channel.post({ type: 'prev' })
    }
  })

  addEventListener('pagehide', () => {
    clearInterval(clockInterval)
    stopPreviews()
    channel.close()
  })

  channel.post({ type: 'hello' })
  document.body.dataset.presenterReady = 'true'
}

main()
