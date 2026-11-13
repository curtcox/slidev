// Diagnostic only. The runner embeds hashes computed from the exact build bytes.
const assets = {}
const cacheName = 'slidevonline-phase0-__VERSION__'

async function verify(response, asset) {
  if (!response?.ok)
    return null
  const body = await response.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', body)
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
  if (hash !== asset.sha256)
    return null
  return new Response(body, {
    headers: { 'Content-Type': asset.type },
  })
}

globalThis.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName)
    await Promise.all(Object.entries(assets).map(async ([path, asset]) => {
      const url = new URL(path, location.origin).href
      const checked = await verify(await fetch(url, { credentials: 'omit' }), asset)
      if (!checked)
        throw new Error(`Unverified offline asset: ${path}`)
      await cache.put(url, checked)
    }))
    await globalThis.skipWaiting()
  })())
})

globalThis.addEventListener('activate', (event) => {
  event.waitUntil(globalThis.clients.claim())
})

globalThis.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  const asset = assets[url.pathname]
  if (url.origin !== location.origin || event.request.method !== 'GET' || !asset)
    return
  event.respondWith((async () => {
    const cache = await caches.open(cacheName)
    const checked = await verify(await cache.match(event.request.url), asset)
    if (checked)
      return checked
    const repaired = await verify(await fetch(event.request), asset)
    if (!repaired)
      throw new Error(`Unverified offline asset: ${url.pathname}`)
    await cache.put(event.request.url, repaired.clone())
    return repaired
  })())
})
