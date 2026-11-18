declare module '@vue/compiler-sfc/dist/compiler-sfc.esm-browser.js' {
  export * from '@vue/compiler-sfc'
}
declare const __DEV__: boolean
declare const __SLIDEV_FEATURE_EDITOR__: boolean
declare const __SLIDEV_HAS_SERVER__: boolean
declare const __SLIDEV_HASH_ROUTE__: boolean

declare const hashbinSandbox: {
  import: (url: string) => Promise<typeof import('./mermaid-entry')>
}
