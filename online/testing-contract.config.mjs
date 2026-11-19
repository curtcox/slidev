export default {
  source: text => `# ${text}`,
  ready: 'body[data-editor-ready="true"]',
  editor: '#slides-panel',
  status: '#preview-status',
  draftKey: 'slidevonline:draft',
  share: '#share',
  qr: '#qr',
  kitURL: './vendor/fragment-kit-v0.4.4/src/index.js',
  tabs: ['Slides', 'Markdown', 'CSS'],
  cachePrefix: 'slidevonline-',
  configureHashBin: async (context, clientId) => {
    await context.route('**/fragment-kit.config.json', async (route) => {
      const response = await route.fetch()
      await route.fulfill({
        json: {
          ...await response.json(),
          hashbinClientId: clientId,
        },
      })
    })
  },
  build: (page, doc, canonical = false) => page.evaluate(async ({ doc, canonical }) => {
    const { createConfig } = await import('./vendor/fragment-kit-v0.4.4/src/core/config.js')
    const { createWorkspaceUrls } = await import('./src/links.js')
    const input = await (await fetch('fragment-kit.config.json')).json()
    const config = createConfig({ ...input, canonicalOrigin: input.recoveryOrigin })
    return createWorkspaceUrls({
      config,
      getSlide: () => 1,
    }).build(doc, canonical
      ? { url: config.canonicalOrigin }
      : {}).href
  }, { doc, canonical }),
  getSource: page => page.evaluate(() => globalThis.ace.edit('markdown-editor').getValue()),
  getDocument: page => page.evaluate(() => ({
    src: globalThis.ace.edit('markdown-editor').getValue(),
    slidev: {
      css: globalThis.ace.edit('css-editor').getValue(),
    },
  })),
  edit: async (page, value) => {
    await page.evaluate((value) => {
      if (typeof value === 'string') {
        globalThis.ace.edit('markdown-editor').setValue(value, -1)
      }
      else {
        globalThis.ace.edit('markdown-editor').setValue(value.src, -1)
        globalThis.ace.edit('css-editor').setValue(value.slidev?.css ?? '', -1)
      }
    }, value)
  },
}
