const assert = require('node:assert/strict')
const process = require('node:process')
const { expect } = require('@playwright/test')
const { chromium, firefox, webkit } = require('playwright')
const suite = require('../../ai-suite.json')

const original = {
  src: '# Original\n\n<!-- Keep my note. -->\n',
  slidev: { css: 'h1 { color: blue; }\n' },
}
const proposed = {
  src: '# AI proposal\n\n<script setup>globalThis.aiExecutions = (globalThis.aiExecutions || 0) + 1</script>\n\n<!-- Keep my note. -->\n',
  slidev: { css: 'h1 { color: purple; }\n' },
}
const output = {
  summary: '<img src=x onerror="throw 1"> Updated slides and CSS',
  edits: [
    { path: '/src', find: '# Original', replace: proposed.src.split('\n\n<!--')[0] },
    { path: '/slidev/css', find: 'blue', replace: 'purple' },
  ],
}

async function main() {
  const engine = process.argv[3] || process.env.BROWSER || 'chromium'
  const browser = await ({ chromium, firefox, webkit })[engine].launch()
  try {
    // Service workers can bypass Playwright routes. Keep provider mocks in a
    // context without them, and test offline paste separately without any key.
    const context = await browser.newContext({ serviceWorkers: 'block' })
    const page = await context.newPage()
    const errors = []
    const requests = []
    let paidCalls = 0
    page.on('pageerror', error => errors.push(String(error)))
    page.on('request', request => requests.push(request.url()))
    await context.route('**/fragment-kit.config.json', async (route) => {
      const response = await route.fetch()
      const config = await response.json()
      config.ai.models.push({ ...config.ai.models[0], ref: 'openai:comparison-fixture' })
      await route.fulfill({ json: config })
    })
    await context.route('https://api.openai.com/**', async (route) => {
      paidCalls++
      const body = route.request().postDataJSON()
      const input = JSON.parse(body.messages.at(-1).content)
      const task = suite.cases.find(item => item.request === input.request && item.base.src === input.document.src)
      const text = JSON.stringify(task
        ? {
            summary: task.id,
            edits: task.base.src === task.reference.good.src
              ? []
              : [
                  { path: '/src', find: task.base.src, replace: task.reference.good.src },
                ],
            settings: { slidev: task.reference.good.slidev },
          }
        : { ...output, summary: 'Mocked provider proposal' })
      if (!body.stream) {
        await route.fulfill({
          json: {
            model: body.model,
            choices: [
              {
                message: { content: text },
                finish_reason: 'stop',
              },
            ],
            usage: { prompt_tokens: 100, completion_tokens: 30 },
          },
        })
        return
      }
      await route.fulfill({
        contentType: 'text/event-stream',
        body: `data: ${JSON.stringify({
          model: body.model,
          choices: [
            {
              delta: { content: text },
              finish_reason: 'stop',
            },
          ],
        })}\n\ndata: ${JSON.stringify({
          choices: [],
          usage: { prompt_tokens: 100, completion_tokens: 30 },
        })}\n\ndata: [DONE]\n\n`,
      })
    })
    const base = process.argv[2] || 'http://127.0.0.1:8000/'
    await page.goto(base)
    await page.waitForSelector('body[data-ready="true"]')
    assert.equal(paidCalls, 0)
    assert.equal(requests.some(url => url.endsWith('/src/ai.mjs') || url.includes('/src/ai/')), false)
    const setDocument = doc => page.evaluate((doc) => {
      globalThis.ace.edit('markdown-editor').setValue(doc.src, -1)
      globalThis.ace.edit('css-editor').setValue(doc.slidev.css, -1)
    }, doc)
    const getDocument = () => page.evaluate(() => ({
      src: globalThis.ace.edit('markdown-editor').getValue(),
      slidev: {
        css: globalThis.ace.edit('css-editor').getValue(),
      },
    }))
    await setDocument(original)
    await expect(page.frameLocator('#preview iframe').locator('h1')).toHaveText('Original')
    const live = page.frames().find(frame => frame.parentFrame())
    await live.evaluate(() => {
      globalThis.livePreviewMarker = 42
    })
    await page.locator('#ask-ai').click()
    const ask = page.locator('#ai-ask-dialog')
    await ask.getByLabel('Describe a change').fill('Update the heading and its color. Preserve my note.')
    await ask.getByRole('button', { name: 'Copy prompt', exact: true }).click()
    await expect(ask).toContainText('Prompt ready')
    await ask.getByLabel('Paste model reply').fill(JSON.stringify(output))
    await ask.getByRole('button', { name: 'Review pasted reply' }).click()
    await expect(ask.locator('.fk-ai-diff')).toContainText('AI proposal')
    await expect(ask).toContainText(output.summary)
    await expect(ask.locator('img')).toHaveCount(0)
    await ask.getByRole('button', { name: 'Check proposal', exact: true }).click()
    await expect(ask.locator('#ai-check-status')).toContainText('All 1 slides compile', { timeout: 30000 })
    assert.equal(await live.evaluate(() => globalThis.livePreviewMarker), 42)
    assert.deepEqual(await getDocument(), original)
    await ask.locator('#ai-accept').click()
    assert.deepEqual(await getDocument(), proposed)
    await expect(page.locator('#preview iframe')).toHaveCount(0)
    await expect(page.locator('#preview-status')).toContainText('AI change applied')
    await expect.poll(() => new URL(page.url()).searchParams.get('run')).toBe('0')
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('slidevonline:draft')).src)).toBe(proposed.src)
    await ask.getByRole('button', { name: 'Undo AI change' }).click()
    assert.deepEqual(await getDocument(), original)
    await expect(page.locator('#preview iframe')).toHaveCount(0)
    // Review again, accept, then protect a later manual edit from AI Undo.
    await ask.getByLabel('Describe a change').fill('Apply that heading and color again.')
    await ask.getByRole('button', { name: 'Copy prompt', exact: true }).click()
    await expect(ask).toContainText('Prompt ready')
    await ask.getByRole('button', { name: 'Review pasted reply' }).click()
    await ask.locator('#ai-accept').click()
    await setDocument({ ...proposed, src: `${proposed.src}\nManual edit\n` })
    await ask.getByRole('button', { name: 'Undo AI change' }).click()
    await expect(ask).toContainText('The document changed after accepting')
    assert.match((await getDocument()).src, /Manual edit/)
    await ask.locator('.fk-close').click()
    await page.reload()
    await page.waitForSelector('body[data-editor-ready="true"]')
    await expect(page.locator('#preview iframe')).toHaveCount(0)
    await page.locator('#render').click()
    await page.waitForSelector('body[data-ready="true"]')
    assert.equal(await page.frameLocator('#preview iframe').locator('h1').textContent(), 'AI proposal')
    assert.equal(await page.frames().find(frame => frame.parentFrame()).evaluate(() => globalThis.aiExecutions), 1)
    assert.equal(await page.evaluate(() => globalThis.aiExecutions), undefined)

    // Direct provider calls remain blocked by consent and zero default budgets.
    await setDocument(original)
    await expect(page.frameLocator('#preview iframe').locator('h1')).toHaveText('Original')
    await page.locator('#ask-ai').click()
    await ask.getByLabel('Describe a change').fill('Change the heading and color')
    await ask.getByLabel('Change model').selectOption('openai:gpt-4.1-mini-2025-04-14')
    await expect(ask.locator('#ai-send')).toBeEnabled()
    await ask.locator('#ai-send').click()
    await expect(ask).toContainText('allow sending first')
    await ask.getByLabel('Allow sending this document').check()
    await ask.locator('#ai-send').click()
    await expect(ask).toContainText('AI budget reached')
    assert.equal(paidCalls, 0)
    await ask.locator('.fk-close').click()
    await page.locator('#ai-settings-action').click()
    const settings = page.locator('#ai-settings')
    await settings.getByLabel('Provider', { exact: true }).selectOption('openai')
    await settings.getByLabel('API key', { exact: true }).fill('test-key-never-store')
    await settings.getByRole('button', { name: 'Connect key', exact: true }).click()
    await expect(settings.getByLabel('API key', { exact: true })).toHaveValue('')
    for (const period of ['total', 'day', 'month'])
      await settings.getByLabel(`${period} spending cap`).fill('1')
    await settings.getByRole('button', { name: 'Set spending caps' }).click()
    await settings.locator('.fk-close').click()
    await page.locator('#ask-ai').click()
    await ask.getByLabel('Allow sending this document').check()
    await ask.locator('#ai-send').click()
    await expect(ask).toContainText('Mocked provider proposal')
    assert.equal(paidCalls, 1)
    assert.deepEqual(await getDocument(), original)
    await ask.locator('#ai-accept').click()
    await expect(page.locator('#preview iframe')).toHaveCount(0)
    assert.deepEqual(await getDocument(), proposed)
    assert.equal(await page.evaluate(() => JSON.stringify({
      local: { ...localStorage },
      session: { ...sessionStorage },
      href: location.href,
    }).includes('test-key-never-store')), false)
    await ask.locator('.fk-close').click()

    await page.locator('#ai-compare-action').click()
    const compare = page.locator('#ai-compare')
    await expect(compare).toBeVisible()
    await expect(compare).toContainText('Select 2–4 models')
    for (const model of ['openai:gpt-4.1-mini-2025-04-14', 'openai:comparison-fixture'])
      await compare.locator(`input[value="${model}"]`).check()
    await compare.getByLabel('Comparison spending cap').fill('1')
    await compare.getByLabel('Allow comparison requests').check()
    await compare.getByRole('button', { name: 'Run comparison', exact: true }).click()
    await expect(compare).toContainText('Comparison complete', { timeout: 60000 })
    assert.match(await compare.locator('table').textContent(), /6\/6/, JSON.stringify(await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.includes(':ai:eval:')).map(([, value]) => JSON.parse(value)))))
    await page.locator('#ai-compare .fk-close').click()
    // A new explicit load cancels any proposal made for the old document.
    await page.locator('#ask-ai').click()
    await ask.getByLabel('Change model').selectOption('paste:chat')
    await ask.getByRole('button', { name: 'Copy prompt', exact: true }).click()
    await expect(ask).toContainText('Prompt ready')
    await ask.locator('.fk-close').click()
    await page.goto(`${base}?run=0&example=welcome`)
    await page.waitForSelector('body[data-editor-ready="true"]')
    await page.locator('#ask-ai').click()
    await ask.getByLabel('Paste model reply').fill(JSON.stringify(output))
    await ask.getByRole('button', { name: 'Review pasted reply' }).click()
    await expect(ask).toContainText('Prepare a prompt first')
    await ask.locator('.fk-close').click()

    const references = await page.evaluate(async () => {
      const { slidevAiDocument } = await import('./src/ai-type.js')
      const { parseSuite, validateReferences } = await import('./vendor/fragment-kit-v0.4.4/src/ai/index.js')
      const suite = parseSuite(await (await fetch('./ai-suite.json')).json(), slidevAiDocument)
      await validateReferences(suite, slidevAiDocument)
      return suite.cases.map(item => item.id)
    })
    assert.equal(references.length, 6)

    // Only the editable files enter prompts. Preserve extensions through apply,
    // Undo and URL history, including a CSS update from an empty stylesheet.
    const extensionURL = await page.evaluate(async () => {
      const { createConfig } = await import('./vendor/fragment-kit-v0.4.4/src/core/config.js')
      const { createWorkspaceUrls } = await import('./src/links.js')
      const input = await (await fetch('./fragment-kit.config.json')).json()
      const urls = createWorkspaceUrls({
        config: createConfig({ ...input, canonicalOrigin: input.recoveryOrigin }),
        getSlide: () => 1,
      })
      return urls.build({
        src: '# Extension\n',
        slidev: {
          css: '',
          future: { private: 'preserved extension' },
        },
      }, { run: false }).href
    })
    await page.evaluate((href) => {
      location.hash = new URL(href).hash
    }, extensionURL)
    await expect.poll(async () => (await getDocument()).src).toBe('# Extension\n')
    await page.locator('#ask-ai').click()
    await ask.getByLabel('Describe a change').fill('Add purple headings in CSS')
    await ask.getByRole('button', { name: 'Copy prompt', exact: true }).click()
    await expect(ask).toContainText('Prompt ready')
    await expect(ask.locator('details pre')).not.toContainText('preserved extension')
    await ask.getByLabel('Paste model reply').fill(JSON.stringify({
      summary: 'Add CSS',
      edits: [],
      settings: {
        slidev: { css: 'h1 { color: purple }' },
      },
    }))
    await ask.getByRole('button', { name: 'Review pasted reply' }).click()
    await ask.locator('#ai-accept').click()
    await expect.poll(async () => (await getDocument()).slidev.css).toBe('h1 { color: purple }')
    const fromURL = () => page.evaluate(async () => {
      const { slidevDocument } = await import('./src/document-type.js')
      const { createUrlState } = await import('./vendor/fragment-kit-v0.4.4/src/core/url-state.js')
      return createUrlState({ config: {}, type: slidevDocument }).parse(location.href).doc
    })
    assert.deepEqual((await fromURL()).slidev.future, { private: 'preserved extension' })
    await ask.getByRole('button', { name: 'Undo AI change' }).click()
    assert.deepEqual((await fromURL()).slidev, {
      css: '',
      future: { private: 'preserved extension' },
    })
    await ask.locator('.fk-close').click()

    await context.close()
    const offlineContext = await browser.newContext()
    const offlinePage = await offlineContext.newPage()
    offlinePage.on('pageerror', error => errors.push(String(error)))
    await offlinePage.goto(new URL('?run=0', base).href)
    await expect(offlinePage.locator('#offline-status')).toHaveText('Available offline', { timeout: 60000 })
    await offlineContext.setOffline(true)
    await offlinePage.reload()
    await offlinePage.waitForSelector('body[data-editor-ready="true"]')
    await offlinePage.locator('#ask-ai').click()
    const offlineAsk = offlinePage.locator('#ai-ask-dialog')
    await offlineAsk.getByLabel('Describe a change').fill('Add CSS while offline')
    await offlineAsk.getByRole('button', { name: 'Copy prompt', exact: true }).click()
    await expect(offlineAsk).toContainText('Prompt ready')
    await offlineAsk.getByLabel('Paste model reply').fill(JSON.stringify({
      summary: 'Offline CSS',
      edits: [],
      settings: {
        slidev: { css: 'h1 { color: purple }' },
      },
    }))
    await offlineAsk.getByRole('button', { name: 'Review pasted reply' }).click()
    await offlineAsk.getByRole('button', { name: 'Check proposal', exact: true }).click()
    await expect(offlineAsk.locator('#ai-check-status')).toContainText('All 1 slides compile', { timeout: 30000 })
    await offlineAsk.locator('#ai-accept').click()
    await expect(offlinePage.locator('#preview iframe')).toHaveCount(0)
    assert.equal(await offlinePage.evaluate(() => globalThis.ace.edit('css-editor').getValue()), 'h1 { color: purple }')
    assert.deepEqual(errors, [])
    await offlineContext.close()
    process.stdout.write(`${engine}: opt-in AI, paste review, isolated checks, paused apply/reload, guarded undo, consent, budgets, mocked provider, key privacy, 12 successful comparison results, extension preservation and first-use offline AI passed\n`)
  }
  finally { await browser.close() }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
