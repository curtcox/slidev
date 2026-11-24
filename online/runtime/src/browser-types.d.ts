declare module '@vue/compiler-sfc/dist/compiler-sfc.esm-browser.js' {
  export * from '@vue/compiler-sfc'
}
declare const __DEV__: boolean
declare const __SLIDEV_FEATURE_EDITOR__: boolean
declare const __SLIDEV_HAS_SERVER__: boolean
declare const __SLIDEV_HASH_ROUTE__: boolean

declare const hashbinSandbox: {
  import: {
    (url: 'runtime/diagrams/mermaid.js'): Promise<typeof import('./mermaid-entry')>
    (url: 'runtime/highlighting/shiki.js'): Promise<typeof import('./highlighting-entry')>
    (url: 'runtime/math/katex.js'): Promise<typeof import('katex')>
    (url: 'runtime/monaco/monaco.js'): Promise<typeof import('./monaco-entry')>
  }
}
