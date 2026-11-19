import magicMove from '@shikijs/magic-move/style.css?inline'
import reset from '@unocss/reset/tailwind.css?inline'
import code from '../../../packages/client/styles/code.css?inline'
import base from '../../../packages/client/styles/index.css?inline'
import katex from '../../../packages/client/styles/katex.css?inline'
import transitions from '../../../packages/client/styles/transitions.css?inline'
import vars from '../../../packages/client/styles/vars.css?inline'
import clicks from '../../../packages/client/styles/vclick.css?inline'
import online from './runtime.css?inline'

// Direct imports let Vite expand UnoCSS directives in every trusted stylesheet.
// CSS @import expansion happens after UnoCSS's transform and leaves them intact.
export default [
  reset,
  magicMove,
  vars,
  base,
  code,
  katex,
  clicks,
  transitions,
  online,
].join('\n')
