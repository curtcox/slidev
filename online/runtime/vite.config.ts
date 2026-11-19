import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'
import unoConfig from '../../packages/client/uno.config.ts'
import { browserAliases, browserTransforms } from './browser-aliases.ts'
import { checkVirtualModules, virtualModules } from './check-virtual-modules.ts'
import { bundleThemeFonts } from './font-assets.ts'
import { bundleGrammars } from './grammar-assets.ts'
import { bundleIcons } from './icon-assets.ts'
import { bundleMathStyles } from './math-assets.ts'
import { auditThemes } from './theme-audit.ts'
import { isolateThemeStyles } from './theme-styles.ts'

const local = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  plugins: [
    vue(),
    UnoCSS({
      ...unoConfig,
      configFile: false,
      theme: {
        fontFamily: {
          sans: 'var(--slidevonline-font-sans)',
          serif: 'var(--slidevonline-font-serif)',
          mono: 'var(--slidevonline-font-mono)',
        },
      },
    }),
    isolateThemeStyles(),
    browserTransforms(),
    auditThemes(),
    bundleIcons(),
    bundleGrammars(),
    bundleMathStyles(),
    bundleThemeFonts(),
    {
      name: 'slidev-online-storage-coverage',
      generateBundle(_options, bundle) {
        for (const output of Object.values(bundle)) {
          if (output.type !== 'chunk')
            continue
          if (Object.keys(output.modules).some(id => id.replaceAll('\\', '/').includes('/packages/client/state/')))
            this.error('Client storage state needs an opaque-origin adapter before it can ship online')
        }
      },
    },
    {
      name: 'slidev-online-virtual-coverage',
      async buildStart() { await checkVirtualModules() },
    },
  ],
  resolve: {
    alias: [
      ...browserAliases,
      ...Object.entries(virtualModules).map(([find, file]) => ({
        find,
        replacement: local(`./src/virtual/${file}`),
      })),
    ],
  },
  define: {
    '__DEV__': 'false',
    '__SLIDEV_HASH_ROUTE__': 'false',
    '__SLIDEV_FEATURE_EDITOR__': 'false',
    '__SLIDEV_HAS_SERVER__': 'false',
    'process.env.NODE_ENV': '"production"',
  },
  build: {
    cssMinify: false,
    lib: {
      entry: local('./src/sandbox-entry.ts'),
      formats: ['es'],
      fileName: () => 'sandbox.js',
      cssFileName: 'sandbox',
    },
    rolldownOptions: {
      // The SDK evaluates a single ESM asset directly. Enable full minification
      // because there is no downstream library consumer to tree shake it.
      output: { codeSplitting: false, minify: true },
    },
  },
})
