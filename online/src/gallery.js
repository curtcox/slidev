import { createConfig } from '../vendor/fragment-kit-v0.4.4/src/core/config.js'
import { createUrlState } from '../vendor/fragment-kit-v0.4.4/src/core/url-state.js'
import { mountGallery } from '../vendor/fragment-kit-v0.4.4/src/gallery/gallery.js'
import { slidevDocument } from './document-type.js'
import { examples } from './examples.js'

// Use the served directory so previews, subpath deployments and offline copies
// open their own editor rather than switching to the production origin.
const origin = new URL('./', location.href).href
const config = createConfig({
  slug: 'slidev',
  name: 'Slidev Online',
  storagePrefix: 'slidevonline',
  canonicalOrigin: origin,
  recoveryOrigin: origin,
  repo: 'curtcox/slidev',
  documentType: 'slidev',
  docs: 'docs/index.html',
  gallery: 'gallery.html',
})
mountGallery({
  container: document.querySelector('#gallery'),
  catalog: examples,
  urlState: createUrlState({
    config,
    type: slidevDocument,
    location: { href: origin },
  }),
})
document.querySelector('#gallery-status').remove()
