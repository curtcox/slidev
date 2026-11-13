import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

const local = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  plugins: [
    vue(),
  ],
  resolve: {
    alias: {
      '#slidev/configs': local('./src/virtual/configs.ts'),
      '#slidev/global-layers': local('./src/virtual/global-layers.ts'),
    },
  },
  define: { '__DEV__': 'false', '__SLIDEV_HASH_ROUTE__': 'false', 'process.env.NODE_ENV': '"production"' },
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
