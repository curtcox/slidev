import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { browserAliases, browserTransforms } from './browser-aliases.ts'

const local = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  plugins: [
    vue(),
    browserTransforms(),
  ],
  resolve: {
    alias: [
      ...browserAliases,
      {
        find: '#slidev/configs',
        replacement: local('./src/virtual/configs.ts'),
      },
      {
        find: '#slidev/global-layers',
        replacement: local('./src/virtual/global-layers.ts'),
      },
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
