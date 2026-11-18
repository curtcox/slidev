import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'
import unoConfig from '../../packages/client/uno.config.ts'
import { browserAliases, browserTransforms } from './browser-aliases.ts'
import { checkVirtualModules, virtualModules } from './check-virtual-modules.ts'
import { bundleGrammars } from './grammar-assets.ts'
import { bundleIcons } from './icon-assets.ts'
import { auditThemes } from './theme-audit.ts'

const local = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  plugins: [
    vue(),
    UnoCSS({ ...unoConfig, configFile: false }),
    browserTransforms(),
    auditThemes(),
    bundleIcons(),
    bundleGrammars(),
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
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
})
