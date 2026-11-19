/** The two Ace sessions own their text and undo history independently. */
export function createEditors({ markdown, css, onChange, onCursor = () => {} }) {
  const ace = globalThis.ace
  ace.config.set('basePath', new URL('../vendor/ace-1.43.3/', import.meta.url).href)
  let muted = false
  const theme = matchMedia('(prefers-color-scheme: dark)')
  function create(container, mode, label) {
    const editor = ace.edit(container, {
      mode: `ace/mode/${mode}`,
      fontSize: 16,
      showPrintMargin: false,
      wrap: true,
      useWorker: false,
      tabSize: 2,
    })
    editor.textInput.getElement().setAttribute('aria-label', label)
    editor.session.on('change', () => {
      if (!muted)
        onChange()
    })
    return editor
  }
  const source = create(markdown, 'markdown', 'Slide Markdown')
  const styles = create(css, 'css', 'Slide CSS')
  source.selection.on('changeCursor', () => {
    if (!muted && source.isFocused())
      onCursor(source.getCursorPosition().row)
  })
  const updateTheme = () => {
    for (const editor of [source, styles])
      editor.setTheme(`ace/theme/${theme.matches ? 'tomorrow_night' : 'tomorrow'}`)
  }
  theme.addEventListener('change', updateTheme)
  updateTheme()
  const observer = new ResizeObserver(() => {
    source.resize()
    styles.resize()
  })
  observer.observe(markdown)
  observer.observe(css)
  function quietly(work) {
    muted = true
    try {
      work()
    }
    finally {
      muted = false
    }
  }
  return {
    getSource: () => source.getValue(),
    getCSS: () => styles.getValue(),
    setDocument(doc) {
      quietly(() => {
        source.setValue(doc.src, -1)
        styles.setValue(doc.slidev.css, -1)
        source.session.clearAnnotations()
        styles.session.clearAnnotations()
      })
    },
    replaceSource(src) {
      // Drag updates belong in undo history, and must not reset the cursor.
      const selection = source.selection.toJSON()
      quietly(() => {
        source.session.replace({
          start: { row: 0, column: 0 },
          end: {
            row: source.session.getLength(),
            column: 0,
          },
        }, src)
        source.selection.fromJSON(selection)
      })
    },
    reveal(row) {
      quietly(() => {
        source.moveCursorTo(row, 0)
        source.scrollToLine(row, true, false)
      })
    },
    annotate(message, row = 0, column = 0, file = 'slides.md') {
      source.session.clearAnnotations()
      styles.session.clearAnnotations()
      const editor = file === 'style.css'
        ? styles
        : source
      editor.session.setAnnotations(message
        ? [
            {
              row,
              column,
              text: message,
              type: 'error',
            },
          ]
        : [])
    },
    destroy() {
      observer.disconnect()
      theme.removeEventListener('change', updateTheme)
      source.destroy()
      styles.destroy()
    },
  }
}
