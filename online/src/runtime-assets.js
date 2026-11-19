/** Download trusted runtime bytes early; the SDK alone executes them in a frame. */
export function createRuntimeAssets({ base = new URL('../', import.meta.url), fetchSource = globalThis.fetch.bind(globalThis) } = {}) {
  const urls = new Set(['runtime/sandbox.js', 'runtime/sandbox.css'].map(path => new URL(path, base).href))
  const pending = new Map()
  function request(url) {
    if (!pending.has(url)) {
      const operation = fetchSource(url, { credentials: 'omit' }).then((response) => {
        if (!response.ok)
          pending.delete(url)
        return response
      })
      pending.set(url, operation)
      // A failed speculative download must neither reject globally nor prevent
      // Render from retrying. Only the SDK reports execution-time failures.
      void operation.catch(() => pending.delete(url))
    }
    return pending.get(url)
  }
  return {
    preload() {
      for (const url of urls)
        request(url)
    },
    fetch(input, options) {
      const url = String(input)
      if (!urls.has(url) || options?.credentials !== 'omit' || (options.method && options.method !== 'GET'))
        return fetchSource(input, options)
      return request(url).then(response => response.clone())
    },
  }
}

const assets = createRuntimeAssets()
export const fetchRuntimeAsset = assets.fetch
if (globalThis.location && new URL(location.href).searchParams.get('run') !== '0')
  assets.preload()
