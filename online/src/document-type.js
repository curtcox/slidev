import { bytes, MAX_BYTES } from '../vendor/fragment-kit-v0.4.4/src/core/bytes.js'

function isPlainObject(value) {
  if (value === null || typeof value !== 'object')
    return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

export const slidevDocument = Object.freeze({
  type: 'slidev',
  fileName: 'slides.md',
  contentType: 'text/markdown',
  settingsKeys: Object.freeze(['slide']),
  normalize(value) {
    if (!isPlainObject(value) || !Object.hasOwn(value, 'src') || typeof value.src !== 'string')
      throw new Error('Slidev source must be Markdown text')
    if (Object.keys(value).some(key => key !== 'src' && key !== 'slidev'))
      throw new Error('Unrecognized Slidev document field')
    const options = value.slidev === undefined
      ? {}
      : value.slidev
    if (!isPlainObject(options))
      throw new Error('Slidev document settings must be an object')
    const css = options.css === undefined
      ? ''
      : options.css
    if (typeof css !== 'string')
      throw new TypeError('Slidev styles must be CSS text')
    if (value.src.length + css.length > MAX_BYTES
      || bytes(value.src).length + bytes(css).length > MAX_BYTES) {
      throw new Error('The document must contain at most 5 MiB of Markdown and CSS')
    }
    return {
      src: value.src,
      slidev: { ...options, css },
    }
  },
  isDefault({ slidev }) {
    // The compact link carries only the source. Keep all extension data in an
    // envelope, even with empty CSS, so older editors can preserve it.
    return slidev.css === '' && Object.keys(slidev).length === 1
  },
})
