import { createSandbox } from './sdk.mjs'

const result = document.querySelector('#result')
let sandbox
let timer

function finish(report) {
  clearTimeout(timer)
  globalThis.phase0 = report
  result.textContent = JSON.stringify(report, null, 2)
  sandbox?.terminate()
}

async function main() {
  try {
    const response = await fetch('./fixtures.json')
    if (!response.ok)
      throw new Error(`Fixtures: HTTP ${response.status}`)
    const fixtures = await response.json()
    const base = new URL('./', location.href).href
    sandbox = createSandbox({
      origin: 'opaque',
      container: document.querySelector('#sandbox'),
      base,
      proxy: [new URL('./runtime.js', base).href],
      source: `hashbinSandbox.import('runtime.js').then(m => m.run()).catch(error => postMessage({ type: 'spike:error', message: String(error) }));`,
    })
    timer = setTimeout(finish, 30_000, { error: 'Sandbox probe timed out' })
    sandbox.onerror = event => finish({ error: event.message })
    sandbox.onmessage = ({ data }) => {
      if (data?.type === 'spike:ready') {
        sandbox.postMessage({ type: 'spike:render', fixtures })
      }
      else if (data?.type === 'spike:result') {
        finish({
          sandbox: sandbox.frame.getAttribute('sandbox'),
          frameDisplay: sandbox.frame.style.display,
          ...data.report,
        })
      }
      else if (data?.type === 'spike:error') {
        finish({ error: data.message })
      }
    }
  }
  catch (error) {
    finish({
      error: String(error),
    })
  }
}

main()
