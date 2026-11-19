import process from 'node:process'
import { renderGallery } from '../vendor/fragment-kit-v0.4.4/tools/render-gallery.mjs'
import { serve } from '../vendor/fragment-kit-v0.4.4/tools/serve.mjs'

const root = new URL('../', import.meta.url)
const check = process.argv.includes('--check')
const local = check
  ? undefined
  : await serve({ root: new URL('dist/', root).pathname, port: 0 })
try {
  if (local)
    process.env.SLIDEV_GALLERY_URL = local.url
  await renderGallery(new URL('gallery.config.mjs', root).pathname, check)
  console.log(check ? 'Gallery covers and fingerprints are current' : 'Gallery covers rendered in the opaque Slidev preview')
}
finally {
  await new Promise(resolve => local
    ? local.server.close(resolve)
    : resolve())
}
