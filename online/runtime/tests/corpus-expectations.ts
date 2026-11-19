// These exclusions cover demo filesystem components, the unavailable embed
// widget and an unbundled icon collection. New missing widgets must fail.
export const titleComponents = [
  'MarkerCore',
  'MarkerPattern',
  'MarkerTips',
  'Marker',
]
export const missingComponents: Record<string, Record<number, string[]>> = {
  'demo/starter/slides.md': {
    7: ['Counter', 'Tweet'],
  },
  'demo/composable-vue/slides.md': {
    2: ['ri-github-line', 'ri-twitter-line', 'ri-user-3-line'],
    11: ['DarkToggle', 'VueUse'],
    12: ['Connections'],
    16: ['VueUse'],
    22: ['VueUse'],
    23: ['VueUse'],
    29: ['VueUse'],
  },
}

export const expectedErrors: Record<string, Record<number, string>> = {
  'demo/starter/slides.md': {
    5: 'File snippets (<<<) are not available online',
    14: 'Slide imports (src:) are not available online',
  },
}
