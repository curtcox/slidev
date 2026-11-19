import antfu from '@antfu/eslint-config'

export default antfu({
  pnpm: true,
  formatters: {
    markdown: true,
    css: true,
    slidev: {
      files: [
        '**/slides.md',
        'online/examples/*.md',
        '**/template.md',
        '**/example.md',
        'test/fixtures/markdown/**/*.md',
        'packages/vscode/syntaxes/slidev.example.md',
      ],
    },
  },
  ignores: [
    'skills/**/*.md',
    'plans/**',
    'online/vendor/**',
    'online/test-results/**',
    'online/playwright-report/**',
  ],
})
  .removeRules(
    'vue/no-v-text-v-html-on-component',
    'vue/component-name-in-template-casing',
    'jsonc/sort-array-values',
    'pnpm/yaml-no-duplicate-catalog-item',
  )
  .override('antfu/pnpm/package-json', {
    ignores: [
      'packages/create-theme/template/package.json',
      'packages/create-app/template/package.json',
      // VSCE and OVSX do not support pnpm catalog when reading `@types/vscode`'s version.
      'packages/vscode/package.json',
    ],
  })
  .remove('antfu/markdown/rules')
  .append({
    files: ['online/runtime/package.json'],
    rules: {
      // Theme upgrades require a fresh license, compatibility and size review.
      'pnpm/json-enforce-catalog': [
        'error',
        {
          ignores: [
            '@slidev/theme-default',
            '@slidev/theme-seriph',
            '@slidev/theme-apple-basic',
            '@slidev/theme-bricks',
            '@slidev/theme-shibainu',
          ],
        },
      ],
    },
  })
  .append({
    files: ['online/tests/**/*.test.js'],
    rules: { 'test/no-import-node-test': 'off' },
  })
  .append({
    // Keep code in slides as authored for presentation
    files: ['**/*.md/**'],
    rules: {
      'antfu/reasonable-newline': 'off',
    },
  })
