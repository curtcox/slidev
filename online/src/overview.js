import { createDialog, element } from '../vendor/fragment-kit-v0.4.4/src/ui/dialog.js'

/** Titles stay inert on the editor origin; opening the grid never runs a slide. */
export function createSlideOverview({ getSlides, getPosition, onSelect }) {
  const ui = createDialog('Slide overview', { id: 'overview-dialog' })
  const grid = element('ol', null, { className: 'slide-overview' })
  ui.body.append(grid)
  return {
    open() {
      grid.replaceChildren()
      const current = getPosition()
      for (const [index, slide] of getSlides().entries()) {
        const no = index + 1
        const item = element('li')
        const button = element('button', `${no}. ${slide.title.trim().slice(0, 200) || 'Untitled slide'}`, {
          'type': 'button',
          'aria-current': no === current
            ? 'page'
            : 'false',
        })
        button.onclick = () => {
          onSelect(no)
          ui.dialog.close()
        }
        item.append(button)
        grid.append(item)
      }
      ui.open()
      grid.querySelector('[aria-current="page"]')?.focus()
    },
    close: () => ui.dialog.close(),
  }
}
