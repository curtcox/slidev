import { mountMobileTabs } from '../vendor/fragment-kit-v0.4.4/src/ui/mobile-tabs.js'

export function mountWorkspace({ onPrevious, onNext, onDark, onOverview }) {
  const tabs = mountMobileTabs({
    container: document.querySelector('#workspace-tabs'),
    desktop: true,
    breakpoint: 761,
    panels: [
      {
        label: 'Slides',
        panel: document.querySelector('#slides-panel'),
      },
      {
        label: 'Markdown',
        panel: document.querySelector('#markdown-panel'),
      },
      {
        label: 'CSS',
        panel: document.querySelector('#css-panel'),
      },
    ],
  })
  const compact = matchMedia('(max-width: 760px), (max-height: 500px)')
  const fitView = () => tabs.select(compact.matches ? 0 : 'split')
  compact.addEventListener('change', fitView)
  fitView()
  const divider = document.querySelector('#divider')
  function setSplit(clientX) {
    const bounds = document.querySelector('#workspace').getBoundingClientRect()
    const percent = Math.max(25, Math.min(75, (clientX - bounds.left) / bounds.width * 100))
    document.querySelector('#workspace').style.setProperty('--preview-width', `${percent}%`)
    divider.setAttribute('aria-valuenow', String(Math.round(percent)))
  }
  divider.addEventListener('pointerdown', (event) => {
    divider.setPointerCapture(event.pointerId)
    setSplit(event.clientX)
  })
  divider.addEventListener('pointermove', (event) => {
    if (divider.hasPointerCapture(event.pointerId))
      setSplit(event.clientX)
  })
  divider.addEventListener('keydown', (event) => {
    if (![
      'ArrowLeft',
      'ArrowRight',
      'Home',
      'End',
    ].includes(event.key)) {
      return
    }
    event.preventDefault()
    const bounds = document.querySelector('#workspace').getBoundingClientRect()
    const value = Number(divider.getAttribute('aria-valuenow'))
    const next = event.key === 'Home'
      ? 25
      : event.key === 'End'
        ? 75
        : value + (event.key === 'ArrowLeft'
          ? -5
          : 5)
    setSplit(bounds.left + bounds.width * next / 100)
  })
  document.querySelector('#previous-slide').onclick = onPrevious
  document.querySelector('#next-slide').onclick = onNext
  document.querySelector('#overview').onclick = (event) => {
    event.currentTarget.focus()
    onOverview()
  }
  document.querySelector('#dark-mode').onclick = (event) => {
    const dark = event.currentTarget.getAttribute('aria-pressed') !== 'true'
    event.currentTarget.setAttribute('aria-pressed', String(dark))
    onDark(dark)
  }
  return tabs
}
