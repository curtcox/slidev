import { createSandbox } from './sdk.mjs'

async function main() {
  let pending
  let resolveReady
  let rejectReady
  const ready = new Promise((resolve, reject) => {
    resolveReady = resolve
    rejectReady = reject
  })
  ready.catch(() => {})
  const css = await fetch('./runtime.css').then(response => response.text())
  const base = new URL('./', location.href).href
  const sandbox = createSandbox({
    origin: 'opaque',
    execution: 'frame',
    container: document.querySelector('#preview'),
    base,
    proxy: [new URL('./runtime.js', base).href],
    source: `const runtime = await hashbinSandbox.import('runtime.js'); runtime.run();`,
  })
  sandbox.frame.style.cssText = 'display:block;width:980px;height:552px;border:0'
  sandbox.frame.title = 'Opaque Slidev fidelity preview'
  sandbox.onerror = (event) => {
    const error = new Error(event.message)
    rejectReady(error)
    pending?.reject(error)
  }
  sandbox.onmessage = ({ data }) => {
    if (data?.type === 'fidelity:ready')
      resolveReady()
    if (data?.type === 'fidelity:rendered')
      pending?.resolve(data)
    if (data?.type === 'fidelity:error')
      pending?.reject(new Error(data.error))
  }
  globalThis.fidelityRender = async (src, index) => {
    await ready
    return new Promise((resolve, reject) => {
      pending = { resolve, reject }
      sandbox.postMessage({
        type: 'fidelity:render',
        src,
        index,
        css,
      })
    })
  }
}

main().catch((error) => {
  globalThis.fidelityRender = () => Promise.reject(error)
})
