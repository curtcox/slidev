// Exclude the umbrella package's JSX/Node transformers from the browser graph.
export { createGenerator, mergeConfigs } from '@unocss/core'
export { default as presetAttributify } from '@unocss/preset-attributify'
export { default as presetTypography } from '@unocss/preset-typography'
export { default as presetWind3 } from '@unocss/preset-wind3'
export { default as transformerDirectives } from '@unocss/transformer-directives'
export { default as transformerVariantGroup } from '@unocss/transformer-variant-group'

export function defineConfig<T>(config: T): T {
  return config
}
