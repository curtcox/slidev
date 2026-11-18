import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

// This parent-origin bundle parses text only; it never compiles or runs author code.
export default defineConfig({
  build: {
    outDir: 'dist/editor',
    lib: {
      entry: fileURLToPath(new URL('./src/document.ts', import.meta.url)),
      formats: ['es'],
      fileName: () => 'document.js',
    },
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
})
