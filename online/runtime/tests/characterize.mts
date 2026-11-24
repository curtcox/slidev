import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { parseSync } from '@slidev/parser/core'
import { chromium, firefox, webkit } from 'playwright'
import YAML from 'yaml'
import { resolveOptions } from '../../../packages/slidev/node/options'
import { templateTitleRendererMd } from '../../../packages/slidev/node/virtual/titles'
import { createLayoutWrapperPlugin } from '../../../packages/slidev/node/vite/layoutWrapper'
import { createMarkdownPlugin } from '../../../packages/slidev/node/vite/markdown'
import { serve } from '../../vendor/fragment-kit-v0.4.4/tools/serve.mjs'
import languages from '../src/compiler/languages.json' with { type: 'json' }

const root = fileURLToPath(new URL('../../../', import.meta.url))
const fixtures = [
  {
    name: 'multiple-drag-sources',
    src: '# Drag elements\n\n<VDrag pos="1,2,100,80">One</VDrag> <VDrag>Two</VDrag> <span v-drag="[100,200,80,60]">Three</span>\n\n<VDragArrow pos="1,2,100,80" />',
  },
  ...Object.keys(languages).map(language => ({
    name: `grammar-${language}`,
    src: `# Grammar ${language}\n\n\`\`\`${language}\n${language === 'cpp'
      ? 'int main() { return 42; }'
      : 'const answer = 42'}\n\`\`\`\n`,
  })),
  {
    name: 'markdown',
    src: `---\ntheme: default\n---\n# Browser compiler\n\nA [slide link](#2), an [external link](https://example.com), and \`{{ literal }}\`.\n\n- [x] Checked task\n\n> [!NOTE]\n> A GitHub alert.\n\nFootnote[^one].\n\n[^one]: Footnote text\n\nInline math: $x^2$.\n`,
  },
  {
    name: 'script-and-style',
    src: `---\ntheme: default\n---\n# Count: {{ count }}\n\n<button @click="count++">Increment</button>\n\n<script setup lang="ts">\nimport { ref } from 'vue'\nconst count = ref<number>(0)\n</script>\n\n<style>h1 { color: red }</style>\n`,
  },
  {
    name: 'slots-and-clicks',
    src: `---\ntheme: seriph\n---\n# First\n\n---\nlayout: two-cols\n---\n# Columns\n\n<v-clicks>\n\n- One\n- Two\n\n</v-clicks>\n\n::right::\n\nA second column.\n`,
  },
  {
    name: 'highlighting',
    src: `---\ntheme: default\n---\n# Code\n\n\`\`\`ts [counter.ts] {1|2}\nconst count: number = 0\nconsole.log(count)\n\`\`\`\n\n\`\`\`text\n<<< this-is-literal-inside-a-fence\n\`\`\`\n`,
  },
  {
    name: 'diagrams-and-drag',
    src: `---\ntheme: default\n---\n# Diagrams\n\n<v-drag>[A draggable box]</v-drag>\n\n\`\`\`mermaid\ngraph TD\n A --> B\n\`\`\`\n`,
  },
  {
    name: 'lazy-grammars',
    src: '# Lazy grammars\n\n```py\ndef greet(name):\n    return f\"Hello {name}\"\n```\n\n```vue\n<script setup lang=\"ts\">const n: number = 1</script>\n<template><div>{{ n }}</div></template>\n```\n\n```rs\nfn main() { println!(\"hello\"); }\n```',
  },
  {
    name: 'magic-move',
    src: `---\ntheme: default\n---\n# Magic Move\n\n\`\`\`\`md magic-move\n\`\`\`ts\nconst count = 1\n\`\`\`\n\`\`\`ts\nconst count = 2\n\`\`\`\n\`\`\`\`\n`,
  },
  {
    name: 'disabled-slides',
    src: '---\ntheme: seriph\nhide: true\n---\n# Hidden cover\n\n---\n\n# First visible\n\n---\ndisabled: true\n---\n# Disabled slide\n\n---\n\n# Last visible',
  },
]

async function transform(plugin: any, source: string, id: string) {
  const hook = typeof plugin.transform === 'function'
    ? plugin.transform
    : plugin.transform.handler
  const result = await hook.call({
    error(error: unknown) { throw error },
  }, source, id)
  return typeof result === 'string'
    ? result
    : result.code
}

const compilerSource = String.raw`
hashbinSandbox.import('runtime/sandbox.js').then(module => {
  onmessage = async ({data}) => {
    try {
      if (data.cache) {
        const src = ['# Cached', '', '\x60\x60\x60not-bundled', 'fn main() {}', '\x60\x60\x60', '---', '# Two'].join('\n');
        const first = await module.createDeckCompiler(src);
        const [a,b] = await Promise.all([first.compile(0,'online:layout/cover'),first.compile(1,'online:layout/default')]);
        const changed = await module.createDeckCompiler(src.replace('# Two','# Edited'));
        const reused = await changed.compile(0,'online:layout/cover');
        const headmatter = await module.createDeckCompiler('---\ntheme: default\ntitle: Changed\n---\n'+src);
        const invalidated = await headmatter.compile(1,'online:layout/default');
        postMessage({ok:true,result:{reused:a===reused,invalidated:b!==invalidated,separateWarnings:a.warnings.length>0&&b.warnings.length===0}});
        return;
      }
      const compiler = await module.createDeckCompiler(data.oversize ? 'é'.repeat(3000000) : data.src,{plantUmlAllowed:data.plantUmlAllowed===true,tokenizeTimeLimit:0});
      const result = data.titles ? await compiler.compileTitles() : await compiler.compile(data.index ?? 0,data.layoutImport ?? 'online:layout/default');
      postMessage({ok:true,result});
    } catch(error) { postMessage({ok:false,error:[String(error),error.stack].filter(Boolean).join("\n")}); }
  };
  postMessage({ready:true});
}).catch(error => postMessage({ok:false,error:String(error)}));
`

async function main() {
  const cache = resolve(root, 'online/runtime/.cache')
  await mkdir(cache, { recursive: true })
  const temporary = await mkdtemp(resolve(cache, 'characterization-'))
  const { server, url } = await serve({
    root: resolve(root, 'online/dist'),
    port: 0,
  })
  const engine = process.env.BROWSER || 'chromium'
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
  try {
    const browserType = ({ chromium, firefox, webkit })[engine as 'chromium' | 'firefox' | 'webkit']
    assert.ok(browserType, `Unknown browser: ${engine}`)
    browser = await browserType.launch()
    const page = await browser.newPage()
    await page.goto(url)
    const expected = []
    const corpusProbes: { fixture: string, src: string, index: number, expectedError?: string, expectedNotice?: string }[] = []
    const corpus = await Promise.all([
      'demo/starter/slides.md',
      'demo/composable-vue/slides.md',
      ...(await readdir(resolve(root, 'online/examples'))).filter(file => file.endsWith('.md')).map(file => `online/examples/${file}`),
    ].map(async path => ({
      name: path.replaceAll('/', '-'),
      src: await readFile(resolve(root, path), 'utf8'),
      corpus: true,
    })))
    for (const fixture of [
      ...fixtures,
      ...corpus,
    ]) {
      const isCorpus = 'corpus' in fixture
      const parsed = parseSync(fixture.src, 'slides.md')
      const visible = parsed.slides.filter(slide => !slide.frontmatter.disabled && !slide.frontmatter.hide)
      // Keep imported slides as one explicit negative case, rather than letting
      // the CLI expand local files that online deliberately cannot access.
      const reference = isCorpus
        ? parsed.slides.map((slide) => {
            const { src, ...frontmatter } = slide.frontmatter
            return `---\n${YAML.stringify({
              ...frontmatter,
              ...(src
                ? { onlineExcludedSrc: src }
                : {}),
            })}---\n${slide.content}\n`
          }).join('\n')
        : fixture.src
      const entry = resolve(temporary, `${fixture.name}.md`)
      await writeFile(entry, reference)
      const options = await resolveOptions({ entry }, 'build')
      // Compare complete tokenization, excluding wall-clock truncation under
      // CI load. Product rendering keeps the CLI's default 500 ms line budget.
      options.utils.shikiOptions.tokenizeTimeLimit = 0
      const markdown = await createMarkdownPlugin(options, {})
      const wrapper = createLayoutWrapperPlugin(options)
      const titleSource = await templateTitleRendererMd.getContent.call({} as any, options)
      expected.push({
        fixture: `${fixture.name} titles`,
        src: fixture.src,
        titles: true,
        sfc: await transform(markdown, titleSource, '/@slidev/title-renderer.md'),
      })
      assert.equal(options.data.slides.length, visible.length, `${fixture.name}: reference must preserve visible slide positions`)
      for (let index = 0; index < options.data.slides.length; index++) {
        const slide = options.data.slides[index]
        if (isCorpus) {
          const original = visible[index]
          let expectedError: string | undefined
          let expectedNotice: string | undefined
          if (original.frontmatter.src) {
            expectedError = 'Slide imports'
          }
          else if (/^<<<\s/m.test(original.content)) {
            expectedError = 'File snippets'
          }
          else if (/^```plantuml\b/m.test(original.content)) {
            expectedNotice = '<OnlinePlantUml'
          }
          else {
            for (const [, lang, info] of original.content.matchAll(/^`{3,}([^\s`]+)([^\n]*)/gm)) {
              if (![
                ...Object.keys(languages),
                ...Object.values(languages).flat(),
                'text',
                'txt',
                'plaintext',
                'mermaid',
              ].includes(lang) && !info.includes('magic-move')) {
                expectedNotice = `Language ${lang} is unavailable; showing plain text`
                break
              }
            }
          }
          if (expectedError || expectedNotice) {
            corpusProbes.push({
              fixture: fixture.name,
              src: fixture.src,
              index,
              expectedError,
              expectedNotice,
            })
            continue
          }
        }
        const id = `slides.md__slidev_${index + 1}.md`
        const sfc = await transform(wrapper, await transform(markdown, slide.content, id), id)
        const layout = slide.frontmatter.layout || (index === 0
          ? 'cover'
          : 'default')
        const layoutImport = `online:layout/${layout}`
        expected.push({
          fixture: fixture.name,
          src: fixture.src,
          index,
          layoutImport,
          sfc: sfc.replace(/import InjectedLayout from "[^"]+"/, `import InjectedLayout from "${layoutImport}"`),
        })
      }
    }
    // This trusted parent harness sends Markdown only as data. All author
    // compilation happens in a fresh SDK-created opaque frame.
    const negative = [
      { src: '# Snippet\n\n<<< ./private.ts', expectedError: 'File snippets' },
      { src: '---\nsrc: ./other.md\n---\n# Imported', expectedError: 'Slide imports' },
      { src: '---\ninvalid: [\n---\n# Broken', expectedError: 'Slide 1' },
      { src: '', oversize: true, expectedError: '5 MiB' },
      { src: '---\nhide: true\n---\n# Hidden\n\n---\ndisabled: true\n---\n# Disabled', expectedError: 'visible slide' },
    ]
    const probes = [
      ...expected.map(({ src, index, layoutImport, titles }) => ({ src, index, layoutImport, titles })),
      ...negative,
      ...corpusProbes,
      { src: '# Runnable\n\n```js {monaco-run}\nconsole.log(1)\n```', expectedNotice: '<Monaco  runnable lang="js"' },
      { src: '# Diagram\n\n```plantuml\n@startuml\nA -> B\n@enduml\n```', expectedNotice: '<OnlinePlantUml', noPlantUml: true },
      { src: '# Diagram\n\n```plantuml\n@startuml\nA -> B\n@enduml\n```', plantUmlAllowed: true, expectedNotice: '<PlantUml' },
      { src: '---\ntwoslash: true\n---\n# Type information\n\n```ts\nconst count = 1\n```', expectedNotice: 'Twoslash is unavailable' },
      { src: '# Unknown\n\n```not-bundled\nplain\n```', expectedNotice: 'Language not-bundled is unavailable; showing plain text' },
      { cache: true },
    ]
    const results = await page.evaluate(`(async () => {
      const { createSandbox } = await import(${JSON.stringify(new URL('vendor/fragment-kit-v0.4.4/vendor/hashbin-sdk-v0.6.0.mjs', url).href)});
      const sandbox = createSandbox({origin:'opaque',execution:'frame',base:${JSON.stringify(url)},proxy:[${JSON.stringify(new URL('runtime/', url).href)}],
        source: ${JSON.stringify(compilerSource)}});
      try {
        const wait = () => new Promise((resolve,reject) => { const timer=setTimeout(() => reject(Error('Compiler frame timed out')),30000); sandbox.onmessage=({data})=>{clearTimeout(timer);resolve(data)}; sandbox.onerror=event=>{clearTimeout(timer);reject(Error(event.message))}; });
        const ready=await wait(); if(!ready.ready)throw Error(JSON.stringify(ready));
        const results=[];
        for(const input of ${JSON.stringify(probes)}) { const result=wait(); sandbox.postMessage(input); results.push(await result); }
        return results;
      } finally { sandbox.terminate(); }
    })()`)
    for (let i = 0; i < expected.length; i++) {
      const actual = results[i]
      assert.equal(actual.ok, true, `${expected[i].fixture}: ${actual.error}`)
      assert.equal(actual.result.sfc, expected[i].sfc, `${expected[i].fixture} slide ${expected[i].index + 1} must match CLI transforms`)
      if (expected[i].fixture.startsWith('grammar-'))
        assert.deepEqual(actual.result.warnings, [], `${expected[i].fixture} must highlight without falling back`)
      assert.ok(actual.result.code.includes('export default'))
      if (expected[i].fixture === 'script-and-style')
        assert.ok(!actual.result.code.includes('ref<number>'), 'TypeScript annotations must be stripped')
    }
    for (let i = 0; i < negative.length; i++) {
      const result = results[expected.length + i]
      assert.equal(result.ok, false, 'Unsupported source must fail visibly')
      assert.ok(result.error.includes(negative[i].expectedError), result.error)
    }
    for (let i = 0; i < corpusProbes.length; i++) {
      const probe = corpusProbes[i]
      const result = results[expected.length + negative.length + i]
      const label = `${probe.fixture} slide ${probe.index + 1}`
      assert.equal(result.ok, !probe.expectedError, `${label}: ${result.error}`)
      assert.ok((probe.expectedError
        ? result.error
        : [result.result.sfc, ...result.result.warnings].join('\n')).includes(probe.expectedError || probe.expectedNotice), label)
    }
    const fallbackProbes = probes.slice(expected.length + negative.length + corpusProbes.length, -1) as { expectedNotice: string, noPlantUml?: boolean }[]
    for (let i = 0; i < fallbackProbes.length; i++) {
      const result = results[expected.length + negative.length + corpusProbes.length + i]
      assert.equal(result.ok, true, result.error)
      assert.ok([result.result.sfc, ...result.result.warnings].join('\n').includes(fallbackProbes[i].expectedNotice))
      if (fallbackProbes[i].noPlantUml)
        assert.ok(!result.result.sfc.includes('<PlantUml'))
    }
    assert.deepEqual(results.at(-1), {
      ok: true,
      result: { reused: true, invalidated: true, separateWarnings: true },
    })
    await writeFile(resolve(cache, `characterization-${engine}.json`), `${JSON.stringify({
      browser: `${engine} ${browser.version()}`,
      scope: 'Compiler output only; complete tokenization compared exactly against CLI transforms with elapsed-time cutoffs disabled in both test compilers. Product rendering retains the default 500 ms per line. Unsupported features checked for visible errors/notices, not counted as exact matches.',
      tokenizeTimeLimit: 0,
      exact: expected.map(({ fixture, index, titles, src }) => ({
        fixture,
        slide: titles
          ? 'titles'
          : index + 1,
        sourceSha256: createHash('sha256').update(src).digest('hex'),
      })),
      fallbacks: corpusProbes.map(({ fixture, index, expectedError, expectedNotice }) => ({
        fixture,
        slide: index + 1,
        expectedError,
        expectedNotice,
      })),
    }, null, 2)}\n`)
    process.stdout.write(`${engine}: ${expected.length} SFCs match CLI; all 40 grammars highlight without fallback; ${corpusProbes.length} corpus fallbacks, unsupported imports, UTF-8 limits and incremental caching pass\n`)
  }
  finally {
    await browser?.close()
    await new Promise<void>(resolve => server.close(resolve))
    await rm(temporary, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
